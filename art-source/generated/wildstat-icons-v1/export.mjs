import { constants, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const sourceDir = import.meta.dirname;
const root = resolve(sourceDir, "../../..");
const appSource = resolve(sourceDir, "app-icon-source.png");
const faviconSource = resolve(sourceDir, "favicon-source.png");
const appMaster = resolve(sourceDir, "app-icon-1024.png");
const touchIcon = resolve(root, "public/assets/wildwood/wildstat-apple-touch-icon.png");
const browserPng = resolve(root, "public/assets/wildwood/wildstat-favicon-32.png");
const browserIco = resolve(root, "public/wildstat-favicon.ico");
const sizes = [16, 32, 48, 64, 128, 256];
const framePaths = sizes.map((size) => resolve(sourceDir, `favicon-${size}.png`));
const profile = "/System/Library/ColorSync/Profiles/sRGB Profile.icc";
const outputs = [appMaster, touchIcon, browserPng, browserIco, ...framePaths];

for (const path of [appSource, faviconSource, profile]) {
  if (!existsSync(path)) throw new Error(`Missing export input: ${path}`);
}
for (const path of outputs) {
  if (existsSync(path)) throw new Error(`Refusing to overwrite existing artwork: ${path}`);
}

function exportPng(source, size, destination) {
  const result = spawnSync("/usr/bin/sips", [
    "--resampleHeightWidth", String(size), String(size),
    "--matchTo", profile, source, "--out", destination,
  ], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const png = readFileSync(destination);
  if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size || png[25] !== 2) {
    throw new Error(`Expected a square, opaque RGB PNG: ${destination}`);
  }
  return png;
}

exportPng(appSource, 1024, appMaster);
exportPng(appMaster, 180, touchIcon);
const frames = sizes.map((size, index) => exportPng(faviconSource, size, framePaths[index]));
copyFileSync(framePaths[1], browserPng, constants.COPYFILE_EXCL);

// Each ICO directory entry points at its own lossless PNG image payload.
const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (let index = 0; index < sizes.length; index += 1) {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index] === 256 ? 0 : sizes[index];
  directory[entry + 1] = directory[entry];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(24, entry + 6);
  directory.writeUInt32LE(frames[index].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frames[index].length;
}
writeFileSync(browserIco, Buffer.concat([directory, ...frames]), { flag: "wx" });
console.log("Exported opaque sRGB app/Home Screen PNGs and six favicon resolutions.");
for (const path of outputs) console.log(path);
