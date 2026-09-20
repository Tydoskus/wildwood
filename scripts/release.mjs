import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

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
const changelogPath = resolve(root, "src/app/changelog.ts");
const assetsPath = resolve(root, "public/assets");
const assetStampPath = resolve(root, "config/shipped-assets.json");

/**
 * A cached client keeps asking for the artwork it was built against, so
 * removing or renaming any of it without a new version leaves those players
 * with broken images and no prompt to refresh. Stamp what shipped, and refuse a
 * release whose artwork moved while the version stood still.
 */
async function shippedAssetDigest(directory) {
  const digest = createHash("sha256");
  const walk = async (dir) => {
    // Sort by code unit, not by locale: localeCompare orders differently under
    // another ICU build, which made this machine and the runner disagree.
    // Dot files are local clutter such as .DS_Store; they are ignored by git
    // and never reach a player, so counting them did the same.
    const entries = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => !entry.name.startsWith("."))
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else digest.update(`${relative(root, path)}:${(await stat(path)).size}\n`);
    }
  };
  await walk(directory);
  return digest.digest("hex");
}

const [settings, html, versionJson, changelog] = await Promise.all([
  readFile(settingsPath, "utf8"),
  readFile(htmlPath, "utf8"),
  readFile(versionPath, "utf8"),
  readFile(changelogPath, "utf8"),
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
  if (!changelog.split("export const RELEASE_DAYS")[1]?.includes(`"${currentVersion}": "`)) {
    throw new Error(`Missing release day for ${currentVersion}`);
  }
  const stamp = JSON.parse(await readFile(assetStampPath, "utf8").catch(() => "{}"));
  const digest = await shippedAssetDigest(assetsPath);
  if (stamp.assets && stamp.assets !== digest && stamp.version === currentVersion) {
    throw new Error(`Shipped artwork changed without a new version. Cached clients still request the old files. Run: npm run release -- <version>`);
  }
  process.exit(0);
}

const nextSettings = settings.replace(`const GAME_VERSION = "${currentVersion}";`, `const GAME_VERSION = "${nextVersion}";`);
const nextHtml = html
  .replaceAll(`v${currentVersion}`, `v${nextVersion}`)
  .replaceAll(`?v=${currentVersion}`, `?v=${nextVersion}`);
const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(new Date());
const releaseDay = ["year", "month", "day"].map(type => dateParts.find(part => part.type === type).value).join("-");
const daysHeading = "export const RELEASE_DAYS: Record<string, string> = {";
if (!changelog.includes(daysHeading)) throw new Error("Release-day registry was not found.");
const nextChangelog = changelog.split(daysHeading)[1].includes(`"${nextVersion}": "`)
  ? changelog : changelog.replace(daysHeading, `${daysHeading}\n  "${nextVersion}": "${releaseDay}",`);

await Promise.all([
  writeFile(assetStampPath, `${JSON.stringify({ version: nextVersion, assets: await shippedAssetDigest(assetsPath) }, null, 2)}\n`),
  writeFile(settingsPath, nextSettings),
  writeFile(htmlPath, nextHtml),
  writeFile(versionPath, `${JSON.stringify({ version: nextVersion })}\n`),
  writeFile(changelogPath, nextChangelog),
]);

console.log(`Release version updated: ${currentVersion} → ${nextVersion}`);
console.log("Add release notes for the new version in src/app/changelog.ts before committing.");
