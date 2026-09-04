import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postcss from "postcss";
import { createGameDocument } from "../../tests/helpers/game-document";

const doc = createGameDocument();
const asset = (path: string) => readFileSync(new URL(`../../public/${path.split("?")[0]}`, import.meta.url));
const version = JSON.parse(asset("version.json").toString()).version;

function expectPng(png: Buffer, width: number, height: number, opaque = false) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([width, height]);
  if (opaque) expect(png[25]).toBe(2); // RGB, no alpha channel.
}

describe("startup image and install assets", () => {
  it("matches wordmark dimensions and cache versions to the shipped WebP", () => {
    const images = [...doc.querySelectorAll('img[src*="wildstat-wordmark."]')];
    expect(images.length).toBeGreaterThan(0);
    const data = asset(images[0].getAttribute("src")!);
    expect(data.subarray(0, 4).toString()).toBe("RIFF");
    expect(data.subarray(8, 16).toString()).toBe("WEBPVP8X");
    const width = data.readUIntLE(24, 3) + 1;
    const height = data.readUIntLE(27, 3) + 1;
    for (const img of images) {
      expect(Number(img.getAttribute("width"))).toBe(width);
      expect(Number(img.getAttribute("height"))).toBe(height);
      expect(new URL(img.getAttribute("src")!, "https://example.test/").searchParams.get("v")).toBe(version);
    }
    expect(doc.querySelector('link[rel="preload"][as="image"]')!.getAttribute("href")).toBe(images[0].getAttribute("src"));
  });

  it("resolves the artwork loader and CSS to the same file on both hosting paths", () => {
    const descriptor = doc.querySelector("meta[data-signin-artwork]")!.getAttribute("content")!;
    expect(asset(descriptor).length).toBeGreaterThan(0);
    let artwork = "";
    for (const style of doc.querySelectorAll("style")) {
      postcss.parse(style.textContent ?? "").walkDecls("--signin-artwork", (decl) => { artwork = decl.value; });
    }
    const relative = artwork.match(/^url\(["']?([^"')]+)["']?\)$/)?.[1];
    expect(relative).toBeTruthy();
    for (const base of ["https://example.test/", "https://example.test/wildwood/"]) {
      const resolved = new URL(relative!, new URL("assets/wildstat/game.css", base));
      expect(resolved.href).toBe(new URL(descriptor, base).href);
      expect(resolved.searchParams.get("v")).toBe(version);
    }
  });

  it("ships relative install routes and valid opaque icons at their declared sizes", () => {
    const manifest = JSON.parse(asset(doc.querySelector('link[rel="manifest"]')!.getAttribute("href")!).toString());
    expect(manifest).toMatchObject({ id: "./", start_url: "./", scope: "./", display: "standalone" });
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      const [width, height] = icon.sizes.split("x").map(Number);
      expectPng(asset(icon.src), width, height, true);
    }
    for (const icon of doc.querySelectorAll('link[rel="apple-touch-icon"], link[rel="icon"][type="image/png"]')) {
      const [width, height] = icon.getAttribute("sizes")!.split("x").map(Number);
      expectPng(asset(icon.getAttribute("href")!), width, height, true);
    }
  });

  it("has valid ICO directory offsets and embedded image dimensions", () => {
    const ico = asset(doc.querySelector('link[rel="icon"][sizes="any"]')!.getAttribute("href")!);
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
    const count = ico.readUInt16LE(4);
    expect(count).toBeGreaterThan(1);
    let offset = 6 + count * 16;
    for (let i = 0; i < count; i++) {
      const entry = 6 + i * 16;
      const bytes = ico.readUInt32LE(entry + 8);
      expect(ico.readUInt32LE(entry + 12)).toBe(offset);
      expect(offset + bytes).toBeLessThanOrEqual(ico.length);
      expectPng(ico.subarray(offset, offset + bytes), ico[entry] || 256, ico[entry + 1] || 256);
      offset += bytes;
    }
    expect(offset).toBe(ico.length);
  });

  it("keeps deferred profile art out of startup downloads", () => {
    const images = [...doc.querySelectorAll('img[data-game-src*="gender/"]')];
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img.hasAttribute("src")).toBe(false);
      expect(asset(img.getAttribute("data-game-src")!).length).toBeGreaterThan(0);
    }
  });
});
