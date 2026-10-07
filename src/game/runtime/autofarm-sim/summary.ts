import { formatCompactNumber } from '../../../../shared/compact-number';
import type { VirtualPlayerReport } from './virtual-player';
import type { ReferenceBuild } from './reference-builds';

const minutes = (seconds: number) => `${(seconds / 60).toFixed(1)}m`;
const share = (part: number, whole: number) => whole > 0 ? `${Math.round(part / whole * 100)}%` : '-';
const power = (value: number) => formatCompactNumber(Math.round(value));

/** A plain-text digest of virtual-player runs: maps, deaths, boss tries, time use. */
export function summarize(reports: readonly VirtualPlayerReport[], references: readonly ReferenceBuild[] = []) {
  const lab = (mapId: string) => references.find(entry => entry.mapId === mapId)?.minutes;
  const lines: string[] = [];
  for (const report of reports) {
    const total = report.simSeconds;
    lines.push(`=== ${report.name}: ${minutes(total)} simulated in ${(report.wallMs / 1000).toFixed(1)}s (${(total / Math.max(1e-3, report.wallMs / 1000)).toFixed(0)}x)`);
    lines.push(`power ${power(report.startPower)} -> ${power(report.endPower)}  kills ${report.kills}  end ${report.endMap}`);
    lines.push(`maps: ${report.visits.map(visit => `${visit.map}[${minutes((visit.to ?? total) - visit.from)}${lab(visit.map) != null ? ` (lab ${lab(visit.map)!.toFixed(0)}m)` : ''} ${visit.deaths}d ${power(visit.entryPower)}->${power(visit.exitPower ?? report.endPower)}${visit.reason && visit.reason !== 'start' ? ` via ${visit.reason}` : ''}]`).join(' > ')}`);
    const deaths = report.deaths;
    lines.push(`deaths ${deaths.length}: farm ${deaths.filter(death => death.phase === 'farm' && !death.probation && !death.afterBossLeave).length}, boss ${deaths.filter(death => death.phase === 'boss' || death.afterBossLeave).length}, probation ${deaths.filter(death => death.probation && death.phase !== 'boss').length}, portal ${deaths.filter(death => death.phase === 'portal').length}`);
    const causes: Record<string, number> = {};
    for (const death of deaths) {
      const top = Object.entries(death.taken ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?';
      const key = `${death.phase}/${top}${(death.biggestHit ?? 0) >= .5 ? ' (one hit >= 50%)' : ''}`;
      causes[key] = (causes[key] ?? 0) + 1;
    }
    if (deaths.length) lines.push(`death causes (phase/main damage): ${Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([key, count]) => `${key} ${count}`).join(', ')}`);
    const tries = report.bossAttempts;
    lines.push(`boss tries ${tries.length}: ${['won', 'walked', 'died', 'other', null].map(outcome => `${outcome ?? 'open'} ${tries.filter(entry => entry.outcome === outcome).length}`).join(', ')}`);
    for (const entry of tries.slice(0, 12)) {
      lines.push(`  t=${minutes(entry.t)} ${entry.map} power ${power(entry.power)} ${entry.outcome} after ${entry.fightSeconds.toFixed(0)}s fighting; boss ${(entry.bossShareStart * 100).toFixed(0)}%->${((entry.bossShareEnd ?? 0) * 100).toFixed(0)}%, player ${((entry.playerShareStart ?? 1) * 100).toFixed(0)}%->${((entry.playerShareEnd ?? 0) * 100).toFixed(0)}%${entry.foughtOn ? `; fought on: ${entry.foughtOn.won ? 'WON' : 'lost'} in ${entry.foughtOn.seconds.toFixed(0)}s (boss ${(entry.foughtOn.bossShare * 100).toFixed(0)}%)` : ''}`);
    }
    for (const travel of report.travels) lines.push(`  travel t=${minutes(travel.t)} ${travel.from} -> ${travel.to} (${travel.why}) at ${power(travel.power)}, gain here ${travel.rateHere === null ? 'n/a' : power(travel.rateHere) + '/min'}`);
    lines.push(`time: ${Object.entries(report.activity).sort((a, b) => b[1] - a[1]).map(([key, value]) => `${key} ${share(value, total)}`).join(', ')}`);
    const farmed = Object.values(report.groups).reduce((sum, value) => sum + value, 0);
    lines.push(`groups: ${Object.entries(report.groups).sort((a, b) => b[1] - a[1]).map(([key, value]) => `${key} ${share(value, farmed)}`).join(', ')}`);
    // Waits and powers vary by the minute: one line per kind of status.
    const kinds: Record<string, { first: number; seconds: number }> = {};
    for (const [key, value] of Object.entries(report.bossStatuses)) {
      const kind = key.replace(/ In \d+ Min$/, ' In N Min').replace(/ At [\d.]+[a-z]*$/, ' At X');
      const entry = kinds[kind] ??= { first: value.first, seconds: 0 };
      entry.seconds += value.seconds; entry.first = Math.min(entry.first, value.first);
    }
    lines.push(`bossStatus: ${Object.entries(kinds).sort((a, b) => b[1].seconds - a[1].seconds).map(([key, value]) => `"${key}" ${share(value.seconds, total)} (from ${minutes(value.first)})`).join(', ')}`);
    lines.push(`status: ${Object.entries(report.statuses).sort((a, b) => b[1].seconds - a[1].seconds).slice(0, 10).map(([key, value]) => `"${key}" ${share(value.seconds, total)}`).join(', ')}`);
    if (report.stuck.length) lines.push(`stuck: ${report.stuck.map(entry => `t=${minutes(entry.t)} ${entry.seconds.toFixed(0)}s "${entry.status}" on ${entry.map}`).join('; ')}`);
    if (report.autofarmStopped.length) lines.push(`autofarm stopped: ${report.autofarmStopped.map(entry => `t=${minutes(entry.t)} "${entry.status}"`).join('; ')}`);
    lines.push('');
  }
  return lines.join('\n');
}
