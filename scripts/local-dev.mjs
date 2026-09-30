import { spawn } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';
import { createLocalDevWork, localChangeKind } from './local-dev-work.mjs';
import { createLocalWorkspace, localLegacyColumns } from './local-dev-workspace.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const database = 'wildwood-balance-local';
const databaseHost = 'http://127.0.0.1:3000';
const port = Number(process.env.WILDSTAT_LOCAL_PORT || 8000);
// Development artifacts stay in memory, independent of web/iOS release builds.
process.env.NODE_ENV = 'development';
process.env.VITE_LOCAL_TESTING = '1';
let assets = new Map();
let closing = false, serverNeedsPublish = false, workspace;
const children = new Set();
function command(args, capture = false) {
  return new Promise((done, fail) => {
    const child = spawn(process.env.SPACETIME_BIN || 'spacetime', args, {
      cwd: workspace?.directory || root, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let output = '', errors = '';
    if (capture) {
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { errors += chunk; });
    }
    children.add(child);
    child.once('error', error => { children.delete(child); fail(error); });
    child.once('exit', code => {
      children.delete(child);
      if (code === 0) done(output); else fail(new Error(`spacetime ${args[0]} failed (${code}). ${errors || 'Fix the error and save again.'}`));
    });
  });
}
async function publish() {
  console.log(`Publishing only to ${databaseHost}/${database} (preserving saves)…`);
  await command(['publish', database, '--module-path', 'spacetimedb', '--server', databaseHost,
    '--delete-data=never', '--yes=remote,migrate,break-clients']);
  // A map visit keeps the balance it started with, so a balance edit would not
  // show until the player travelled. Local only: drop those pins so the tab's
  // automatic reload picks up the new numbers.
  await command(['sql', database, '--server', databaseHost, 'DELETE FROM player_map_balance'], true)
    .catch(error => console.warn(`Could not refresh map balance pins: ${error.message}`));
  await command(['generate', '--lang', 'typescript', '--out-dir', 'src/module_bindings', '--module-path', 'spacetimedb']);
}
async function buildClient() {
  console.log('Rebuilding local game…');
  const next = new Map();
  for (const target of ['coop', 'game']) {
    const result = await build({ configFile: resolve(workspace.directory, `config/vite.${target}.config.ts`), root: workspace.directory,
      mode: 'development', publicDir: false, logLevel: 'warn',
      build: { write: false, copyPublicDir: false, emptyOutDir: false, outDir: resolve(root, 'local-data/dev-client') },
    });
    for (const bundle of Array.isArray(result) ? result : [result]) {
      for (const file of bundle.output) next.set('/' + file.fileName, file.type === 'chunk' ? file.code : file.source);
    }
  }
  // Publish both bundles together only after both builds succeeded. Keep old
  // hashed worker URLs usable by tabs that are completing their reload.
  for (const [path, content] of assets) if (!next.has(path) && next.size < 128) next.set(path, content);
  assets = next;
}
const server = await createServer({
  configFile: false, root: resolve(root, 'public'), publicDir: false, mode: 'development',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port, strictPort: true, watch: { usePolling: true, interval: 500, binaryInterval: 1500 }, headers: { 'Cache-Control': 'no-store' } },
  plugins: [{
    name: 'wildstat-local-game',
    transformIndexHtml: { order: 'pre', handler: () => [{ tag: 'script', injectTo: 'head-prepend',
      children: `window.WILDWOOD_SPACETIMEDB_HOST = "ws://127.0.0.1:3000"; window.WILDWOOD_SPACETIMEDB_DB_NAME = ${JSON.stringify(database)};`,
    }] },
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        const path = new URL(req.url || '/', 'http://localhost').pathname;
        if (path === '/__wildstat_dev') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ service: 'wildstat-local-dev', database, ready: assets.size > 0 }));
          return;
        }
        const content = assets.get(path);
        if (content === undefined) return next();
        res.setHeader('Content-Type', path.endsWith('.map') ? 'application/json' : 'text/javascript');
        res.setHeader('Cache-Control', 'no-store');
        res.end(content);
      });
    },
    handleHotUpdate(context) {
      const kind = localChangeKind(relative(root, context.file).replaceAll('\\', '/'));
      if (kind) return []; // Reload only after our serialized build/publish finishes.
    },
  }],
});
const work = createLocalDevWork({
  async run(changes) {
    await workspace.sync();
    if (changes.has('server')) serverNeedsPublish = true;
    const republish = serverNeedsPublish;
    if (republish) { await publish(); serverNeedsPublish = false; }
    if (closing) return;
    if (republish || changes.has('client')) await buildClient();
    if (closing) return;
    server.ws.send({ type: 'full-reload', path: '*' });
    console.log('Updated. The existing browser tab refreshes automatically.');
  },
  reportError(error) {
    console.error(error.message);
    console.error('Last successful browser build remains available. Save a correction to retry.');
    server.ws.send({ type: 'error', err: { message: error.message, stack: '', plugin: 'wildstat-local-game' } });
  },
});
async function stop() {
  if (closing) return;
  closing = true;
  const pending = work.close();
  for (const child of children) child.kill('SIGTERM');
  await server.close();
  await pending;
  await workspace?.close();
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
try {
  let columns = {};
  try {
    const schema = await command(['describe', database, '--server', databaseHost, '--json'], true);
    columns = localLegacyColumns(JSON.parse(schema));
  } catch (error) {
    if (!/404|database .*not found|no such database|failed to find database/i.test(error.message)) throw error;
  }
  workspace = await createLocalWorkspace(root, columns);
  await workspace.sync();
  if (Object.keys(columns).length) console.log('Keeping legacy local columns in an isolated development build.');
  await publish();
  await buildClient();
  server.watcher.add(['src', 'shared', 'spacetimedb/src', 'config'].map(path => resolve(root, path)));
  server.watcher.on('all', (event, file) => {
    if (!['add', 'change', 'unlink'].includes(event)) return;
    const path = relative(root, file).replaceAll('\\', '/');
    if (path.startsWith('src/module_bindings/')) return;
    const kind = localChangeKind(path);
    if (kind === 'style') {
      const url = '/' + path.slice('public/'.length);
      server.ws.send({ type: 'update', updates: [{ type: 'css-update', path: url, acceptedPath: url, timestamp: Date.now() }] });
      console.log(`Style updated: ${path}`);
    } else work.add(kind);
  });
  await server.listen();
  console.log(`\nWildStat local: http://127.0.0.1:${port}/\nCSS updates live. Code rebuilds and refreshes. Server edits republish locally.\nLeave this terminal open; Control-C stops the watcher.\n`);
  if (process.argv.includes('--open')) spawn('open', [`http://127.0.0.1:${port}/`], { stdio: 'ignore' });
} catch (error) {
  console.error(error.message);
  await stop();
  process.exitCode = 1;
}
