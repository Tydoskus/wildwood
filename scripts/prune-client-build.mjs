import { readdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * public/ holds a few things that are for the developer, not players: the
 * sprite aligner pages (served by `npm run art:align` from public/ itself) and
 * the SVG sources of sheets the game loads as WebP
 * (scripts/rasterize-vector-sprites.mjs). Vite copies all of public/ into the
 * build, so they were deployed to both sites. This takes them back out.
 */
export const DEVELOPER_ONLY_FILES = [
  "enemy-sprite-aligner.html", "enemy-sprite-aligner.js", "sprite-aligner.html",
  "sprite-aligner.css", "sprite-aligner-source-library.html",
];
const VECTOR_SOURCES = /^assets\/wildstat\/(?:enemies\/.+|aegis-prime-boss-v1)\.svg$/;

export async function pruneClientBuild(directory) {
  const removed = [];
  for (const file of DEVELOPER_ONLY_FILES) {
    await rm(join(directory, file), { force: true });
    removed.push(file);
  }
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (VECTOR_SOURCES.test(relative(directory, path).replace(/\\/g, "/"))) { await rm(path); removed.push(relative(directory, path)); }
    }
  }
  await walk(join(directory, "assets"));
  return removed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const removed = await pruneClientBuild(resolve("dist"));
  console.log(`Left ${removed.length} developer-only files out of the build.`);
}
