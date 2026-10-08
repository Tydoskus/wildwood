import { describe, expect, it } from 'vitest';
import {
  chooseGrowthOption, fanArrowsOnTarget, forecastGrowth, growthStatChoice, meleeBlowsPerMinute, forecastOption, orbitHolds, pullTankCheck, FORECAST_TUNING,
  type ForecastBuild, type ForecastMap, type ForecastSite,
} from './growth-forecast';
import { armorRule } from './forecast-inputs';
import { participantAttackers, resolveFight } from '../../balance/death-model';
import { preparePlayerPowerStats, type PlayerPowerStats } from '../../../shared/player-power';
import type { EnemyDefinition } from '../enemies';
import type { RewardType } from '../../../shared/enemy-definitions';

const enemy = (overrides: Partial<EnemyDefinition> & { reward: { type: RewardType; amount: number } }): EnemyDefinition =>
  ({ hp: 100, speed: 200, damage: 10, attackSpeed: 1, r: 20, color: '#000', outline: '#000', ...overrides });

/** A camp of `count` enemies around (x, y), each `spacing` apart. */
function camp(group: RewardType, x: number, y: number, count: number, definition: EnemyDefinition, spacing = 90, firstId = 0): ForecastSite[] {
  return Array.from({ length: count }, (_, index) => ({
    id: firstId + index, x: x + (index % 4) * spacing, y: y + Math.floor(index / 4) * spacing, campName: `${group} camp`, leashRange: 420,
    definition, group: `stat:${group}`, reward: definition.reward, respawnIn: 0,
  }));
}

function map(sites: ForecastSite[], respawnSeconds = 10): ForecastMap {
  return { mapId: 'test', sites, arrival: { x: 200, y: 200 }, respawnSeconds, hitAfterArmor: armorRule(false) };
}

function build(stats: Partial<PlayerPowerStats> = {}, extra: Partial<ForecastBuild> = {}): ForecastBuild {
  const base: PlayerPowerStats = { damage: 50, maxHp: 500, attackRate: .5, armor: 0, regen: 5, ...stats };
  return {
    base, effective: preparePlayerPowerStats({ ...base }, null), rewardMultiplier: 1, minAttackInterval: .1,
    criticalChance: 0, criticalMultiplier: 1.05, projectileCount: 1, melee: false, reach: 200, projectileSpeed: 1_000,
    doubleStrike: 0, splitShot: 0, reflect: 0, secondWind: 0, moveSpeed: 200, ...extra,
  };
}

const run = { horizonSeconds: 600 };
const single = (group: RewardType) => ({ pull: false, groups: [`stat:${group}`] });
const pull = (group: RewardType) => ({ pull: true, groups: [`stat:${group}`] });

