import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contentPath, fingerprintClient } from "./fingerprint-client.mjs";

const directories: string[] = [];
async function fixture(version = "1.0", image = "artwork", font = "font") {
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
<script src="assets/wildstat/coop-client.js?v=${version}" data-game-src="assets/wildstat/game.js?v=${version}"></script>`,
    "assets/wildstat/game.css": '@font-face { src: url("fonts/ui.woff2"); } .icon { background: url("logo.webp"); }',
    "assets/wildstat/fonts/ui.woff2": font,
    "assets/wildstat/signin/background.webp": image,
    "assets/wildstat/logo.webp": "logo",
    "assets/wildstat/coop-client.js": "window.coop = true;",
    "assets/wildstat/game.js": `window.version = "${version}";`,
    "manifest.webmanifest": JSON.stringify({ id: "./", scope: "./", start_url: "./", icons: [{ src: "assets/wildstat/logo.webp" }] }),
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
      expect(contentPath(original, await readFile(join(root, path)))).toBe(path);
    }
  });

  it("never sets immutable caching on stable page, version, or compatibility URLs", async () => {
    const { root, assets } = await fixture();
    const headers = await readFile(join(root, "_headers"), "utf8");
    expect(headers).toContain("/index.html\n  Cache-Control: no-cache");
    expect(headers).toContain("/version.json\n  Cache-Control: no-store");
    expect(headers).not.toContain("/assets/*");
    expect(headers).not.toContain("/assets/wildstat/game.js\n");
    for (const path of Object.values(assets)) expect(headers).toContain(`/${path}\n  Cache-Control: public, max-age=31536000, immutable`);
  });

  it("fails the build instead of shipping missing asset references", async () => {
    const { root } = await fixture();
    await writeFile(join(root, "index.html"), '<img src="assets/missing.webp">');
    await expect(fingerprintClient(root)).rejects.toThrow();
  });
});
