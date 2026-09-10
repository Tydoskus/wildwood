import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build } from '../../node_modules/esbuild/lib/main.js';

const mobile = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(mobile, "..");
let commerceConfig = {};
try {
  const input = JSON.parse(await readFile(resolve(mobile, 'commerce.local.json'), 'utf8'));
  // Bundle only the two public settings, never unrelated local account details.
  commerceConfig = { revenueCatTestApiKey: input.revenueCatTestApiKey, productIds: input.productIds };
  if (!/^test_[A-Za-z0-9_-]+$/.test(commerceConfig.revenueCatTestApiKey ?? '')) {
    throw new Error('Phone preview accepts only a RevenueCat Test Store public key (test_…).');
  }
  if (!Array.isArray(commerceConfig.productIds) || commerceConfig.productIds.length < 1 ||
      commerceConfig.productIds.length > 10 ||
      commerceConfig.productIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9._-]{1,150}$/.test(id)) ||
      new Set(commerceConfig.productIds).size !== commerceConfig.productIds.length) {
    throw new Error('Configure 1–10 unique Test Store product IDs.');
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const result = spawnSync("npm", ["run", "build:client"], { cwd: root, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);

// Stage a separate native artifact. Never modify public/ or the web release.
const webDir = resolve(mobile, "www");
await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });
await cp(resolve(root, "dist"), webDir, { recursive: true });
const path = resolve(webDir, "index.html");
let html = await readFile(path, "utf8");
if (!html.includes("</head>")) throw new Error("Game shell is missing </head>");
html = html.replace("</head>", '<script src="native-preview.js"></script>\n<script src="native-commerce.js"></script>\n</head>');
await writeFile(path, html);
await writeFile(resolve(webDir, "native-preview.js"), [
  '// This file is included only in the packaged phone preview.',
  'window.WILDSTAT_NATIVE_PREVIEW = true;',
  'window.WILDWOOD_SPACETIMEDB_HOST = "wss://maincloud.spacetimedb.com";',
  'window.WILDWOOD_SPACETIMEDB_DB_NAME = "wildwood-coop";',
  '',
].join("\n"));
await build({
  entryPoints: [resolve(mobile, 'src/preview-commerce.ts')],
  outfile: resolve(webDir, 'native-commerce.js'),
  bundle: true,
  format: 'iife',
  target: 'es2022',
  define: { __TEST_PURCHASE_CONFIG__: JSON.stringify(commerceConfig) },
});
console.log("Native preview staged in mobile/www; connects to the live game with a separate guest identity.");
