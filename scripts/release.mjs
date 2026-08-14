import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const nextVersion = process.argv[2];
const checkOnly = process.argv.includes("--check");

if ((checkOnly && process.argv.length !== 3) || (!checkOnly && !/^\d+(?:\.\d+)+$/.test(nextVersion ?? ""))) {
  console.error("Usage: npm run release -- <version> | npm run check:release");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");
const settingsPath = resolve(root, "src/game/runtime/game-settings.ts");
const htmlPath = resolve(root, "public/index.html");
const versionPath = resolve(root, "public/version.json");

const [settings, html, versionJson] = await Promise.all([
  readFile(settingsPath, "utf8"),
  readFile(htmlPath, "utf8"),
  readFile(versionPath, "utf8"),
]);

const currentMatch = settings.match(/const GAME_VERSION = "([^"]+)";/);
if (!currentMatch) throw new Error("GAME_VERSION was not found in src/game/runtime/game-settings.ts");
const currentVersion = currentMatch[1];
const staticVersion = JSON.parse(versionJson).version;
const htmlVersions = [...html.matchAll(/(?:v|\?v=)(\d+(?:\.\d+)+)/g)].map((match) => match[1]);

if (checkOnly) {
  if (staticVersion !== currentVersion || htmlVersions.some((value) => value !== currentVersion)) {
    throw new Error(`Release version mismatch: settings=${currentVersion}, version.json=${staticVersion}, index.html=${[...new Set(htmlVersions)].join(",")}`);
  }
  process.exit(0);
}

const nextSettings = settings.replace(`const GAME_VERSION = "${currentVersion}";`, `const GAME_VERSION = "${nextVersion}";`);
const nextHtml = html
  .replaceAll(`v${currentVersion}`, `v${nextVersion}`)
  .replaceAll(`?v=${currentVersion}`, `?v=${nextVersion}`);

await Promise.all([
  writeFile(settingsPath, nextSettings),
  writeFile(htmlPath, nextHtml),
  writeFile(versionPath, `${JSON.stringify({ version: nextVersion })}\n`),
]);

console.log(`Release version updated: ${currentVersion} → ${nextVersion}`);
console.log("Add release notes for the new version in src/app/changelog.ts before committing.");
