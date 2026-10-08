/**
 * Calibration of the growth forecast (src/game/runtime/growth-forecast.ts)
 * against real combat: opt-in, so it never slows `npx vitest run` or CI.
 *
 *   FORECAST_CALIBRATION=survey npx vitest run src/game/runtime/autofarm-sim/forecast-calibration.test.ts --silent=false
 *       runs every build on every option in the real-combat harness and saves what it measured
 *   FORECAST_CALIBRATION=compare npx vitest run ... (same file)
 *       prices the same options with the forecast and prints measured against forecast
 *
 *   FORECAST_CALIBRATION_MINUTES=15        simulated minutes per run
 *   FORECAST_CALIBRATION_ONLY=tank,fresh   builds to run
 *   FORECAST_CALIBRATION_OUT=dir           where results go (default: the system temp directory)
 */
import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The harness's hooks reach the mock through a global: importing the harness
// from the factory would wait on the very module the factory is building.
vi.mock('../auto-farm-controller', async importOriginal => {
  const actual = await importOriginal<typeof import('../auto-farm-controller')>();
  return { ...actual, createAutoFarmController: (options: Parameters<typeof actual.createAutoFarmController>[0]) => {
    const hooks = (globalThis as { __forecastHarness?: import('./forecast-harness').HarnessHooks }).__forecastHarness;
    const controller = actual.createAutoFarmController(hooks ? hooks.options(options) : options);
    return hooks ? hooks.capture(controller) : controller;
  } };
});
// The Soul Dimension's camps are filled by its runtime, which the virtual player does not run:
// the harness hands the world the sites it would have filled (forecast-soul.ts).
vi.mock('../../world', async importOriginal => {
  const actual = await importOriginal<typeof import('../../world')>();
  return { ...actual, createSpawnSites: (...args: Parameters<typeof actual.createSpawnSites>) => {
    const soul = (globalThis as { __forecastSoulSites?: (mapId: string) => ReturnType<typeof actual.createSpawnSites> | null }).__forecastSoulSites;
    return soul?.(args[1] ?? '') ?? actual.createSpawnSites(...args);
  } };
});

// What combat did, frame by frame: the hits the player took (melee and shots), the shots fired at it,
// and how many enemies were fighting it, each weighed by its attack speed (forecast-harness.ts CombatMeasure).
vi.mock('../enemy-simulation', async importOriginal => {
  const actual = await importOriginal<typeof import('../enemy-simulation')>();
  return { ...actual, createEnemySimulation: (...args: Parameters<typeof actual.createEnemySimulation>) => {
    const [enemies, spawnShot, player, viewport, engage, damagePlayer, shared] = args;
    (globalThis as { __forecastPlayer?: unknown }).__forecastPlayer = player;
    const measure = () => (globalThis as { __forecastMeasure?: import('./forecast-harness').CombatMeasure }).__forecastMeasure;
    let lastHp = player.hp, meleeThisFrame = 0;
    const simulation = actual.createEnemySimulation(enemies,
      (...shot) => { const counts = measure(); if (counts) counts.shotsFired++; return spawnShot(...shot); },
      player, viewport, engage,
      (amount, source) => {
        const landed = damagePlayer(amount, source);
        const counts = measure();
        if (landed && counts) { counts.meleeHits++; meleeThisFrame++; }
        return landed;
      }, shared);
    const trace = (globalThis as { __forecastTrace?: (enemies: unknown[], player: unknown, dt: number) => void }).__forecastTrace;
    return { ...simulation, update: (dt: number) => {
      trace?.(enemies, player, dt);
      const counts = measure();
      // A drop in health since the last frame that melee did not cause is a shot (or a boss) landing.
      if (counts && player.hp < lastHp - 1e-9 && meleeThisFrame === 0) counts.otherHits++;
      // Health lost since the last frame (shots land after the enemies move), and in this one (melee blows land in it).
      if (counts && player.hp > 0) {
        counts.aliveSeconds += dt;
        if (player.hp < lastHp) counts.damageTaken += (lastHp - player.hp) / Math.max(1, player.maxHp);
      }
      meleeThisFrame = 0;
      const before = player.hp;
      simulation.update(dt);
      if (counts && player.hp < before) counts.damageTaken += (before - Math.max(0, player.hp)) / Math.max(1, player.maxHp);
      if (counts) for (const enemy of enemies) {
        if (enemy.dead || !enemy.engaged || enemy.generatedBoss) continue;
        const definition = enemy.definition ?? counts.enemyTypes[enemy.type];
        const ranged = Boolean(definition?.ranged), speed = definition?.attackSpeed ?? 0;
        // Near: inside the room kiting keeps (a melee enemy), or in its firing range (a ranged one).
        const gap = Math.hypot(enemy.x - player.x, enemy.y - player.y) - enemy.r - player.r;
        if (ranged) { counts.rangedEngagedSeconds += dt; if (gap < player.attackRange) { counts.rangedNearSeconds += dt; counts.rangedPotentialHits += dt * speed; } }
        else { counts.meleeEngagedSeconds += dt; if (gap < 160) { counts.meleeNearSeconds += dt; counts.meleePotentialHits += dt * speed; } }
      }
      lastHp = player.hp;
    } };
  } };
});

