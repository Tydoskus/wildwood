import { createHash, sign, verify } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../../..', import.meta.url));
export const mobile = resolve(root, 'mobile');
export const stateDir = resolve(root, 'local-data/ota');
/** Committed copies of each store build's baseline, so CI can match the native tree. */
export const committedBaselines = resolve(mobile, 'ota/baselines');
/** Everything the native fingerprint reads. A baseline must be recorded from these files as committed. */
export const NATIVE_DIRS = ['mobile/android/app/src/main', 'mobile/ios/App/App'];
export const NATIVE_FILES = ['mobile/package-lock.json', 'mobile/capacitor.config.json', 'mobile/android/app/build.gradle', 'mobile/android/build.gradle', 'mobile/android/variables.gradle', 'mobile/android/gradle/wrapper/gradle-wrapper.properties', 'mobile/ios/App/CapApp-SPM/Package.swift', 'mobile/ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved', 'mobile/ios/App/App.xcodeproj/project.pbxproj'];
/**
 * What decides whether a web bundle can run inside an installed app. The
 * protocol version is not here: it is the web-to-server contract, and a bundle
 * carries its own matching game code, so it never needs the native shell's.
 */
export const COMPATIBILITY_KEYS = ['runtime', 'saveFormat', 'nativeFingerprint'];
export const json = async path => JSON.parse(await readFile(path, 'utf8'));
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function writeJson(path, data) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path + '.tmp', JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await rename(path + '.tmp', path);
}
/** The files the native fingerprint reads, sorted. */
export async function nativeFiles() {
  const files = [];
  async function collect(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (['assets', 'public', 'build', '.gradle', '.DS_Store', 'xcuserdata', 'Assets.xcassets', 'capacitor.config.json', 'config.xml'].includes(entry.name)) continue;
      const next = resolve(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Native fingerprint does not follow symlinks.');
      if (entry.isDirectory()) await collect(next); else files.push(next);
    }
  }
  for (const path of NATIVE_DIRS) await collect(resolve(root, path));
  for (const path of NATIVE_FILES) files.push(resolve(root, path));
  return files.sort();
}
export async function compatibility() {
  const ota = await readFile(resolve(root, 'shared/ota-update.ts'), 'utf8');
  const rules = await readFile(resolve(root, 'shared/rules.ts'), 'utf8');
  const version = await json(resolve(mobile, 'www/version.json'));
  const hash = createHash('sha256');
  for (const file of await nativeFiles()) { hash.update(relative(root, file)); hash.update(await readFile(file)); }
  const runtime = ota.match(/OTA_RUNTIME = '([^']+)'/)?.[1];
  const saveFormat = Number(ota.match(/OTA_SAVE_FORMAT = (\d+)/)?.[1]);
  // Recorded for reference and for apps that still compare it; not a gate.
  const protocol = Number(rules.match(/PROTOCOL_VERSION = (\d+)/)?.[1]);
  if (!runtime || !saveFormat || !protocol) throw new Error('Missing OTA compatibility constants.');
  return { runtime, saveFormat, protocol, nativeFingerprint: hash.digest('hex'), version: version.version };
}
export const isCompatible = (a, b) => COMPATIBILITY_KEYS.every(key => a[key] === b[key]);
export function assertCompatible(a, b) {
  for (const key of COMPATIBILITY_KEYS) if (a[key] !== b[key]) throw new Error(`${key} changed; create a new native app release first.`);
}
/** Baselines for one platform, committed copies first; a local-only build fills in only when no committed copy exists. */
export async function readBaselines(platform, { includeLocal = true } = {}) {
  const found = new Map();
  for (const dir of [committedBaselines, ...(includeLocal ? [resolve(stateDir, 'baselines')] : [])]) {
    let names = [];
    try { names = await readdir(dir); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    for (const name of names) {
      const match = name.match(/^(ios|android)-(\d+)\.json$/);
      if (!match || match[1] !== platform || found.has(Number(match[2]))) continue;
      const baseline = await json(resolve(dir, name));
      if (baseline.platform !== platform || baseline.build !== Number(match[2])) throw new Error(`${name} does not describe ${platform} build ${match[2]}.`);
      found.set(baseline.build, baseline);
    }
  }
  return [...found.values()].sort((a, b) => a.build - b.build);
}
/**
 * The run of recorded builds around `target` that share its native code. A feed
 * covers exactly that run: a build outside it, older or newer, may have
 * different native code, so maxBuild is never left open.
 */
export function compatibleRange(baselines, target) {
  const sorted = [...baselines].sort((a, b) => a.build - b.build);
  const at = sorted.findIndex(b => b.build === target.build);
  if (at < 0) throw new Error(`No baseline for build ${target.build}.`);
  let low = at, high = at;
  while (low > 0 && isCompatible(sorted[low - 1], target)) low--;
  while (high < sorted.length - 1 && isCompatible(sorted[high + 1], target)) high++;
  return { minBuild: sorted[low].build, maxBuild: sorted[high].build };
}
/** The newest baseline the staged bundle can run in, with the builds that share it; null when none matches. */
export function newestCompatibleRange(baselines, staged) {
  const target = [...baselines].sort((a, b) => b.build - a.build).find(b => isCompatible(b, staged));
  return target ? { baseline: target, ...compatibleRange(baselines, target) } : null;
}
/** CI passes the key in this variable; on the Mac it is the ignored local file. */
export async function signingKey() {
  const fromEnv = process.env.OTA_SIGNING_PRIVATE_KEY;
  if (fromEnv && fromEnv.trim()) return Buffer.from(fromEnv.replace(/\\n/g, '\n'));
  return readFile(resolve(stateDir, 'signing-private.pem'));
}
export async function signed(payload) {
  const privateKey = await signingKey();
  const publicKey = (await json(resolve(mobile, 'ota/public-key.json'))).pem;
  const signature = sign('sha256', Buffer.from(payload), privateKey).toString('base64');
  if (!verify('sha256', Buffer.from(payload), publicKey, Buffer.from(signature, 'base64'))) throw new Error('Signing key does not match installed public key.');
  return { payload, signature };
}
export async function readSigned(path) {
  const envelope = await json(path);
  const publicKey = (await json(resolve(mobile, 'ota/public-key.json'))).pem;
  if (!verify('sha256', Buffer.from(envelope.payload), publicKey, Buffer.from(envelope.signature, 'base64'))) throw new Error('Invalid announcement signature.');
  return JSON.parse(envelope.payload);
}
/** A stable digest of a staged bundle's files, so an unchanged web build reuses its published artifact. */
export async function directoryDigest(dir, skip = name => name.endsWith('.map') || name === '.DS_Store') {
  const files = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (skip(entry.name)) continue;
      const next = resolve(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Bundles do not follow symlinks.');
      if (entry.isDirectory()) await walk(next); else files.push(next);
    }
  }
  await walk(dir);
  const hash = createHash('sha256');
  for (const file of files.sort()) { const name = relative(dir, file).replace(/\\/g, '/'); hash.update(`${name}\0`); hash.update(digest(await readFile(file))); }
  return hash.digest('hex');
}
