import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const assetExtension = /\.(?:js|css|map|webmanifest|png|webp|jpe?g|svg|ico|woff2?)$/i;
const attributes = /\b(src|href|data-game-src|content)="([^"]+)"/g;
const cssUrls = /url\((['"]?)([^)'"\s]+)\1\)/g;
const siteOrigins = ["https://tydoskus.github.io/wildwood/", "https://wildstatmmo.com/"];

export function contentPath(path, content) {
  const extension = posix.extname(path);
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
  return `${path.slice(0, -extension.length)}.${hash}${extension}`;
}

// Hash the deployed shell's dependency graph, not the release number. Keep
// original files as compatibility aliases for old pages and runtime-built URLs.
export async function fingerprintClient(directory) {
  const assets = new Map();
  const visiting = new Set();

  async function replaceUrl(value, owner) {
    const origin = siteOrigins.find((prefix) => value.startsWith(prefix));
    if (!origin && /^(?:[a-z]+:|\/\/|#)/i.test(value)) return value;
    const local = origin ? value.slice(origin.length) : value;
    const [pathname] = local.split(/[?#]/);
    if (!assetExtension.test(pathname)) return value;
    const path = posix.normalize(posix.join(origin || pathname.startsWith("/") ? "." : posix.dirname(owner), pathname));
    if (path.startsWith("../") || path.startsWith("/")) throw new Error(`Asset escapes build directory: ${value}`);
    const hashed = await fingerprint(path);
    const fragment = local.includes("#") ? local.slice(local.indexOf("#")) : "";
    return (origin ? origin + hashed : posix.relative(posix.dirname(owner), hashed)) + fragment;
  }

  async function replaceMatches(source, expression, replacer) {
    const matches = [...source.matchAll(expression)];
    // Reverse order keeps indices valid without rescanning generated URLs.
    for (const match of matches.reverse()) {
      source = source.slice(0, match.index) + await replacer(match) + source.slice(match.index + match[0].length);
    }
    return source;
  }

  async function fingerprint(path) {
    if (assets.has(path)) return assets.get(path);
    if (visiting.has(path)) throw new Error(`Cyclic asset dependency: ${path}`);
    visiting.add(path);
    let content = await readFile(resolve(directory, path));
    if (path.endsWith(".css")) {
      content = Buffer.from(await replaceMatches(content.toString(), cssUrls, async ([, quote, url]) =>
        `url(${quote}${await replaceUrl(url, path)}${quote})`));
    } else if (path.endsWith(".js")) {
      // Only rewrite the trailing map directive: executable code and its
      // generated source positions stay unchanged.
      content = Buffer.from(await replaceMatches(content.toString(), /\/\/# sourceMappingURL=(\S+)/g,
        async ([, url]) => `//# sourceMappingURL=${await replaceUrl(url, path)}`));
    } else if (path.endsWith(".webmanifest")) {
      const manifest = JSON.parse(content.toString());
      for (const icon of manifest.icons ?? []) icon.src = await replaceUrl(icon.src, path);
      content = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
    }
    const target = contentPath(path, content);
    await writeFile(resolve(directory, target), content);
    assets.set(path, target);
    visiting.delete(path);
    return target;
  }

  let html = await readFile(resolve(directory, "index.html"), "utf8");
  html = await replaceMatches(html, attributes, async ([, name, url]) => `${name}="${await replaceUrl(url, "index.html")}"`);
  // This custom property is consumed by the external stylesheet, so its URL
  // deliberately resolves relative to game.css, not relative to index.html.
  html = await replaceMatches(html, cssUrls, async ([, quote, url]) =>
    `url(${quote}${await replaceUrl(url, "assets/wildstat/game.css")}${quote})`);
  await writeFile(resolve(directory, "index.html"), html);
  await writeFile(resolve(directory, "asset-manifest.json"), JSON.stringify(Object.fromEntries([...assets].sort()), null, 2) + "\n");

  // Only content-addressed files get immutable caching. Never apply it to
  // stable URLs, HTML, version.json, or runtime-generated media paths.
  const headers = [
    "/", "  Cache-Control: no-cache", "/index.html", "  Cache-Control: no-cache",
    "/version.json", "  Cache-Control: no-store", "/asset-manifest.json", "  Cache-Control: no-cache",
    ...[...assets.values()].sort().flatMap((path) => [`/${path}`, "  Cache-Control: public, max-age=31536000, immutable"]),
  ];
  if (assets.size + 4 > 100) throw new Error("Cloudflare header rule limit exceeded");
  await writeFile(resolve(directory, "_headers"), headers.join("\n") + "\n");
  return Object.fromEntries(assets);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const assets = await fingerprintClient(resolve("dist"));
  console.log(`Content-hashed ${Object.keys(assets).length} shell assets; originals retained for compatibility.`);
}