describe('growth forecast', () => {
  const weak = enemy({ hp: 120, damage: 8, reward: { type: 'damage', amount: 1 } });
  const field = map(camp('damage', 1_400, 1_400, 8, weak, 220));

  it('grows faster with more damage, and never slower', () => {
    const rates = [20, 40, 80, 160].map(damage => forecastOption(field, build({ damage }), single('damage'), run).powerPerMinute);
    for (let index = 1; index < rates.length; index++) expect(rates[index]).toBeGreaterThanOrEqual(rates[index - 1]);
    expect(rates[3]).toBeGreaterThan(rates[0]);
  });

  it('kills by Reflect in Reflect Only, and corrects those kills by the measured damage correction', () => {
    const biters = map(camp('damage', 400, 400, 6, enemy({ hp: 300, damage: 40, reward: { type: 'damage', amount: 1 } }), 150));
    const reflector = (damageCalibration: number) => build({ maxHp: 5_000, regen: 100 }, { melee: true, reflectOnly: true, reflect: 1, damageCalibration });
    const kills = (damageCalibration: number) => forecastOption(biters, reflector(damageCalibration), single('damage'), run).kills;
    expect(kills(1)).toBeGreaterThan(0);
    expect(kills(.25)).toBeLessThan(kills(1));
  });

  it('dies less with more health or armor', () => {
    const hard = map(camp('damage', 1_400, 1_400, 8, enemy({ hp: 400, damage: 60, reward: { type: 'damage', amount: 1 } }), 220));
    const deaths = (stats: Partial<PlayerPowerStats>) => forecastOption(hard, build(stats, { melee: true }), single('damage'), run).deathsPerHour;
    expect(deaths({ maxHp: 2_000 })).toBeLessThanOrEqual(deaths({ maxHp: 300 }));
    expect(deaths({ maxHp: 300, armor: 400 })).toBeLessThanOrEqual(deaths({ maxHp: 300 }));
    expect(deaths({ maxHp: 300 })).toBeGreaterThan(0);
  });

  it('pulls a spread-out group faster when the build can hold it', () => {
    // A group spread over the map: one at a time is mostly walking, Pull brings it all.
    const spread = map(camp('damage', 900, 900, 12, weak, 700));
    const strong = build({ damage: 200, maxHp: 5_000, regen: 100 });
    const pulled = forecastOption(spread, strong, pull('damage'), run);
    const walked = forecastOption(spread, strong, single('damage'), run);
    expect(pulled.deaths).toBe(0);
    expect(pulled.powerPerMinute).toBeGreaterThan(walked.powerPerMinute * 1.2);
  });

  it('loses with the whole group pulled at once when it kills the build, and pulls only what it can stand', () => {
    const brutes = map(camp('damage', 900, 900, 12, enemy({ hp: 300, damage: 45, attackSpeed: 1, reward: { type: 'damage', amount: 1 } }), 250));
    const glass = build({ damage: 120, maxHp: 400, regen: 10 }, { melee: true });
    const whole = forecastOption(brutes, glass, { ...pull('damage'), tankLimit: false }, run);
    const walked = forecastOption(brutes, glass, single('damage'), run);
    expect(whole.deathsPerHour).toBeGreaterThan(walked.deathsPerHour);
    expect(walked.powerPerMinute).toBeGreaterThan(whole.powerPerMinute);
    expect(whole.sustainable).toBe(false);
    // As autofarm pulls: only as many at once as it can stand through.
    const limited = forecastOption(brutes, glass, pull('damage'), run);
    expect(limited.deathsPerHour).toBeLessThan(whole.deathsPerHour);
    expect(limited.powerPerMinute).toBeGreaterThan(whole.powerPerMinute);
  });

  it('moves on when the next map pays more and the build can take it', () => {
    const next = map(camp('damage', 1_400, 1_400, 8, enemy({ hp: 400, damage: 20, reward: { type: 'damage', amount: 5 } }), 220));
    const strong = build({ damage: 300, maxHp: 3_000, regen: 50 });
    const results = forecastGrowth({ current: field, next, build: strong, horizonSeconds: 600, nextLeadSeconds: 10 });
    const choice = chooseGrowthOption(results);
    expect(choice?.map).toBe('next');
    // And stays when it cannot.
    const frail = build({ damage: 30, maxHp: 120, regen: 1 }, { melee: true });
    const brutal = map(camp('damage', 1_400, 1_400, 8, enemy({ hp: 2_000, damage: 200, reward: { type: 'damage', amount: 5 } }), 220));
    expect(chooseGrowthOption(forecastGrowth({ current: field, next: brutal, build: frail, horizonSeconds: 600 }))?.map).toBe('current');
  });

  it('grows less when deaths are added', () => {
    const hard = map(camp('damage', 1_400, 1_400, 8, enemy({ hp: 300, damage: 30, reward: { type: 'damage', amount: 1 } }), 220));
    const tough = build({ damage: 80, maxHp: 400, regen: 8 }, { melee: true });
    const safe = forecastOption(hard, tough, single('damage'), run);
    const harsher = forecastOption(hard, { ...tough, incomingCalibration: 3 }, single('damage'), run);
    expect(harsher.deaths).toBeGreaterThan(safe.deaths);
    expect(harsher.powerPerMinute).toBeLessThan(safe.powerPerMinute);
  });

  it('plays hits as the Balance Lab does when nothing dies and nobody dodges', () => {
    const tank = enemy({ hp: 1e12, damage: 25, attackSpeed: .8, reward: { type: 'damage', amount: 0 } });
    const sites = camp('damage', 260, 200, 3, tank, 30);
    const player = build({ damage: 1, maxHp: 400, regen: 3 }, { melee: true, evades: false });
    const tuning = { ...FORECAST_TUNING, hurtSeconds: 0, contactPacking: 10 };
    const testMap = map(sites);
    const stats = player.effective(player.base);
    const attackers = sites.flatMap(site => participantAttackers([site], testMap.arrival, new Set(), entry => entry.definition, stats.armor, 1, player.moveSpeed, testMap.hitAfterArmor));
    const lab = resolveFight(stats.maxHp, stats.maxHp, stats.regen, 1_000, attackers);
    expect(lab.diedAt).not.toBeNull();
    const deathsBy = (seconds: number) => forecastOption(testMap, player, pull('damage'), { horizonSeconds: seconds }, tuning).deaths;
    expect(deathsBy(lab.diedAt! - .01)).toBe(0);
    expect(deathsBy(lab.diedAt! + .01)).toBe(1);
  });

  it('kites on a circle that holds a few chasers, and not a crowd', () => {
    expect(orbitHolds(1, 20, 200, 225, 200)).toBe(true);
    expect(orbitHolds(40, 30, 200, 225, 200)).toBe(false);
  });

  it('takes fewer hits kited than standing, with a bow', () => {
    const hard = map(camp('damage', 1_400, 1_400, 8, enemy({ hp: 600, damage: 30, attackSpeed: 1, reward: { type: 'damage', amount: 1 } }), 220));
    const bow = build({ damage: 60, maxHp: 400, regen: 6 });
    const kited = forecastOption(hard, bow, { ...single('damage'), kite: true }, run);
    const standing = forecastOption(hard, bow, { ...single('damage'), kite: false }, run);
    expect(kited.hits.melee).toBeLessThan(standing.hits.melee);
    expect(kited.deaths).toBeLessThanOrEqual(standing.deaths);
  });

  it('tells whether the build can tank the whole group at once', () => {
    const pack = map(camp('damage', 700, 700, 10, enemy({ hp: 200, damage: 20, reward: { type: 'damage', amount: 1 } }), 120));
    const tank = pullTankCheck(pack, build({ damage: 200, maxHp: 4_000, regen: 50 }, { melee: true }), ['stat:damage']);
    expect(tank.tankable).toBe(true);
    expect(tank.peakDamage).toBeLessThan(tank.maxHp);
    expect(tank.enemies).toBe(10);
    const frail = pullTankCheck(pack, build({ damage: 20, maxHp: 150, regen: 1 }, { melee: true }), ['stat:damage']);
    expect(frail.tankable).toBe(false);
    expect(frail.peakDamage).toBeGreaterThan(frail.maxHp);
    // Priced as autofarm pulls, a few at a time, and told whether the whole of it could be stood.
    const options = forecastGrowth({ current: pack, build: build({ damage: 20, maxHp: 150, regen: 1 }, { melee: true }), horizonSeconds: 120 });
    expect(options.filter(option => option.mode === 'pull').every(option => option.tank && !option.tank.tankable)).toBe(true);
  });

  it('counts the arrows of a fan that strike one target', () => {
    expect(fanArrowsOnTarget(1, 200, 20)).toBe(1);
    expect(fanArrowsOnTarget(3, 40, 20)).toBe(3);
    expect(fanArrowsOnTarget(5, 400, 10)).toBe(1);
  });

  it('keeps what it is doing unless something is clearly better', () => {
    const results = forecastGrowth({ current: field, build: build(), horizonSeconds: 300 });
    const held = results.find(result => result.mode === 'kited' && result.option.groups?.[0] === 'stat:damage')!;
    const choice = chooseGrowthOption(results, { map: 'current', mode: 'kited', groups: held.option.groups });
    expect(choice).not.toBeNull();
    expect(choice!.powerPerMinute).toBeGreaterThanOrEqual(held.powerPerMinute);
  });

  it('prices blows taken standing and kited from the chase rules', () => {
    const swinger = { attackSpeed: 1 };
    expect(meleeBlowsPerMinute(swinger, 200, { kited: false })).toBe(60);
    const kited = meleeBlowsPerMinute(swinger, 200, { kited: true });
    expect(kited).toBeGreaterThan(0);
    expect(kited).toBeLessThan(60 / 2);
    expect(meleeBlowsPerMinute(swinger, 200, { kited: true, holds: true })).toBe(0);
    // A slow swinger is no slower for being kited.
    expect(meleeBlowsPerMinute({ attackSpeed: .05 }, 200, { kited: true })).toBeCloseTo(3);
  });

  describe('what to farm for growth', () => {
    const damageCamp = (definition: EnemyDefinition) => camp('damage', 1_000, 1_000, 8, definition, 200);
    const healthCamp = (definition: EnemyDefinition) => camp('health', 1_000, 1_600, 8, definition, 200, 100);

    it('farms damage when nothing holds the build back, though health shows more power a kill', () => {
      const safe = map([
        ...damageCamp(enemy({ hp: 300, damage: 1, reward: { type: 'damage', amount: 2 } })),
        ...healthCamp(enemy({ hp: 300, damage: 1, reward: { type: 'health', amount: 30 } })),
      ]);
      const choice = growthStatChoice({ current: safe, build: build({ damage: 40, maxHp: 1_000, regen: 20 }) });
      const health = choice.groups.find(entry => entry.group === 'stat:health')!, damage = choice.groups.find(entry => entry.group === 'stat:damage')!;
      expect(health.bestGain).toBeGreaterThan(damage.bestGain);
      expect(choice.group).toBe('stat:damage');
      expect(damage.rateRise).toBeGreaterThan(0);
    });

    it('farms health when health is what stops the deaths', () => {
      const brutal = map([
        ...damageCamp(enemy({ hp: 200, damage: 90, reward: { type: 'damage', amount: .2 } })),
        ...healthCamp(enemy({ hp: 200, damage: 90, reward: { type: 'health', amount: 60 } })),
      ]);
      const choice = growthStatChoice({ current: brutal, build: build({ damage: 60, maxHp: 120, regen: 30 }, { melee: true }), sampleKills: 10 });
      expect(choice.group).toBe('stat:health');
      expect(choice.groups.find(entry => entry.group === 'stat:health')!.rateRise).toBeGreaterThan(0);
    });
  });
});
