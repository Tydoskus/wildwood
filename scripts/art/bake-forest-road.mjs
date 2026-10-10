/**
 * The tutorial forest's road tiles: the 3×3 corner, edge and centre block of
 * ForestVillage's Forest_Road tile sheet (what the Town's roads are made of),
 * scaled to the game's world units (a 256-pixel tile is 2.56 Unity units, 60
 * game units each), so each pixel is a world unit.
 *
 *   tar -xzf "art-source/2D Minimal World - ForestVillage.unitypackage" -C <pkg>
 *   node scripts/art/bake-forest-road.mjs <pkg>
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "../..");
const packageDir = process.argv[2];
if (!packageDir) { console.error("usage: bake-forest-road.mjs <extractedPackageDir>"); process.exit(1); }
const entry = readdirSync(packageDir).find(dir => existsSync(join(packageDir, dir, "pathname"))
  && readFileSync(join(packageDir, dir, "pathname"), "utf8").trim().endsWith("/Tile/Forest_Road.png"));
if (!entry) { console.error("Forest_Road.png not found in the package"); process.exit(1); }
const TILE = 256, WORLD_PER_PIXEL = 2.56 * 60 / TILE;
const size = Math.round(TILE * 3 * WORLD_PER_PIXEL);
const out = join(root, "public/assets/wildstat/soul-dimension/forest-road.webp");
await sharp(join(packageDir, entry, "asset")).extract({ left: 0, top: 0, width: TILE * 3, height: TILE * 3 })
  .resize(size, size, { kernel: "lanczos3" }).webp({ quality: 90, alphaQuality: 95, effort: 6 }).toFile(out);
console.log(`forest-road.webp ${size}x${size}`);
