/**
 * Read-only: who has been paid kills faster than honest play, and who the
 * server has written down for it.
 *
 * The kill-gem ledger holds one row per 1,200 paid kills, stamped with the
 * account's lifetime kill count and the time. Between two rows, kills per
 * second of wall time is what the account was paid, online and offline
 * together (offline progress accrues at or below the honest rate over the
 * same absence, so it cannot inflate it). Kills that arrive in bulk (a guest
 * account merged in, tooling) leave no rows in between and show as a single
 * jump rather than sustained time above a rate.
 *
 * Alongside it, the moderation lines the server writes by itself:
 * sustained_kill_rate (paid kills above honest play for a stretch) and
 * simulation_clock_ahead (a game clock running faster than real time).
 *
 *   npm run audit:kill-rates
 *   npm run audit:kill-rates -- --top 30 --above 2.2
 *
 * Nothing here writes.
 */
import { execFileSync } from "node:child_process";

type Row = Record<string, any>;
const DATABASE = "wildwood-coop";
const args = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && Number.isFinite(Number(args[index + 1])) ? Number(args[index + 1]) : fallback;
};
const TOP = option("top", 20);
const ABOVE = option("above", 2.2);
const WINDOW_SECONDS = 15 * 60;

function sql(query: string): Row[] {
  const output = execFileSync(process.env.SPACETIME_BIN || "spacetime", [
    "sql", DATABASE, "--server", "maincloud", "--format", "json", query,
  ], { encoding: "utf8", timeout: 120_000, maxBuffer: 512 * 1024 * 1024 });
  const table = JSON.parse(output)[0];
  if (!table?.rows) return [];
  return table.rows.map((row: any[]) => Object.fromEntries(table.schema.elements
    .map((element: any, index: number) => [element.name?.some ?? element.name, row[index]])));
}

/** Identities arrive as ["0x…"] and timestamps as [micros]. */
const unwrap = (value: any) => Array.isArray(value) ? value[0] : value;
const hex = (identity: any) => String(unwrap(identity)).replace(/^0x/i, "").toLowerCase();
const seconds = (timestamp: any) => Number(unwrap(timestamp)) / 1e6;
const when = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString().slice(5, 16).replace("T", " ");

const names = new Map(sql("SELECT identity, display_name FROM player_profile").map(row => [hex(row.identity), row.display_name as string]));
const nameOf = (identity: string) => names.get(identity) || identity.slice(0, 12);

const series = new Map<string, { at: number; kills: number }[]>();
for (const row of sql("SELECT identity, external_reference, created_at FROM gem_transaction WHERE kind = 'enemy_kills'")) {
  const match = /^kill-gems:([0-9a-f]{64}):(\d+)$/.exec(String(row.external_reference));
  if (!match) continue; // retroactive grants carry no kill count
  const points = series.get(match[1]) ?? [];
  points.push({ at: seconds(row.created_at), kills: Number(match[2]) });
  series.set(match[1], points);
}

/**
 * Reported kills write a ledger row every 1,200, and offline progress adds at
 * most an hour and a half of farming between two of them. An interval holding
 * more than this came in bulk (a guest account merged in, tooling), not from
 * farming at any rate, and is left out of the rates.
 */
const BULK_KILLS = 4 * 1_200;
type Summary = { identity: string; peak: number; peakAt: number; hoursAbove: number; jumps: number; first: number; last: number };
const summaries: Summary[] = [];
for (const [identity, points] of series) {
  points.sort((a, b) => a.at - b.at);
  let peak = 0, peakAt = 0, hoursAbove = 0, jumps = 0;
  let j = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[i + 1];
    if (b && b.kills >= a.kills && b.at > a.at) {
      const rate = (b.kills - a.kills) / (b.at - a.at);
      if (b.kills - a.kills > BULK_KILLS) jumps++;
      else if (rate >= ABOVE && b.at - a.at <= 3_600) hoursAbove += (b.at - a.at) / 3_600;
    }
    j = Math.max(j, i + 1);
    while (j < points.length && points[j].at - a.at < WINDOW_SECONDS) j++;
    if (j >= points.length) continue;
    const c = points[j];
    if (c.kills < a.kills || points.slice(i, j).some((p, k) => points[i + k + 1].kills - p.kills > BULK_KILLS)) continue;
    const rate = (c.kills - a.kills) / (c.at - a.at);
    if (rate > peak) { peak = rate; peakAt = a.at; }
  }
  summaries.push({ identity, peak, peakAt, hoursAbove, jumps, first: points[0].at, last: points.at(-1)!.at });
}

