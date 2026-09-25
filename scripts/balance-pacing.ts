import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { CAMPAIGN_HEALTH_FACTORS } from '../shared/campaign-health-curve';
import { LIVE_BALANCE } from '../src/balance/live-balance';
import { CAMPAIGN_MAPS } from '../shared/campaign-registry';
import { resolveMapBalance, validateBalanceSettings } from '../shared/map-balance';
import { runBalanceSimulation, type BalanceSimulationConfig, type BalanceSimulationResult } from '../src/balance/simulator';

// Offline fit and verification. Writes reviewable settings, never publishes a server revision.
const out = resolve(process.argv[2] ?? 'local-data/balance-pacing');
mkdirSync(out, { recursive: true });
const save = (name: string, value: unknown) => writeFileSync(resolve(out, name), JSON.stringify(value, null, 2) + '\n');
const settings = validateBalanceSettings(LIVE_BALANCE.settings);
const ids = [...CAMPAIGN_MAPS.map(m => m.id), ...Array.from({ length: 1002 }, (_, i) => `endless_${i + 1}`)];
const freeze = () => ids.flatMap(id => ([1, 2] as const).map(v => resolveMapBalance(id, settings, LIVE_BALANCE.revision, v)));
const frozen = freeze();
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const baselineHash = digest(frozen);
assert.deepEqual(JSON.parse(JSON.stringify(frozen)), frozen, 'Frozen values must round-trip exactly');
save('baseline-values.json', { revision: LIVE_BALANCE.revision, capturedAt: LIVE_BALANCE.capturedAt, sha256: baselineHash, settings, maps: frozen });
const config: Partial<BalanceSimulationConfig> = {
  balanceSettings: settings, durationSeconds: 30 * 86400, trials: 20, seed: 1337,
  strategy: 'mixed', researchPlan: 'balanced', steadyEquipmentUpgrades: true, stopAfterCampaign: true,
};
const run = (label: string, overrides: Partial<BalanceSimulationConfig> = {}) => {
  console.log(label);
  const result = runBalanceSimulation({ ...config, ...overrides });
  save(`${label}.json`, result);
  return result;
};
const current = run('current');
const seconds = (result: BalanceSimulationResult) => result.maps.map(m => {
  if (m.completedPercent !== 100 || m.durationCensoredPercent !== 0 || m.durationMedianSeconds === null) {
    throw new Error(`Incomplete forecast for ${m.mapId}; do not present censored durations as completion times.`);
  }
  return m.durationMedianSeconds;
});
const baseline = seconds(current);
// Keep the opening map and total campaign budget, with equal positive steps.
// Fit every later map: leaving small dips untouched would break monotonic pacing.
const budget = baseline.reduce((a, b) => a + b, 0);
const step = (budget / baseline.length - baseline[0]) * 2 / (baseline.length - 1);
assert.ok(step > 0, 'Campaign budget must permit an increasing curve');
const target = baseline.map((_, i) => baseline[0] + step * i);
assert.ok(Math.abs(target.reduce((a,b)=>a+b,0) - budget) < 1e-7);
const fittedSettings = structuredClone(settings);
const smoothHealth = process.argv.includes('--smooth-health');
if (smoothHealth) fittedSettings.campaignHealthVersion = 1;
const lastMap = CAMPAIGN_MAPS.at(-1)!.id;
const iterations: { iteration: number; maximumTargetError: number }[] = [];
let proposed = current;
const resumeFile = process.argv.find(arg => arg.startsWith('--resume-file='))?.slice('--resume-file='.length);
const verifyFit = process.argv.find(arg => arg.startsWith('--verify-fit='))?.slice('--verify-fit='.length);
const resume = Boolean(verifyFit || resumeFile) || process.argv.includes('--resume-fit');
if (resume) {
  const saved = JSON.parse(readFileSync(verifyFit ?? resumeFile ?? resolve(out, 'proposal-fit-20.json'), 'utf8')) as BalanceSimulationResult;
  assert.deepEqual(saved.config.balanceSettings?.endless, settings.endless);
  Object.assign(fittedSettings, validateBalanceSettings(saved.config.balanceSettings));
  if (smoothHealth) fittedSettings.campaignHealthVersion = 1;
  proposed = run('resumed-fit', { balanceSettings: fittedSettings });
}
for (let iteration = 0; iteration < (smoothHealth ? 10 : resume ? 0 : 20); iteration++) {
  const measured = seconds(proposed);
  const maximumTargetError = Math.max(...measured.map((time, i) => Math.abs(time / target[i] - 1)));
  iterations.push({ iteration, maximumTargetError });
  if (maximumTargetError < .012 && measured.every((time, i) => i === 0 || time >= measured[i - 1])) break;
  for (let i = 1; i < baseline.length; i++) {
    const factor = fittedSettings.maps[current.maps[i].mapId];
    factor.enemyRewards = Math.max(.05, Math.min(5, factor.enemyRewards * (measured[i] / target[i]) ** .7));
  }
  // Existing Endless inheritance includes the final map's reward factor.
  // Offset that factor so campaign smoothing does not retune Endless payouts.
  fittedSettings.maps.endless.enemyRewards = settings.maps.endless.enemyRewards
    * settings.maps[lastMap].enemyRewards / fittedSettings.maps[lastMap].enemyRewards;
  proposed = run(`proposal-fit-${iteration + 1}`, { balanceSettings: structuredClone(fittedSettings) });
}
// Enforce ordering across reference/alternate seeds and strategy sensitivities.
// Split each correction across its neighboring maps to avoid simply lengthening
// the campaign. A 4% gap gives the forecast some room for seeded variation.
const constraintScenarios: Partial<BalanceSimulationConfig>[] = [
  {}, { seed: 7331 }, { strategy: 'natural', trials: 5 },
  { strategy: 'efficient', trials: 5 }, { researchPlan: 'off', steadyEquipmentUpgrades: false, trials: 5 },
];
for (let pass = 0; pass < (verifyFit ? 0 : 16); pass++) {
  const results = constraintScenarios.map((scenario, i) => run(`ordered-${pass}-${i}`,
    { ...scenario, balanceSettings: structuredClone(fittedSettings) }));
  proposed = results[0];
  const shifts = baseline.map(() => 0);
  for (let i = 1; i < baseline.length; i++) {
    const deficit = Math.max(...results.map(r => Math.log(seconds(r)[i - 1] * 1.04 / seconds(r)[i])));
    if (deficit <= 0) continue;
    // More reward shortens the preceding map; less reward lengthens this map.
    if (i > 1) shifts[i - 1] += deficit * .55;
    shifts[i] -= deficit * (i > 1 ? .55 : 1.1);
  }
  const budgetRatio = seconds(proposed).reduce((a,b)=>a+b,0) / budget;
  if (results.every(r => seconds(r).every((time, i, all) => i === 0 || time >= all[i - 1])) && Math.abs(budgetRatio - 1) < .015) break;
  assert.ok(pass < 15, 'Unable to fit monotonic pacing within the campaign budget');
  for (let i = 1; i < baseline.length; i++) {
    fittedSettings.maps[current.maps[i].mapId].enemyRewards *= Math.exp(shifts[i]) * budgetRatio ** .7;
  }
  fittedSettings.maps.endless.enemyRewards = settings.maps.endless.enemyRewards
    * settings.maps[lastMap].enemyRewards / fittedSettings.maps[lastMap].enemyRewards;
}
// Use precisely the configuration of the final measured run, not unmeasured next steps.
const proposedConfig = proposed.config;
assert.ok(proposedConfig.balanceSettings, 'Fitted settings missing');
const validationCurrent = run('current-independent-seed', { seed: 7331 });
const validation = run('proposal-independent-seed', { ...proposedConfig, seed: 7331 });
const scenarios = [
  { name: 'nearby-farming', config: { strategy: 'natural' as const, trials: 5 } },
  { name: 'efficient-farming', config: { strategy: 'efficient' as const, trials: 5 } },
  { name: 'no-research-or-slot-upgrades', config: { researchPlan: 'off' as const, steadyEquipmentUpgrades: false, trials: 5 } },
];
const sensitivity = scenarios.map(({ name, config: scenario }) => ({ name,
  current: run(`current-${name}`, scenario),
  proposed: run(`proposed-${name}`, { ...scenario, balanceSettings: proposedConfig.balanceSettings }),
}));
const after = freeze();
assert.equal(digest(after), baselineHash, 'Forecast mutated the gameplay baseline');
assert.deepEqual(after, frozen);
save('proposed-simulator-config.json', proposedConfig);
const dips = (r: BalanceSimulationResult) => seconds(r).flatMap((time, i, all) => i > 0 && time < all[i-1] ? [r.maps[i].mapId] : []);
const checks = [{ name: 'reference', result: proposed }, { name: 'independent-seed', result: validation },
  ...sensitivity.map(s => ({ name: s.name, result: s.proposed }))].map(s => ({ name: s.name, shorterMaps: dips(s.result) }));
