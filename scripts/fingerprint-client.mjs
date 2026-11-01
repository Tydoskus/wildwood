import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const assetExtension = /\.(?:js|css|map|webmanifest|png|webp|jpe?g|svg|ico|woff2?)$/i;
const attributes = /\b(src|href|data-game-src|content)="([^"]+)"/g;
const cssUrls = /url\((['"]?)([^)'"\s]+)\1\)/g;
const siteOrigins = ["https://tydoskus.github.io/wildwood/", "https://wildstatmmo.com/"];
const shellRoot = "assets/wildstat/";
// Content-hashed copies live under their own prefix, so one rule makes them
// immutable and one rule covers every stable-name file beside them. The copy
// keeps its folder depth: a script's own `../` lookups (Vite's worker URLs)
// still land on the same files outside assets/wildstat.
export const hashedRoot = "assets/h/";

export function contentPath(path, content) {
  const extension = posix.extname(path);
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
  return `${path.slice(0, -extension.length)}.${hash}${extension}`;
}

// Files outside assets/wildstat (the web manifest, the favicon) stay where they
// are: the manifest's start_url and scope resolve against its own location.
function relocate(path) {
  return path.startsWith(shellRoot) ? hashedRoot + path.slice(shellRoot.length) : path;
}

export function hashedPath(path, content) {
  return contentPath(relocate(path), content);
}

// Hash the deployed shell's dependency graph, not the release number. Keep
// original files as compatibility aliases for old pages and runtime-built URLs.
export async function fingerprintClient(directory) {
  const assets = new Map();
  const visiting = new Set();
  if (await access(resolve(directory, hashedRoot)).then(() => true, () => false)) {
    throw new Error(`${hashedRoot} is reserved for content-hashed copies`);
  }

  // `base` is the file the URL was written for; `from` is the folder the
  // rewritten URL will be resolved from, which moves with a hashed copy.
  async function replaceUrl(value, base, from) {
    const origin = siteOrigins.find((prefix) => value.startsWith(prefix));
    if (!origin && /^(?:[a-z]+:|\/\/|#)/i.test(value)) return value;
    const local = origin ? value.slice(origin.length) : value;
    const [pathname] = local.split(/[?#]/);
    const rooted = Boolean(origin) || pathname.startsWith("/");
    const path = posix.normalize(posix.join(rooted ? "." : posix.dirname(base), pathname));
    if (path.startsWith("../") || path.startsWith("/")) throw new Error(`Asset escapes build directory: ${value}`);
    if (!assetExtension.test(pathname)) {
      // Not hashed, but the owner may have moved: point back at the original.
      return rooted || from === posix.dirname(base) ? value : posix.relative(from, path) + local.slice(pathname.length);
    }
    const hashed = await fingerprint(path);
    const fragment = local.includes("#") ? local.slice(local.indexOf("#")) : "";
    return (origin ? origin + hashed : posix.relative(from, hashed)) + fragment;
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
    const from = posix.dirname(relocate(path));
    if (path.endsWith(".css")) {
      content = Buffer.from(await replaceMatches(content.toString(), cssUrls, async ([, quote, url]) =>
        `url(${quote}${await replaceUrl(url, path, from)}${quote})`));
    } else if (path.endsWith(".js")) {
      // Only rewrite the trailing map directive: executable code and its
      // generated source positions stay unchanged.
      content = Buffer.from(await replaceMatches(content.toString(), /\/\/# sourceMappingURL=(\S+)/g,
        async ([, url]) => `//# sourceMappingURL=${await replaceUrl(url, path, from)}`));
    } else if (path.endsWith(".webmanifest")) {
      const manifest = JSON.parse(content.toString());
      for (const icon of manifest.icons ?? []) icon.src = await replaceUrl(icon.src, path, from);
      content = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
    }
    const target = hashedPath(path, content);
    await mkdir(resolve(directory, posix.dirname(target)), { recursive: true });
    await writeFile(resolve(directory, target), content);
    assets.set(path, target);
    visiting.delete(path);
    return target;
  }

  let html = await readFile(resolve(directory, "index.html"), "utf8");
  html = await replaceMatches(html, attributes, async ([, name, url]) => `${name}="${await replaceUrl(url, "index.html", ".")}"`);
  // This custom property is consumed by the external stylesheet, so its URL
  // deliberately resolves relative to the hashed game.css, not index.html.
  const stylesheet = "assets/wildstat/game.css";
  html = await replaceMatches(html, cssUrls, async ([, quote, url]) =>
    `url(${quote}${await replaceUrl(url, stylesheet, posix.dirname(relocate(stylesheet)))}${quote})`);
  await writeFile(resolve(directory, "index.html"), html);
  await writeFile(resolve(directory, "asset-manifest.json"), JSON.stringify(Object.fromEntries([...assets].sort()), null, 2) + "\n");

  // Only content-addressed files get immutable caching. Never apply it to
  // stable URLs, HTML, version.json, or runtime-generated media paths.
  const immutable = "  Cache-Control: public, max-age=31536000, immutable";
  // Stable names the game loads at runtime (icons, music, sprite sheets): kept,
  // but checked on every load (a 304 when unchanged). A day of stale reuse let a
  // sheet repacked in place meet the new code that reads it, drawing wrong frames.
  const revalidate = "  Cache-Control: public, no-cache";
  const outside = [...assets.values()].filter((path) => !path.startsWith(hashedRoot)).sort();
  // Patterns never overlap: Cloudflare merges every matching rule's headers.
  // `:file` stops at a slash, so it only matches Vite's worker files directly
  // in /assets/, never /assets/h/ or /assets/wildstat/.
  const rules = [
    ["/", "  Cache-Control: no-cache"], ["/index.html", "  Cache-Control: no-cache"],
    ["/version.json", "  Cache-Control: no-store"], ["/asset-manifest.json", "  Cache-Control: no-cache"],
    ["/ota/*", "  Cache-Control: no-store\n  Access-Control-Allow-Origin: *"],
    [`/${hashedRoot}*`, immutable],
    ...outside.map((path) => [`/${path}`, immutable]),
    [`/${shellRoot}*`, revalidate],
    ["/assets/:file", revalidate],
  ];
  if (rules.length > 100) throw new Error("Cloudflare header rule limit exceeded");
  await writeFile(resolve(directory, "_headers"), rules.map((rule) => rule.join("\n")).join("\n") + "\n");
  return Object.fromEntries(assets);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const assets = await fingerprintClient(resolve("dist"));
  console.log(`Content-hashed ${Object.keys(assets).length} shell assets under ${hashedRoot}; originals retained for compatibility.`);
}