// Each kill, by the stat it paid: a fight wakes bystanders, and what they pay is part of the growth.
vi.mock('../player-combat-controller', async importOriginal => {
  const actual = await importOriginal<typeof import('../player-combat-controller')>();
  return { ...actual, createPlayerCombatController: (options: Parameters<typeof actual.createPlayerCombatController>[0]) =>
    actual.createPlayerCombatController({ ...options, recordRegularEnemyDefeat: (mapId, enemy) => {
      const counts = (globalThis as { __forecastMeasure?: import('./forecast-harness').CombatMeasure }).__forecastMeasure;
      if (counts) {
        // The Soul Dimension's kills name their species (the soul runtime is not running): each wears one soul stat.
        const soul = mapId === 'soul_dimension' ? Object.entries(SOUL_ENEMY_SPECIES).find(([, species]) => species === enemy)?.[0] : null;
        const site = /^site:(\d+)$/.exec(enemy), stat = soul ? `soul:${soul}`
          : `stat:${(site ? options.spawnSites[Number(site[1])]?.definition : counts.enemyTypes[enemy])?.reward.type ?? '?'}`;
        counts.killsByGroup[stat] = (counts.killsByGroup[stat] ?? 0) + 1;
      }
      options.recordRegularEnemyDefeat(mapId, enemy);
    } }) };
});

const { SOUL_ENEMY_SPECIES } = await import('../../soul-world');
const { runOption } = await import('./forecast-harness');
const { calibrationBuilds: mainBuilds, ablationBuilds, nextMapProfile } = await import('./forecast-builds');
/** Every build: the main set, and the one-change-at-a-time set for damage. */
const calibrationBuilds = (references: Parameters<typeof mainBuilds>[0]) => [...mainBuilds(references), ...ablationBuilds(references)];
const { campaignReferenceBuilds } = await import('./reference-builds');
const { calibrationMapGroups, installSoulSites } = await import('./forecast-soul');
const { compareCalibration } = await import('./forecast-compare');
const { FORECAST_TUNING } = await import('../growth-forecast');

const mode = process.env.FORECAST_CALIBRATION ?? '';
const minutes = Number(process.env.FORECAST_CALIBRATION_MINUTES ?? 15);
const only = (process.env.FORECAST_CALIBRATION_ONLY ?? '').split(',').filter(Boolean);
const out = process.env.FORECAST_CALIBRATION_OUT ?? join(tmpdir(), 'wildstat-forecast-calibration');
const resultsDir = join(out, 'runs');

describe.skipIf(mode !== 'survey')('growth forecast calibration: real combat', () => {
  it('runs every build on every option', async () => {
    mkdirSync(resultsDir, { recursive: true });
    const references = campaignReferenceBuilds(out);
    for (const build of calibrationBuilds(references).filter(entry => !only.length || only.includes(entry.name))) {
      for (const [which, profile] of [['current', build.profile], ['next', nextMapProfile(build)]] as const) {
        if (!profile) continue;
        installSoulSites(build, profile);
        const groups = calibrationMapGroups(profile.startMap, build);
        // Kited singles (autofarm's own way with a bow), pulls of one group, Auto's pick pulled, the whole map pulled,
        // and standing singles (no backing away from melee enemies).
        // Kited singles (autofarm's own way with a bow), standing singles (its kite off), each group pulled whole,
        // and the whole map pulled. The one-change-at-a-time builds are about damage: kited singles and the whole pull.
        const ablation = build.name.startsWith('ablation-');
        const options: import('./forecast-harness').HarnessOption[] = [
          { group: 'all', pull: true, pullCamps: groups.length },
          ...[null, ...groups].flatMap(group => [
            { group, pull: false },
            ...ablation ? [] : [{ group, pull: false, kite: false }],
            ...ablation || !group ? [] : [{ group, pull: true }],
          ]),
        ];
        for (const option of options) {
          const mode = option.pull ? 'pull' : option.kite === false ? 'standing' : 'single';
          const file = join(resultsDir, `${build.name}.${which}.${option.group ?? 'auto'}.${mode}.json`);
          if (existsSync(file) && process.env.FORECAST_CALIBRATION_RERUN !== '1') continue;
          const result = await runOption(profile, option, minutes * 60);
          writeFileSync(file, JSON.stringify({ build: build.name, which, ...result }, null, 1));
          console.log(`${build.name} ${which} ${profile.startMap} ${option.group ?? 'auto'} ${mode}: `
            + `${result.powerPerMinute.toFixed(2)}/min, ${result.deaths} deaths, ${result.kills} kills (${(result.wallMs / 1000).toFixed(1)}s)`);
        }
      }
    }
  }, 24 * 3600_000);
});