const peaks = summaries.map(summary => summary.peak).sort((a, b) => a - b);
const percentile = (p: number) => peaks.length ? peaks[Math.min(peaks.length - 1, Math.floor(peaks.length * p))] : 0;
console.log(`Kill-gem ledger: ${summaries.length} accounts, ${when(Math.min(...summaries.map(s => s.first)))} to ${when(Math.max(...summaries.map(s => s.last)))} UTC.`);
console.log(`Best fifteen minutes per account: median ${percentile(.5).toFixed(2)}/s, p99 ${percentile(.99).toFixed(2)}/s.\n`);

console.log(`Time paid above ${ABOVE}/s (the most suspicious first):`);
const suspicious = summaries.filter(summary => summary.hoursAbove > 0 || summary.peak >= ABOVE)
  .sort((a, b) => b.hoursAbove - a.hoursAbove || b.peak - a.peak);
if (!suspicious.length) console.log("  nobody");
for (const summary of suspicious.slice(0, TOP))
  console.log(`  ${nameOf(summary.identity).padEnd(22)} ${(summary.hoursAbove * 60).toFixed(0).padStart(5)} min above   best 15 min ${summary.peak.toFixed(2)}/s at ${when(summary.peakAt)}`);

console.log(`\nFastest ${TOP} by best fifteen minutes:`);
for (const summary of [...summaries].sort((a, b) => b.peak - a.peak).slice(0, TOP))
  console.log(`  ${nameOf(summary.identity).padEnd(22)} ${summary.peak.toFixed(2)}/s at ${when(summary.peakAt)}${summary.jumps ? `   (${summary.jumps} bulk jump${summary.jumps > 1 ? "s" : ""} excluded)` : ""}`);

const flags = sql("SELECT target_identity, target_name, rule, reason, recorded_at FROM moderation_action WHERE actor_type = 'automatic'")
  .filter(row => ["pay_ceiling_shadow", "sustained_kill_rate", "simulation_clock_ahead", "enemy_defeat_allowance", "movement_speed_allowance"].includes(row.rule));
console.log("\nAutomatic flags by the server:");
if (!flags.length) console.log("  none");
const byAccount = new Map<string, Row[]>();
for (const row of flags) byAccount.set(`${row.target_name}|${row.rule}`, [...(byAccount.get(`${row.target_name}|${row.rule}`) ?? []), row]);
for (const [key, rows] of [...byAccount].sort((a, b) => b[1].length - a[1].length)) {
  const [name, rule] = key.split("|");
  const times = rows.map(row => seconds(row.recorded_at)).sort((a, b) => a - b);
  console.log(`  ${(name || "?").padEnd(22)} ${rule.padEnd(24)} ${String(rows.length).padStart(3)}x  ${when(times[0])}${rows.length > 1 ? ` .. ${when(times.at(-1)!)}` : ""}`);
}
console.log("\npay_ceiling_shadow: the pay ceiling would have paid this account less (watching only; nothing clipped). Before enforcing it, every name here should be a cheater.");
console.log("sustained_kill_rate and simulation_clock_ahead are written by 0.827 and later; enemy_defeat_allowance and movement_speed_allowance are the retired rules from 09-18 to 09-21, which also caught honest players.");
