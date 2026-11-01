import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { fingerprintClient, hashedPath } from "./fingerprint-client.mjs";

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "public, no-cache";

// Cloudflare's matching: `*` is greedy, a `:placeholder` stops at a slash.
function parseHeaders(text: string) {
  const rules: { pattern: RegExp; headers: string[] }[] = [];
  for (const line of text.split("\n").filter(Boolean)) {
    if (line.startsWith("  ")) { rules.at(-1)!.headers.push(line.trim()); continue; }
    const source = line.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/:[A-Za-z]\w*/g, "[^/]+");
    rules.push({ pattern: new RegExp(`^${source}$`), headers: [] });
  }
  return rules;
}
function cacheControl(rules: ReturnType<typeof parseHeaders>, path: string) {
  return rules.filter((rule) => rule.pattern.test(`/${path}`)).flatMap((rule) => rule.headers)
    .filter((header) => header.startsWith("Cache-Control: ")).map((header) => header.slice(15)).join(", ");
}
async function files(root: string, folder = ""): Promise<string[]> {
  const entries = await readdir(join(root, folder), { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? files(root, join(folder, entry.name)) : [join(folder, entry.name)]))).flat();
}
const exists = (path: string) => stat(path).then(() => true, () => false);

const directories: string[] = [];
async function fixture(version = "1.0", image = "artwork", font = "font", extra: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), "wildstat-fingerprint-"));
  directories.push(root);
  const files: Record<string, string> = {
    "index.html": `<meta data-signin-artwork content="assets/wildstat/signin/background.webp?v=${version}">
<meta property="og:image" content="https://tydoskus.github.io/wildwood/assets/wildstat/logo.webp?v=${version}">
<style>:root { --signin-artwork: url("signin/background.webp?v=${version}"); }</style>
<link rel="stylesheet" href="assets/wildstat/game.css?v=${version}">
<link rel="manifest" href="manifest.webmanifest?v=${version}">
<a href="terms.html">Terms</a><a href="https://other.test/image.png">External</a>
<img src="assets/wildstat/logo.webp?v=${version}">
<img src="assets/wildstat/icons/Icon_Home.svg">
<script src="assets/wildstat/coop-client.js?v=${version}" data-game-src="assets/wildstat/game.js?v=${version}"></script>`,
    "assets/wildstat/game.css": '@font-face { src: url("fonts/ui.woff2"); } .icon { background: url("logo.webp"); } .cursor { cursor: url("ui/hand.cur"), auto; }',
    "assets/wildstat/ui/hand.cur": "cursor",
    "terms.html": "terms",
    "assets/wildstat/icons/Icon_Home.svg": "<svg/>",
    "assets/wildstat/icons/Icon_AutoFarm.svg": "<svg/>",
    "assets/wildstat/coop-client.js.map": "{}",
    "assets/tile-worker-AbC123.js": "self.onmessage = () => {};",
    "assets/wildstat/fonts/ui.woff2": font,
    "assets/wildstat/signin/background.webp": image,
    "assets/wildstat/logo.webp": "logo",
    "assets/wildstat/coop-client.js": "window.coop = true;\n//# sourceMappingURL=coop-client.js.map",
    "assets/wildstat/game.js": `window.version = "${version}";`,
    "assets/wildstat/enemies/toad/idle-0.webp": "toad",
    "assets/wildstat/audio/forest.mp3": "music",
    "assets/wildstat/dragon-sheet.webp": "dragon",
    "manifest.webmanifest": JSON.stringify({ id: "./", scope: "./", start_url: "./", icons: [{ src: "assets/wildstat/logo.webp" }] }),
    ...extra,
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return { root, assets: await fingerprintClient(root) };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("content-addressed client build", () => {
  it("keeps unchanged art, CSS, and auth bundles cached across releases", async () => {
    const first = await fixture("1.0");
    const next = await fixture("1.1");
    for (const path of Object.keys(first.assets).filter((path) => path !== "assets/wildstat/game.js")) {
      expect(next.assets[path], path).toBe(first.assets[path]);
    }
    expect(next.assets["assets/wildstat/game.js"]).not.toBe(first.assets["assets/wildstat/game.js"]);
  });

  it("changes artwork only when its bytes change and propagates CSS dependencies", async () => {
    const first = await fixture();
    const next = await fixture("1.0", "new artwork", "new font");
    for (const path of ["assets/wildstat/signin/background.webp", "assets/wildstat/fonts/ui.woff2", "assets/wildstat/game.css"]) {
      expect(next.assets[path]).not.toBe(first.assets[path]);
    }
    expect(next.assets["assets/wildstat/logo.webp"]).toBe(first.assets["assets/wildstat/logo.webp"]);
  });

  it("preserves relative URLs, PWA identity, delayed loading, and source aliases", async () => {
    const { root, assets } = await fixture();
    const html = await readFile(join(root, "index.html"), "utf8");
    expect(html).not.toContain("?v=");
    expect(html).toContain(`data-game-src="${assets["assets/wildstat/game.js"]}"`);
    expect(html).not.toContain(`<script src="${assets["assets/wildstat/game.js"]}"`);
    expect(html).toContain('href="terms.html"');
    expect(html).toContain('href="https://other.test/image.png"');
    const background = html.match(/--signin-artwork: url\("([^"]+)"\)/)![1];
    for (const base of ["https://wildstatmmo.com/", "https://tydoskus.github.io/wildwood/"]) {
      expect(new URL(background, new URL(assets["assets/wildstat/game.css"], base)).href)
        .toBe(new URL(assets["assets/wildstat/signin/background.webp"], base).href);
      for (const path of Object.values(assets) as string[]) expect(new URL(path, base).href.startsWith(base)).toBe(true);
    }
    const manifest = JSON.parse(await readFile(join(root, assets["manifest.webmanifest"]), "utf8"));
    expect(manifest).toMatchObject({ id: "./", start_url: "./", scope: "./" });
    expect(manifest.icons[0].src).toBe(assets["assets/wildstat/logo.webp"]);
    expect(await readFile(join(root, "assets/wildstat/game.js"), "utf8")).toContain('window.version = "1.0"');
    for (const [original, path] of Object.entries(assets) as [string, string][]) {
      expect(hashedPath(original, await readFile(join(root, path)))).toBe(path);
    }
  });

  it("never sets immutable caching on stable page, version, or compatibility URLs", async () => {
    const { root, assets } = await fixture();
    const headers = await readFile(join(root, "_headers"), "utf8");
    expect(headers).toContain("/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache");
    expect(headers).toContain("/version.json\n  Cache-Control: no-store");
    expect(headers).toContain("/asset-manifest.json\n  Cache-Control: no-cache");
    expect(headers).toContain("/ota/*\n  Cache-Control: no-store\n  Access-Control-Allow-Origin: *");
    const rules = parseHeaders(headers);
    for (const path of ["assets/wildstat/game.js", "assets/wildstat/game.css", "assets/wildstat/logo.webp", "manifest.webmanifest"]) {
      expect(cacheControl(rules, path), path).not.toContain("immutable");
    }
    for (const path of Object.values(assets)) expect(cacheControl(rules, path), path).toBe(IMMUTABLE);
  });

  it("covers every file with at most one rule, hashed files immutable and runtime files revalidating", async () => {
    const { root, assets } = await fixture();
    const rules = parseHeaders(await readFile(join(root, "_headers"), "utf8"));
    const hashed = new Set(Object.values(assets));
    for (const path of await files(root)) {
      // Cloudflare merges every matching rule, so a second match would join values.
      expect(rules.filter((rule) => rule.pattern.test(`/${path}`)).length, path).toBeLessThanOrEqual(1);
      if (hashed.has(path)) expect(cacheControl(rules, path), path).toBe(IMMUTABLE);
      else if (path.startsWith("assets/")) expect(cacheControl(rules, path), path).toBe(REVALIDATE);
    }
    // Runtime art next to hashed files revalidates rather than keeping the host default.
    for (const path of ["assets/wildstat/icons/Icon_AutoFarm.svg", "assets/wildstat/fonts/ui.woff2",
      "assets/wildstat/signin/background.webp", "assets/wildstat/audio/forest.mp3", "assets/tile-worker-AbC123.js"]) {
      expect(cacheControl(rules, path), path).toBe(REVALIDATE);
    }
  });

  it("keeps the rule count fixed however many files the build holds", async () => {
    const small = await fixture();
    const extra: Record<string, string> = {};
    for (let i = 0; i < 150; i += 1) extra[`assets/wildstat/icons/extra-${i}.webp`] = `icon ${i}`;
    for (let i = 0; i < 20; i += 1) extra[`assets/wildstat/folder-${i}/art.webp`] = `art ${i}`;
    const css = '@font-face { src: url("fonts/ui.woff2"); } ' +
      Array.from({ length: 150 }, (_, i) => `.i${i} { background: url("icons/extra-${i}.webp"); }`).join(" ");
    const large = await fixture("1.0", "artwork", "font", { ...extra, "assets/wildstat/game.css": css });
    expect(Object.keys(large.assets).length).toBeGreaterThan(150);
    const count = async (root: string) => parseHeaders(await readFile(join(root, "_headers"), "utf8")).length;
    expect(await count(large.root)).toBe(await count(small.root));
    expect(await count(large.root)).toBeLessThan(20);
  });

  it("resolves rewritten URLs from each hashed copy's new location", async () => {
    const { root, assets } = await fixture();
    const css = await readFile(join(root, assets["assets/wildstat/game.css"]), "utf8");
    for (const url of [...css.matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1])) {
      expect(await exists(join(root, dirname(assets["assets/wildstat/game.css"]), url)), url).toBe(true);
    }
    expect(css).toContain(`url("${relative(dirname(assets["assets/wildstat/game.css"]), "assets/wildstat/ui/hand.cur")}")`);
    const client = await readFile(join(root, assets["assets/wildstat/coop-client.js"]), "utf8");
    const map = client.match(/\/\/# sourceMappingURL=(\S+)/)![1];
    expect(join(dirname(assets["assets/wildstat/coop-client.js"]), map)).toBe(assets["assets/wildstat/coop-client.js.map"]);
    // A script's own ../ lookups (Vite's worker URLs) still reach the same files.
    expect(await exists(join(root, dirname(assets["assets/wildstat/coop-client.js"]), "../tile-worker-AbC123.js"))).toBe(true);
    const html = await readFile(join(root, "index.html"), "utf8");
    for (const url of [...html.matchAll(/(?:src|href|data-game-src)="([^"]+)"/g)].map((match) => match[1])) {
      if (!/^https?:/.test(url)) expect(await exists(join(root, url)), url).toBe(true);
    }
    const manifest = JSON.parse(await readFile(join(root, assets["manifest.webmanifest"]), "utf8"));
    expect(dirname(assets["manifest.webmanifest"])).toBe(".");
    expect(await exists(join(root, manifest.icons[0].src))).toBe(true);
  });

  it("fails the build instead of shipping missing asset references", async () => {
    await expect(fixture("1.0", "artwork", "font", { "index.html": '<img src="assets/missing.webp">' })).rejects.toThrow("ENOENT");
  });

  it("refuses to run over a build that already holds hashed copies", async () => {
    const { root } = await fixture();
    await expect(fingerprintClient(root)).rejects.toThrow("reserved");
  });
});
