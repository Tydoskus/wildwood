import { readFileSync } from "node:fs";
import { effectivePlayerPower, playerPowerForStats } from "../../shared/player-power";
import { MAP_IDS, MAP_DISPLAY_NAMES } from "../../shared/rules";
import { previewMapPowerRescale, compressLegacyMapPower } from "../../shared/map-power-rescale";

// Read-only preview of three owner-exported SQL JSON files. Prints no identities.
function readRows(path: string) {
  const result = JSON.parse(readFileSync(path, "utf8"))[0];
  const names = result.schema.elements.map((field: any) => field.name.some.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase()));
  return result.rows.map((row: unknown[]) => Object.fromEntries(names.map((name: string, i: number) => [name, name === "identity" ? String(row[i]) : row[i]])));
}
const [progressPath, researchPath, upgradesPath] = process.argv.slice(2);
if (!progressPath || !researchPath || !upgradesPath) throw new Error("Provide progress, research and upgrade SQL JSON exports");
const research = new Map(readRows(researchPath).map((row: any) => [row.identity, row]));
const upgrades = readRows(upgradesPath);
const progressRows = readRows(progressPath);
const results = progressRows.map((progress: any) => {
  const ranks = research.get(progress.identity);
  const level = (itemId: string) => upgrades.find((row: any) => row.identity === progress.identity && row.itemId === itemId)?.level ?? 0;
  const before = effectivePlayerPower(progress, ranks, level);
  const preview = previewMapPowerRescale(progress, before);
  return { map: MAP_DISPLAY_NAMES[MAP_IDS[preview.mapIndex]], before,
    after: effectivePlayerPower(preview.progress, ranks, level), factor: preview.factor,
    reference: preview.referencePower, mapIndex: preview.mapIndex, rawPower: playerPowerForStats(progress) };
});
results.forEach((row, index) => {
  const progress = progressRows[index];
  const scaled = compressLegacyMapPower(progress);
  row.factor = scaled.damage / progress.damage;
  const level = (itemId: string) => upgrades.find((entry: any) => entry.identity === progress.identity && entry.itemId === itemId)?.level ?? 0;
  row.after = effectivePlayerPower(scaled, research.get(progress.identity), level);
});
const ordered = [...results].sort((a, b) => a.before - b.before);
for (let i = 1; i < ordered.length; i++) {
  const previous = ordered[i - 1], next = ordered[i];
  if (Math.sign(previous.before - next.before) !== Math.sign(previous.after - next.after)) {
    throw new Error("Float32 storage changed power rank/ties; do not apply this preview.");
  }
}
const groups: Record<string, typeof results> = {};
for (const row of results) (groups[row.map] ??= []).push(row);
console.log(JSON.stringify({ players: results.length, affected: results.filter(row => row.factor < 1).length,
  maps: Object.entries(groups).map(([map, rows]) => ({ map, players: rows!.length,
    affected: rows!.filter(row => row.factor < 1).length,
    maxBefore: Math.max(...rows!.map(row => row.before)), maxAfter: Math.max(...rows!.map(row => row.after)),
    reference: rows![0].reference })),
  changed: results.filter(row => row.factor < 1).sort((a, b) => b.before - a.before),
}, null, 2));