save('monotonic-checks.json', checks);
assert.deepEqual(dips(proposed), [], 'Reference pacing still has a shorter map');
assert.ok(Math.abs(seconds(proposed).reduce((a,b)=>a+b,0) / budget - 1) < .015, 'Campaign budget changed by more than 1.5%');
assert.deepEqual(dips(validation), [], 'Independent seed pacing still has a shorter map');
for (const check of checks) assert.deepEqual(check.shorterMaps, [], `${check.name} still has shorter maps`);
// Compare everything except the intentionally edited campaign rewards.
for (const before of frozen) {
  const next = resolveMapBalance(before.mapId, proposedConfig.balanceSettings, LIVE_BALANCE.revision, before.configurationVersion === 2 ? 2 : 1);
  for (const [kind, enemy] of Object.entries(before.enemies)) {
    if (!before.mapId.startsWith('endless_')) {
      if (smoothHealth) {
        const factor = CAMPAIGN_HEALTH_FACTORS[before.mapId]?.[`${enemy.elite ? 'elite' : 'regular'}:${enemy.reward.type}`] ?? 1;
        assert.equal(next.enemies[kind].hp, enemy.hp * factor, 'Unexpected HP adjustment');
        next.enemies[kind].hp = enemy.hp;
      }
      next.enemies[kind].reward.amount = enemy.reward.amount;
    }
  }
  for (const [lane, row] of Object.entries(before.lanes)) {
    if (before.mapId.startsWith('endless_')) {
      assert.ok(Math.abs(next.lanes[lane].reward.amount / row.reward.amount - 1) < 1e-14, 'Endless reward changed');
      next.lanes[lane].reward.amount = row.reward.amount; // Ignore multiplication round-off only.
    }
  }
  assert.deepEqual(next, before, `Unexpected non-reward change in ${before.mapId}`);
}
save('proposed-balance-settings.json', proposedConfig.balanceSettings);
const hours = (n: number | null) => n === null ? '—' : `${(n / 3600).toFixed(2)}h`;
const total = (r: BalanceSimulationResult) => r.maps.every(m => m.completedPercent === 100 && m.durationCensoredPercent === 0)
  ? r.maps.reduce((sum, m) => sum + m.durationMedianSeconds!, 0) : null;