describe.skipIf(mode !== 'trace')('growth forecast calibration: one run, second by second', () => {
  it('traces a run', async () => {
    const [name, which, group, pull, seconds] = (process.env.FORECAST_TRACE ?? 'early,current,stat:health,pull,60').split(',');
    const build = calibrationBuilds(campaignReferenceBuilds(out)).find(entry => entry.name === name)!;
    const profile = which === 'next' ? nextMapProfile(build)! : build.profile;
    installSoulSites(build, profile);
    const { ENEMY_TYPES } = await import('../../enemies');
    let clock = 0, next = 0;
    const lines: string[] = [];
    (globalThis as { __forecastTrace?: unknown }).__forecastTrace = (enemies: import('../types').EnemyState[], player: import('../types').PlayerState, dt: number) => {
      clock += dt;
      if (clock < next) return;
      next += 1;
      const near = enemies.filter(enemy => !enemy.dead && (enemy.engaged || Math.hypot(enemy.x - player.x, enemy.y - player.y) < 400))
        .map(enemy => `${enemy.type}${(enemy.definition ?? ENEMY_TYPES[enemy.type]).ranged ? 'R' : ''}${enemy.engaged ? '*' : ''}${enemy.leashing ? 'L' : ''}@${Math.round(Math.hypot(enemy.x - player.x, enemy.y - player.y))}:${Math.round(enemy.hp / enemy.maxHp * 100)}%`);
      lines.push(`${clock.toFixed(0)} (${Math.round(player.x)},${Math.round(player.y)}) hp ${Math.round(player.hp / player.maxHp * 100)}% ${near.join(' ')}`);
    };
    const result = await runOption(profile, { group: group === 'auto' ? null : group, pull: pull === 'pull' }, Number(seconds));
    (globalThis as { __forecastTrace?: unknown }).__forecastTrace = undefined;
    writeFileSync(join(out, 'trace.txt'), [...lines, JSON.stringify({ ...result, minutes: undefined })].join('\n'));
  }, 3600_000);
});

describe.skipIf(mode !== 'compare')('growth forecast calibration: forecast against real combat', () => {
  it('prices every measured option', () => {
    const references = campaignReferenceBuilds(out);
    const runs = readdirSync(resultsDir).filter(file => file.endsWith('.json')).map(file => JSON.parse(readFileSync(join(resultsDir, file), 'utf8')));
    const report = compareCalibration(calibrationBuilds(references).filter(entry => !only.length || only.includes(entry.name)), runs);
    writeFileSync(join(out, 'compare.txt'), report.text);
    writeFileSync(join(out, 'compare.json'), JSON.stringify(report.rows, null, 1));
    console.log(report.text);
    expect(report.rows.length).toBeGreaterThan(0);
  }, 3600_000);
});

/** The tuning the forecast is fitted by: each constant tried at these values, in turn, keeping what lowers the loss. */
const TUNING_GRID: Partial<Record<keyof typeof FORECAST_TUNING, number[]>> = {
  kiteScale: [.5, .65, .8, 1, 1.25, 1.5],
  kiteCrowdPenalty: [0, .1, .25, .5, 1],
  shotLandShare: [0, .1, .2, .35, .5, .75],
  pullShotLandShare: [0, .05, .1, .2, .35, .5],
  wakeDrift: [0, 50, 100, 175, 250],
  contactPacking: [.5, .75, 1, 1.25],
  incomingEfficiency: [.7, .85, 1, 1.2],
  primaryEfficiency: [.7, .85, 1, 1.15, 1.3],
  splashEfficiency: [.25, .5, .75, 1, 1.25],
  sideArrowHitShare: [0, .25, .5, .75, 1],
  pierceLineShare: [0, .25, .5, .75],
  retargetSeconds: [0, .3, .6, 1, 1.5],
  orbitLeak: [0, .05, .1, .2, .35],
};

