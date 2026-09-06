import { readFileSync } from "node:fs";
import { effectivePlayerPowerStats } from "../../shared/player-power";
import { rescaleEndgameProgress, rescaleRankingConflict, rescaleRankingStats } from "../../shared/endgame-power-rescale";

// Owner SQL exports only. No writes and no account identities in the report.
function readRows(path: string) {
  const result = JSON.parse(readFileSync(path, "utf8"))[0];
  const names = result.schema.elements.map((field: any) => field.name.some.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase()));
  return result.rows.map((row: unknown[]) => Object.fromEntries(names.map((name: string, i: number) => [name, name === "identity" ? String(row[i]) : row[i]])));
}
const [progressPath, researchPath, upgradesPath, leaderboardPath] = process.argv.slice(2);
if (!progressPath || !researchPath || !upgradesPath || !leaderboardPath) {
  throw new Error("Provide progress, research, upgrade and leaderboard SQL JSON exports");
}
const research = new Map(readRows(researchPath).map((row: any) => [row.identity, row]));
const upgrades = readRows(upgradesPath);
const board = new Map<string, any>(readRows(leaderboardPath).map((row: any) => [row.identity, row]));
const plans = readRows(progressPath).map((progress: any) => {
  // SQL emits shortened decimal f32 values; reconstruct actual storage first.
  for (const key of ["damage", "maxHp", "armor", "regen", "attackRate"]) progress[key] = Math.fround(progress[key]);
  const level = (itemId: string) => upgrades.find((row: any) => row.identity === progress.identity && row.itemId === itemId)?.level ?? 0;
  const stats = (row: any) => rescaleRankingStats(effectivePlayerPowerStats(row, research.get(progress.identity), level));
  const next = rescaleEndgameProgress(progress);
  return { name: board.get(progress.identity)?.displayName ?? "Unlisted player", entry: board.get(progress.identity),
    before: stats(progress), after: stats(next), changed: next !== progress };
});
const displayed = plans.filter((plan: any) => plan.entry).map((plan: any) => ({
  before: {
    power: plan.entry.powerLevel || plan.entry.power,
    damage: Math.fround(plan.entry.damage), maxHp: Math.fround(plan.entry.maxHp),
    armor: Math.fround(plan.entry.armor), regen: Math.fround(plan.entry.regen),
  }, after: plan.after,
}));
const conflict = rescaleRankingConflict(plans) ?? rescaleRankingConflict(displayed);
if (conflict) throw new Error(`${conflict} ranking/ties changed; do not apply the conversion.`);
console.log(JSON.stringify({ players: plans.length, changed: plans.filter((plan: any) => plan.changed).length,
  preserved: ["power", "damage", "health", "armor", "regeneration"],
  playersChanged: plans.filter((plan: any) => plan.changed).sort((a: any, b: any) => b.before.power - a.before.power)
    .map(({ name, before, after }: any) => ({ name, before, after })),
}, null, 2));