const rows = current.maps.map((m, i) => {
  const fitted = proposed.maps[i], checked = validation.maps[i];
  const factor = proposedConfig.balanceSettings!.maps[m.mapId].enemyRewards / settings.maps[m.mapId].enemyRewards;
  const budget = m.timeBudgetMedian;
  const budgetTotal = budget ? Object.values(budget).reduce((a,b)=>a+b,0) : 0;
  return { map: m.name, mapId: m.mapId, currentSeconds: baseline[i], currentP10: m.durationP10Seconds,
    currentP90: m.durationP90Seconds, proposedTargetSeconds: target[i], proposedSeconds: fitted.durationMedianSeconds,
    validationSeconds: checked.durationMedianSeconds, rewardFactor: factor,
    travelShare: budget && budgetTotal ? budget.travelSeconds / budgetTotal : null,
    proposedChange: factor === 1 ? 'Keep values' : `${factor.toFixed(3)}× current enemy rewards`,
  };
});
const healthElites = frozen.filter(m => m.configurationVersion === 2 && !m.mapId.startsWith('endless_'))
  .flatMap(m => Object.entries(m.enemies).filter(([,e]) => e.elite && e.reward.type === 'health')
    .map(([enemy,e]) => ({ map: m.mapId, enemy, hp: e.hp, reward: e.reward.amount })));
