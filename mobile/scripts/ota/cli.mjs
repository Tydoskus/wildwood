import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, appendFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { androidVersionCode } from '../version-code.mjs';
import { root, mobile, stateDir, committedBaselines, NATIVE_DIRS, NATIVE_FILES, json, writeJson, digest, compatibility, assertCompatible, signed, readSigned, readBaselines, compatibleRange, newestCompatibleRange, nativeFiles, signingKey, directoryDigest } from './common.mjs';
const [command, ...args] = process.argv.slice(2);
const flag = name => { const i = args.indexOf(`--${name}`); if (i < 0 || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing --${name}`); return args[i + 1]; };
const optionalFlag = name => args.includes(`--${name}`) ? flag(name) : undefined;
const platform = () => { const p = flag('platform'); if (!['ios', 'android'].includes(p)) throw new Error('Use ios or android.'); return p; };
const buildNumber = () => { const n = Number(flag('build')); if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Invalid native build number.'); return n; };
const validId = id => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(id) && id !== 'public';
const validRepo = repo => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
const run = (cmd, argv, cwd) => { const r = spawnSync(cmd, argv, { cwd, stdio: 'inherit' }); if (r.status !== 0) throw new Error(`${cmd} failed`); };
const feedPath = (channel, p) => resolve(root, `public/ota/${channel}-${p}.json`);
const exists = async path => { try { await stat(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
/** In GitHub Actions a skip shows as a notice on the run page, not just a log line. */
const notice = message => console.log(process.env.GITHUB_ACTIONS ? `::notice title=Android OTA::${message}` : message);
async function nextSequence(path) { try { return Math.max(Date.now(), (await readSigned(path)).sequence + 1); } catch (e) { if (e.code !== 'ENOENT') throw e; return Date.now(); } }
async function inspectArtifact(path) {
  const meta = await json(resolve(path, 'artifact.json'));
  const bytes = await readFile(resolve(path, 'bundle.zip'));
  const key = (await json(resolve(mobile, 'ota/public-key.json'))).pem;
  if (digest(bytes) !== meta.bundle.checksum || !verify('sha256', bytes, key, Buffer.from(meta.bundle.signature, 'base64'))) throw new Error('Artifact bytes or signature changed. Rebuild it.');
  return meta;
}
/** The recorded baseline for one build, plus every recorded build sharing its native code. */
async function baselineFor(p, build) {
  const baselines = await readBaselines(p);
  const baseline = baselines.find(b => b.build === build);
  if (!baseline) throw new Error(`No baseline for ${p} build ${build}. Record it with the baseline command when you build that app.`);
  return { baseline, ...compatibleRange(baselines, baseline) };
}
async function writeFeed(channel, p, meta, bundle, { path = feedPath(channel, p), history = true } = {}) {
  const minBuild = meta.minBuild ?? meta.build, maxBuild = meta.maxBuild ?? meta.build;
  // `protocol` stays in the announcement so apps that still compare it refuse
  // a bundle with a different one cleanly. Newer apps ignore it.
  const manifest = { schema: 1, channel, platform: p, sequence: await nextSequence(path), runtime: meta.runtime, saveFormat: meta.saveFormat, protocol: meta.protocol, minBuild, maxBuild, bundle };
  const envelope = await signed(JSON.stringify(manifest));
  await writeJson(path, envelope);
  if (history) await writeJson(resolve(stateDir, 'history', `${manifest.sequence}-${channel}-${p}.json`), envelope);
  console.log(`Prepared ${channel} announcement for ${p} builds ${minBuild}–${maxBuild}: ${path}`);
  return manifest;
}
/** Zip mobile/www, sign it, and keep it as an immutable artifact directory. */
async function packageBundle({ p, staged, range, id }) {
  const dir = resolve(mobile, '.build/ota', id);
  await mkdir(resolve(mobile, '.build/ota'), { recursive: true });
  await mkdir(dir, { recursive: false }); // Immutable IDs, never overwrite an artifact.
  const archive = resolve(dir, 'bundle.zip');
  run('/usr/bin/zip', ['-q', '-r', archive, '.', '-x', '*.map', '*.DS_Store'], resolve(mobile, 'www'));
  const bytes = await readFile(archive);
  const signature = sign('sha256', bytes, await signingKey()).toString('base64');
  await writeJson(resolve(dir, 'artifact.json'), { ...staged, platform: p, build: range.maxBuild, minBuild: range.minBuild, maxBuild: range.maxBuild, bundle: { id, checksum: digest(bytes), signature } });
  await inspectArtifact(dir);
  return dir;
}
function assertPublicRepo(repo) {
  const result = spawnSync('gh', ['repo', 'view', repo, '--json', 'visibility'], { encoding: 'utf8' });
  if (result.status !== 0 || JSON.parse(result.stdout).visibility !== 'PUBLIC') throw new Error('OTA downloads need a public artifact URL. Use a public repository or your own HTTPS host.');
}
/** One GitHub prerelease per bundle; returns the bundle's download URL. */
async function uploadRelease(artifact, meta, repo, notesLine) {
  const tag = `ota-${meta.bundle.id}`;
  const notes = resolve(artifact, 'release-notes.txt');
  await writeFile(notes, `WildStat OTA bundle ${meta.bundle.id}.\nTarget: ${meta.platform} native builds ${meta.minBuild ?? meta.build}–${meta.maxBuild ?? meta.build}.\n${notesLine}\n`);
  run('gh', ['release', 'create', tag, resolve(artifact, 'bundle.zip'), resolve(artifact, 'artifact.json'), '--repo', repo, '--title', `WildStat OTA ${meta.bundle.id}`, '--notes-file', notes, '--prerelease', ...(process.env.GITHUB_SHA ? ['--target', process.env.GITHUB_SHA] : [])], root);
  return `https://github.com/${repo}/releases/download/${tag}/bundle.zip`;
}
async function download(url, { attempts = 1 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) }).catch(error => ({ ok: false, status: error.message }));
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (response.status === 404 && attempt >= attempts) return null;
    if (attempt >= attempts) throw new Error(`Download returned ${response.status}: ${url}`);
    await new Promise(r => setTimeout(r, 5000));
  }
}
/** Never announce a URL before checking the hosted bytes are the signed ones. */
async function assertHosted(url, meta, attempts = 1) {
  const bytes = await download(url, { attempts });
  if (!bytes) throw new Error(`Hosted artifact is missing: ${url}`);
  const key = (await json(resolve(mobile, 'ota/public-key.json'))).pem;
  if (digest(bytes) !== meta.bundle.checksum || !verify('sha256', bytes, key, Buffer.from(meta.bundle.signature, 'base64'))) throw new Error('Hosted artifact differs from the signed bundle.');
}
/** An already-published, intact artifact for this exact web bundle, or null. */
async function reusableRelease(repo, id, staged) {
  const base = `https://github.com/${repo}/releases/download/ota-${id}`;
  const metaBytes = await download(`${base}/artifact.json`);
  if (!metaBytes) return null;
  const meta = JSON.parse(metaBytes.toString('utf8'));
  if (meta.bundle?.id !== id || meta.platform !== staged.platform) return null;
  try { assertCompatible(meta, staged); await assertHosted(`${base}/bundle.zip`, meta); }
  catch (error) { console.log(`Existing release ota-${id} is not usable (${error.message}); publishing a fresh one.`); return null; }
  return { meta, url: `${base}/bundle.zip` };
}
const releaseExists = (repo, tag) => spawnSync('gh', ['release', 'view', tag, '--repo', repo, '--json', 'tagName'], { stdio: 'ignore' }).status === 0;
/** A baseline can only be matched later if the native files are exactly what is committed. */
function assertNativeCommitted(files) {
  const paths = [...NATIVE_DIRS, ...NATIVE_FILES];
  const status = spawnSync('git', ['status', '--porcelain', '--', ...paths], { cwd: root, encoding: 'utf8' });
  if (status.status !== 0) throw new Error('Could not read git status for the native files.');
  if (status.stdout.trim()) throw new Error(`Commit the native changes first; CI matches baselines against the committed tree:\n${status.stdout}`);
  const tracked = spawnSync('git', ['ls-files', '--', ...paths], { cwd: root, encoding: 'utf8' });
  const set = new Set(tracked.stdout.split('\n').filter(Boolean));
  const local = files.map(file => relative(root, file).replace(/\\/g, '/')).filter(file => !set.has(file));
  if (local.length) throw new Error(`These native files are not committed, so CI could never match this baseline:\n${local.join('\n')}`);
}
try {
  if (command === 'keygen') {
    await mkdir(stateDir, { recursive: true });
    const path = resolve(stateDir, 'signing-private.pem');
    try { await stat(path); throw new Error('Signing key already exists. It will not be overwritten.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    try { await stat(resolve(mobile, 'ota/public-key.json')); throw new Error('Public key already exists. Restore its private key; do not silently rotate it.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const keys = generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    await writeFile(path, keys.privateKey, { mode: 0o600, flag: 'wx' });
    await writeJson(resolve(mobile, 'ota/public-key.json'), { pem: keys.publicKey });
    const configPath = resolve(mobile, 'capacitor.config.json'), config = await json(configPath);
    config.plugins.LiveUpdate = { autoUpdateStrategy: 'none', autoDeleteBundles: true, autoBlockRolledBackBundles: true, readyTimeout: 30000, publicKey: keys.publicKey };
    await writeJson(configPath, config);
    console.log('Created signing key in ignored local-data/ota. Back it up securely; only the public key is shipped.');
  } else if (command === 'baseline') {
    const p = platform(), staged = await json(resolve(mobile, 'www/ota-build.json'));
    // The app's game must be the game's version, as the store build's own check requires; Android's build
    // number defaults to that version's code, the one build.gradle gives the bundle.
    const gameVersion = (await json(resolve(root, 'public/version.json'))).version;
    if (staged.version !== gameVersion) throw new Error(`The staged app holds game ${staged.version} but the game is ${gameVersion}. Run npm --prefix mobile run build first.`);
    const build = !args.includes('--build') && p === 'android' ? androidVersionCode(gameVersion) : buildNumber();
    assertCompatible(staged, await compatibility());
    if (staged.testPurchasesEnabled) throw new Error('Test-purchase bundles cannot be native baselines.');
    const config = await json(resolve(mobile, 'capacitor.config.json'));
    if (config.plugins?.LiveUpdate?.publicKey !== (await json(resolve(mobile, 'ota/public-key.json'))).pem) throw new Error('Native public key mismatch.');
    if (!args.includes('--allow-uncommitted')) assertNativeCommitted(await nativeFiles());
    const { testPurchasesEnabled: _, ...description } = staged;
    const baseline = { ...description, platform: p, build };
    // The committed copy is what CI reads; the local copy keeps older tooling working.
    for (const path of [resolve(committedBaselines, `${p}-${build}.json`), resolve(stateDir, 'baselines', `${p}-${build}.json`)]) {
      try { const previous = await json(path); assertCompatible(previous, staged); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      await writeJson(path, baseline);
    }
    console.log(`Recorded ${p} build ${build}. This must describe the native binary you actually distribute.\nCommit ${relative(root, resolve(committedBaselines, `${p}-${build}.json`))} with this store release so CI can publish updates to it.`);
  } else if (command === 'package') {
    const p = platform(), build = buildNumber(), id = flag('id');
    if (!validId(id)) throw new Error('Invalid bundle ID.');
    const { baseline, minBuild, maxBuild } = await baselineFor(p, build);
    const staged = await json(resolve(mobile, 'www/ota-build.json'));
    assertCompatible(staged, await compatibility()); assertCompatible(baseline, staged);
    if (staged.testPurchasesEnabled) throw new Error('Never distribute test-purchase bundles over OTA.');
    const dir = await packageBundle({ p, staged, range: { minBuild, maxBuild }, id });
    console.log(`Signed bundle for ${p} builds ${minBuild}–${maxBuild}: ${resolve(dir, 'bundle.zip')}\nUpload bundle.zip to an HTTPS artifact host, then stage its URL on the developer channel.`);
  } else if (command === 'upload') {
    const artifact = resolve(flag('artifact')), meta = await inspectArtifact(artifact);
    const repo = flag('repo');
    if (!validRepo(repo)) throw new Error('Use owner/repository.');
    assertPublicRepo(repo);
    const url = await uploadRelease(artifact, meta, repo, 'This artifact is not promoted to players until its signed production announcement is deployed.');
    console.log(`Uploaded immutable artifact. Stage with:\nnpm --prefix mobile run ota -- stage --artifact ${artifact} --url ${url}`);
  } else if (command === 'stage') {
    const artifact = resolve(flag('artifact')), meta = await inspectArtifact(artifact);
    const url = new URL(flag('url'));
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Use a public HTTPS artifact URL.');
    // Verify uploaded bytes before publishing any announcement. Never trust a local filename alone.
    await assertHosted(url.href, meta);
    await writeFeed('developer', meta.platform, meta, { ...meta.bundle, url: url.href });
    console.log('Publish this file through the normal web deployment to activate it.');
  } else if (command === 'promote') {
    if (!args.includes('--tested-on-device')) throw new Error('Test startup, login, combat, saves, and rollback on device first; then use --tested-on-device.');
    const p = platform(), id = flag('id'), dev = await readSigned(feedPath('developer', p));
    if (!dev.bundle || dev.bundle.id !== id) throw new Error('Only the exact bundle currently on the developer channel can be promoted.');
    await writeFeed('production', p, dev, dev.bundle);
    console.log('Committing this file pins production to it: automatic publishing skips production while public/ota/production-' + p + '.json exists.');
  } else if (command === 'rollback') {
    const p = platform(), channel = flag('channel');
    if (!['production', 'developer'].includes(channel)) throw new Error('Unknown channel.');
    if (args.includes('--installed')) {
      const { baseline, minBuild, maxBuild } = await baselineFor(p, buildNumber());
      await writeFeed(channel, p, { ...baseline, minBuild, maxBuild }, null);
    } else {
      // Replay a previously signed announcement with a NEW sequence, never downgrade the high-water mark.
      const previous = await readSigned(resolve(flag('announcement')));
      if (previous.platform !== p || previous.channel !== channel) throw new Error('Rollback must stay within the original platform and channel.');
      await writeFeed(channel, p, previous, previous.bundle);
    }
    console.log('Publish this file through the normal web deployment to activate it.');
  } else if (command === 'publish') {
    // The automatic path CI runs on every push to main. Each "skip" exits 0 so
    // the web deploy is never held up by the app update.
    const p = platform(), channel = 'production', out = resolve(flag('out'));
    const repo = optionalFlag('repo') ?? process.env.GITHUB_REPOSITORY;
    if (!repo || !validRepo(repo)) throw new Error('Use --repo owner/repository.');
    if (await exists(feedPath(channel, p))) { notice(`public/ota/${channel}-${p}.json is committed, so the ${channel} feed is pinned to it. Skipping; delete that file to resume automatic updates.`); process.exit(0); }
    if (!process.env.OTA_SIGNING_PRIVATE_KEY?.trim() && !await exists(resolve(stateDir, 'signing-private.pem'))) { notice('No OTA signing key (secret OTA_SIGNING_PRIVATE_KEY). Skipping.'); process.exit(0); }
    const staged = { ...await json(resolve(mobile, 'www/ota-build.json')), platform: p };
    assertCompatible(staged, await compatibility());
    if (staged.testPurchasesEnabled) throw new Error('Never distribute test-purchase bundles over OTA.');
    // CI reads only committed baselines; local-only ones are never trusted here.
    const range = newestCompatibleRange(await readBaselines(p, { includeLocal: process.env.GITHUB_ACTIONS !== 'true' }), staged);
    if (!range) { notice(`No committed ${p} baseline in mobile/ota/baselines matches this native code (fingerprint ${staged.nativeFingerprint.slice(0, 12)}). Skipping until the next store release commits one.`); process.exit(0); }
    assertPublicRepo(repo);
    // Same web files, same bundle ID: a push that changes nothing in the app
    // republishes the same bundle, so phones do not download it again.
    let id = `${p}-${staged.version}-${(await directoryDigest(resolve(mobile, 'www'))).slice(0, 12)}`;
    if (!validId(id)) throw new Error(`Invalid bundle ID ${id}.`);
    let hosted = await reusableRelease(repo, id, staged);
    if (!hosted) {
      if (releaseExists(repo, `ota-${id}`)) id = `${id}-${process.env.GITHUB_RUN_ID ?? Date.now()}`; // A broken earlier upload keeps its tag.
      const dir = await packageBundle({ p, staged, range, id });
      const meta = await inspectArtifact(dir);
      const url = await uploadRelease(dir, meta, repo, `Published automatically for ${process.env.GITHUB_SHA ?? 'a local run'}.`);
      await assertHosted(url, meta, 6);
      hosted = { meta, url };
    } else console.log(`Reusing ota-${id}; the web bundle has not changed.`);
    const manifest = await writeFeed(channel, p, { ...staged, minBuild: range.minBuild, maxBuild: range.maxBuild }, { ...hosted.meta.bundle, url: hosted.url }, { path: out, history: false });
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `published=yes\nbundle=${manifest.bundle.id}\n`);
    console.log(`Android builds ${range.minBuild}–${range.maxBuild} get ${manifest.bundle.id} on their next launch after this deploy.`);
  } else {
    console.log('OTA commands: keygen | baseline --platform ios|android --build N | package --platform P --build N --id ID | upload --artifact DIR --repo OWNER/REPO | stage --artifact DIR --url HTTPS | promote --platform P --id ID --tested-on-device | rollback --platform P --channel C (--installed --build N | --announcement FILE) | publish --platform P --out FILE [--repo OWNER/REPO]');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
