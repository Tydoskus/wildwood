#!/usr/bin/env node
/**
 * Bakes ForestVillage prefabs into single images for the Soul Dimension's
 * village. The pack builds every house from parts (walls, roof, door,
 * windows, chimney, shadow) placed by nested Unity prefabs; this reads those
 * prefabs straight from the extracted .unitypackage and composites the parts
 * the way Unity would draw them, so a house looks the way the pack shows it.
 * No Unity scripts are run: prefabs and .meta files are plain YAML.
 *
 *   tar -xzf "art-source/2D Minimal World - ForestVillage.unitypackage" -C <dir>
 *   node scripts/art/compose-forest-village.mjs <dir> <outDir> Preset/House_Red Preset/Inn ...
 *
 * Each output is <outDir>/<name>.webp plus a line in <outDir>/anchors.json:
 * the image size and the pixel of the prefab's origin, which the game puts on
 * the object's ground point.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import sharp from "sharp";
import { byGuid, drawList, loadPackage, spriteImage } from "./unity-prefab.mjs";

const splitShadows = process.argv.includes("--split-shadows");
const [packageDir, outDir, ...wanted] = process.argv.slice(2).filter(arg => arg !== "--split-shadows");
if (!packageDir || !outDir || !wanted.length) {
  console.error("usage: compose-forest-village.mjs <extractedPackageDir> <outDir> <prefab suffix>...");
  process.exit(1);
}
loadPackage(packageDir);

async function compose(suffix) {
  const match = [...byGuid].find(([, entry]) => entry.path.endsWith(`/${suffix}.prefab`));
  if (!match) throw new Error(`no prefab ending in ${suffix}.prefab`);
  const items = drawList(match[0]);
  const images = [];
  // With --split-shadows a prefab's shadows go to <name>__shadow.webp at full strength, on the same canvas:
  // the game fades every shadow together, so two that overlap do not stack darker.
  for (const item of items) images.push(await spriteImage(item, { solidShadow: splitShadows }));
  const minX = Math.floor(Math.min(...images.map(i => i.left))), minY = Math.floor(Math.min(...images.map(i => i.top)));
  const maxX = Math.ceil(Math.max(...images.map(i => i.left + i.width))), maxY = Math.ceil(Math.max(...images.map(i => i.top + i.height)));
  const width = maxX - minX, height = maxY - minY;
  const name = basename(suffix);
  const write = (list, file) => sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(list.map(i => ({ input: i.buffer, left: Math.round(i.left - minX), top: Math.round(i.top - minY) })))
    .webp({ lossless: true }).toFile(join(outDir, file));
  const shadows = splitShadows ? images.filter(i => i.shadow) : [];
  await write(splitShadows ? images.filter(i => !i.shadow) : images, `${name}.webp`);
  if (shadows.length) await write(shadows, `${name}__shadow.webp`);
  return { name, width, height, originX: -minX, originY: -minY, shadow: shadows.length > 0 };
}

mkdirSync(outDir, { recursive: true });
const anchorsFile = join(outDir, "anchors.json");
const anchors = existsSync(anchorsFile) ? JSON.parse(readFileSync(anchorsFile, "utf8")) : {};
for (const suffix of wanted) {
  const result = await compose(suffix).catch(error => { console.warn(`skipped ${suffix}: ${error.message}`); return null; });
  if (!result) continue;
  anchors[result.name] = { width: result.width, height: result.height, originX: result.originX, originY: result.originY };
  if (result.shadow) anchors[`${result.name}__shadow`] = anchors[result.name];
  console.log(`${result.name}: ${result.width}x${result.height}, origin ${result.originX},${result.originY}`);
}
writeFileSync(anchorsFile, `${JSON.stringify(anchors, null, 2)}\n`);