const plateau = healthElites.filter((e,i) => i > 0 && e.hp <= healthElites[i-1].hp);
const limitations = [
  'Simulation estimates, not measured player analytics. Time is active play starting after the private tutorial; offline rewards are excluded.',
  'Mixed strategies, 20 seeded runs, balanced Power research, random gear drops, and one continuously used slot-upgrade queue. Slots stay equipped and tiers persist across gear swaps.',
  'No prestige/perks, Utility research, bow-skill procs, extra purchased upgrade queues, simultaneous crowd combat, deaths, dodging, or recovery time. These can materially change real pacing.',
  'Nearby farming is a targeting-strategy comparison, not a faithful Auto Farm simulation.',
  'Both seed sets participate in the ordering fit. The alternate seed is a sensitivity check, not an unseen statistical holdout.',
  'Initial targets increase evenly, retaining Forest and the campaign budget. Neighboring rewards are then adjusted toward a 4% gap until every map increases in all five tested scenarios, keeping the reference budget within 1.5%.',
  `Enemy reward factors are fitted (bounded to 0.05–5×). ${smoothHealth ? 'Campaign HP uses the fixed-endpoint smoothed curve.' : 'Health is fixed.'} Damage, bosses, loot and respawn timers are fixed. Carried stats and research also affect later maps.`,
  'Sum of map medians is a pacing budget, not the median of complete campaign times. Timing percentiles describe these simulated seeds, not confidence intervals or the player population.',
  'Endless resolved values are frozen through its scaling cap. No Endless progression retune is proposed; changing campaign rewards can still change the build entering Endless.',
];
save('summary.json', { revision: LIVE_BALANCE.revision, baselineHash, unchangedSnapshots: frozen.length, limitations, iterations, checks, rows,
  currentBudgetSeconds: total(current), proposedBudgetSeconds: total(proposed), validationBudgetSeconds: total(validation), validationCurrentBudgetSeconds: total(validationCurrent), healthElitePlateaus: plateau });
const lines = [
  '# WildStat progression pacing — local proposal', '',
  `Live settings revision **${LIVE_BALANCE.revision}**, captured ${LIVE_BALANCE.capturedAt}.`,
  '**Local pacing settings only. No live balance changed.**', '',
  '## Before/after protection', '',
  `${frozen.length} resolved snapshots (15 campaign maps + Endless 1–1002, both wire versions) were frozen and compared after every forecast finished. All fields match exactly.`,
  `SHA-256: \`${baselineHash}\`. The JSON contains effective health, damage, rewards, boss attacks, drops, and timers. The neutral runtime bake is verified separately against the revision 73 fixture.`, '',
  '## Current pacing and proposed targets', '',
  `Sum of map medians: **${hours(total(current))} current → ${hours(total(proposed))} proposal**; independent-seed check **${hours(total(validationCurrent))} → ${hours(total(validation))}**.`, '',
  '| Map | Current estimate | Current P10–P90 | Proposed target | Proposed estimate | Independent seed | Proposed change |',
  '|---|---:|---:|---:|---:|---:|---|',
  ...rows.map(r => `| ${r.map} | ${hours(r.currentSeconds)} | ${hours(r.currentP10)}–${hours(r.currentP90)} | ${hours(r.proposedTargetSeconds)} | ${hours(r.proposedSeconds)} | ${hours(r.validationSeconds)} | ${r.proposedChange} |`), '',
  '## Other outliers to inspect separately', '',
  ...plateau.map(e => `- **${e.enemy}** (${e.map}): ${e.hp.toLocaleString('en-US')} HP, no increase over the previous map’s health elite. Current health reward: ${e.reward.toLocaleString('en-US')}. ${smoothHealth ? 'Smoothed by the health-elite curve, with map 15 HP fixed.' : 'Preserved unchanged in this proposal.'}`),
  `- Modeled travel consumes ${Math.round(Math.min(...rows.map(r=>r.travelShare ?? 0))*100)}–${Math.round(Math.max(...rows.map(r=>r.travelShare ?? 0))*100)}% of the measured map time. Review camp routes before trying to fix all delays through rewards or enemy HP.`, '',
  '## Sensitivity checks', '',
  '| Scenario | Current sum of map medians | Proposed sum of map medians | Shorter maps after fit |', '|---|---:|---:|---:|',
  ...sensitivity.map(s=>`| ${s.name} | ${hours(total(s.current))} | ${hours(total(s.proposed))} | ${dips(s.proposed).length} |`), '',
  '## Assumptions and limits', '', ...limitations.map(s=>`- ${s}`), '',
  '## How to use this', '',
  '1. Use proposed-balance-settings.json as the complete fitted configuration; do not multiply its factors into the defaults a second time.',
  '2. Validate the largest proposed changes locally with real Auto Farm and boss fights, including low and high research/slot builds.',
  '3. Extend simulator parity for bow skills, Utility research and prestige before calling these production-ready targets.',
  '4. Keep the revision 73 fixture unchanged: it verifies the neutral bake separately from these intentional pacing changes.', '',
  'Reproduce with `npm run balance:pacing`. Raw runs, the frozen baseline, and proposed simulator configuration are beside this report.', '',
];
writeFileSync(resolve(out, 'report.md'), lines.join('\n'));
console.log(`Report: ${resolve(out, 'report.md')}`);