describe.skipIf(mode !== 'fit')('growth forecast calibration: fitting the tuning', () => {
  it('fits the tuning on half the builds and checks it on the other half', () => {
    const builds = calibrationBuilds(campaignReferenceBuilds(out));
    const runs = readdirSync(resultsDir).filter(file => file.endsWith('.json')).map(file => JSON.parse(readFileSync(join(resultsDir, file), 'utf8')));
    const fit = (subset: typeof builds) => {
      let tuning = { ...FORECAST_TUNING };
      let loss = compareCalibration(subset, runs, tuning).score.loss;
      for (let pass = 0; pass < 2; pass++) for (const [key, values] of Object.entries(TUNING_GRID) as [keyof typeof FORECAST_TUNING, number[]][]) {
        for (const value of values) {
          const tried = { ...tuning, [key]: value };
          const next = compareCalibration(subset, runs, tried).score.loss;
          if (next < loss - 1e-6) { loss = next; tuning = tried; }
        }
      }
      return { tuning, loss };
    };
    const lines: string[] = [];
    const before = compareCalibration(builds, runs, FORECAST_TUNING).score;
    lines.push('Shipped tuning, every build:', before.text, '');
    const halves = [builds.filter((_, index) => index % 2 === 0), builds.filter((_, index) => index % 2 === 1)];
    for (const [index, half] of halves.entries()) {
      const fitted = fit(half);
      const other = compareCalibration(halves[1 - index], runs, fitted.tuning).score;
      lines.push(`Fitted on ${half.map(build => build.name).join(', ')}: ${JSON.stringify(fitted.tuning)}`, `checked on the others: ${other.text}`, '');
    }
    const all = fit(builds);
    lines.push(`Fitted on every build: ${JSON.stringify(all.tuning)}`, compareCalibration(builds, runs, all.tuning).score.text);
    writeFileSync(join(out, 'fit.txt'), lines.join('\n'));
    console.log(lines.join('\n'));
  }, 3600_000);
});

/**
 * Best Gain against growth: each build an hour on its own map (no travel), one
 * group at a time as autofarm farms it, the group picked (a) by Auto's Best
 * Gain, (b) every 20 seconds by growthStatChoice over this map's options.
 *   FORECAST_CALIBRATION=growth FORECAST_CALIBRATION_MINUTES=60 npx vitest run ...
 */
describe.skipIf(mode !== 'growth')('growth forecast calibration: Best Gain against growth', () => {
  it('farms each build an hour each way', async () => {
    const { growthStatChoice } = await import('../growth-forecast');
    const { calibrationInputs } = await import('./forecast-compare');
    const dir = join(out, 'growth');
    mkdirSync(dir, { recursive: true });
    const horizons = (process.env.FORECAST_GROWTH_HORIZONS ?? '60').split(',').map(Number);
    for (const build of mainBuilds(campaignReferenceBuilds(out)).filter(entry => !only.length || only.includes(entry.name))) {
      installSoulSites(build, build.profile);
      const inputs = calibrationInputs(build, build.profile);
      const choosers = [
        { name: 'best-gain', option: { group: null, pull: false } },
        ...horizons.map(horizonMinutes => ({ name: `growth-${horizonMinutes}`, option: { group: null, pull: false, chooserName: `growth-${horizonMinutes}`,
          chooser: (live: { base: import('../../../../shared/player-power').PlayerPowerStats; x: number; y: number; health: number }) =>
            growthStatChoice({ current: inputs.map, build: { ...inputs.build, base: live.base }, start: { x: live.x, y: live.y }, health: live.health, horizonMinutes }).group } })),
      ];
      for (const { name, option } of choosers) {
        const file = join(dir, `${build.name}.${name}.json`);
        if (existsSync(file) && process.env.FORECAST_CALIBRATION_RERUN !== '1') continue;
        const result = await runOption(build.profile, option, minutes * 60);
        writeFileSync(file, JSON.stringify({ build: build.name, chooser: name, ...result }, null, 1));
      }
    }
    // The table: power gained in the hour each way, and what each farmed.
    const lines = ['build | chooser | power gained | x Best Gain | deaths | farmed (share of kills)'];
    const files = readdirSync(dir).filter(file => file.endsWith('.json')).map(file => JSON.parse(readFileSync(join(dir, file), 'utf8')));
    for (const build of [...new Set(files.map(file => file.build))]) {
      const runs = files.filter(file => file.build === build).sort((a, b) => a.chooser.localeCompare(b.chooser));
      const base = runs.find(run => run.chooser === 'best-gain');
      for (const run of runs) {
        const gained = run.endPower - run.startPower, kills = run.combat.killsByGroup as Record<string, number>;
        const total = Object.values(kills).reduce((sum, count) => sum + count, 0) || 1;
        const farmed = Object.entries(kills).sort((a, b) => b[1] - a[1]).map(([group, count]) => `${group.replace(/^(stat|soul):/, '')} ${Math.round(count / total * 100)}%`).join(', ');
        lines.push(`${build} | ${run.chooser} | ${gained.toPrecision(3)} | ${base ? (gained / Math.max(1e-9, base.endPower - base.startPower)).toFixed(2) : '-'} | ${run.deaths} | ${farmed}`);
      }
    }
    writeFileSync(join(out, 'growth.txt'), lines.join('\n'));
    console.log(lines.join('\n'));
  }, 24 * 3600_000);
});
