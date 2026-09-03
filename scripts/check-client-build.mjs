import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const directory = resolve("dist");
const manifest = JSON.parse(await readFile(resolve(directory, "asset-manifest.json"), "utf8"));
const html = await readFile(resolve(directory, "index.html"), "utf8");
if (/\?v=/.test(html)) throw new Error("Release-number asset URLs remain in built HTML");
for (const [original, path] of Object.entries(manifest)) {
  const bytes = await readFile(resolve(directory, path));
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  if (!path.includes(`.${hash}.`)) throw new Error(`Incorrect content hash: ${path}`);
  if (original.endsWith(".js")) {
    const result = spawnSync(process.execPath, ["--check", resolve(directory, path)], { stdio: "inherit" });
    if (result.status !== 0) throw new Error(`Invalid built JavaScript: ${path}`);
  }
}
for (const path of ["assets/wildstat/game.js", "assets/wildstat/coop-client.js", "assets/wildstat/game.css"]) {
  if (!manifest[path] || !html.includes(manifest[path])) throw new Error(`Missing fingerprinted entry: ${path}`);
}
console.log("Hashed client entries and content digests verified.");
