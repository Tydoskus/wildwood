import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LAB_PLAYER_MODEL, defaultBalanceSimulationConfig, runBalanceSimulation, simulateExistingPlayer, simulationUpgradeLevel, type MasteryPointsBySchool,
} from '../../../../balance/simulator';
import { GAME_BALANCE } from '../../../../balance/game-balance';
import { BASIC_PAPER_HAT, STARTER_STONE, equipmentDamageFactor, equipmentMaxHealthMultiplierBonus, equipmentRegenerationMultiplierBonus, weaponRatings } from '../../../../../shared/items';
import { createEmptyResearchRanks } from '../../../../../shared/research';
import { DEFAULT_ATTACK_INTERVAL, PLAYER_BASE_DAMAGE, PLAYER_BASE_HP, PLAYER_BASE_REGEN } from '../../../../../shared/rules';
import { critPowerFactor, effectivePlayerPowerStats, type PlayerPowerStats } from '../../../../../shared/player-power';
import { criticalDamageMultiplier } from '../../../../../shared/critical-damage';

type Equipped = { head: string; chest: string; weapon: string };

/** What the Balance Lab expects a player to bring to a map, and how long it expects the map to take. */
export type ReferenceBuild = {
  mapId: string;
  /** Earned base stats on arrival (gear not included). */
  stats: PlayerPowerStats;
  equipped: Equipped;
  /** Gold held and Mastery points on arrival: the Smith's gear goes on being bought from them. */
  gold: number;
  masteryPoints: MasteryPointsBySchool;
  entryPower: number;
  /** The Lab's minutes on this map (null when it never left). */
  minutes: number | null;
  exit: { stats: PlayerPowerStats; equipped: Equipped; gold: number; masteryPoints: MasteryPointsBySchool } | null;
};

/** Names a cache of Lab results: the balance and the Lab's player model, so a change to either rebuilds it. */
const cacheKey = () => `${GAME_BALANCE.key}-${LAB_PLAYER_MODEL}`;

const stats = (value: { damage: number; maxHp: number; armor: number; regen: number; attackRate: number }): PlayerPowerStats =>
  ({ damage: value.damage, maxHp: value.maxHp, armor: value.armor, regen: value.regen, attackRate: value.attackRate });

/**
 * One Balance Lab campaign from a fresh character, as the harness plays it:
 * the natural strategy, no research, no equipment upgrades; its gold buys the Smith's gear.
 * Each map's entry build is the 1.0x a virtual player is scaled from, because
 * the maps are tuned to it, not to referenceBuildForMap. Takes about a minute,
 * so it is cached per balance revision.
 */
export function campaignReferenceBuilds(cacheDir: string): ReferenceBuild[] {
  const file = join(cacheDir, `reference-builds-${cacheKey()}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const trial = simulateExistingPlayer({ trials: 1, researchPlan: 'off', steadyEquipmentUpgrades: false, strategy: 'natural',
    balanceSettings: GAME_BALANCE.settings, durationSeconds: 400 * 3600 }, {
    stats: { damage: PLAYER_BASE_DAMAGE, maxHp: PLAYER_BASE_HP, armor: 0, regen: PLAYER_BASE_REGEN, attackRate: DEFAULT_ATTACK_INTERVAL },
    research: createEmptyResearchRanks(), equipped: { head: BASIC_PAPER_HAT, chest: '', weapon: STARTER_STONE },
    bootsEquipped: false, itemUpgradeLevel: 0, equipmentStrengthMultiplier: 1, mapIndex: 0, ownedItems: [BASIC_PAPER_HAT, STARTER_STONE], bossRewardClaims: 0,
    gold: 0, masteryPoints: {},
  });
  const builds: ReferenceBuild[] = trial.maps.map(map => ({
    mapId: map.mapId, stats: stats(map.entryState.stats), equipped: { ...map.entryState.equipped }, entryPower: map.entryPower,
    gold: map.entryState.gold ?? 0, masteryPoints: { ...map.entryState.masteryPoints },
    minutes: map.exitedAtSeconds === null ? null : (map.exitedAtSeconds - map.enteredAtSeconds) / 60,
    exit: map.exitedAtSeconds === null ? null : { stats: stats(map.exitState.stats), equipped: { ...map.exitState.equipped },
      gold: map.exitState.gold ?? 0, masteryPoints: { ...map.exitState.masteryPoints } },
  }));
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, JSON.stringify(builds, null, 1));
  return builds;
}

/**
 * A Lab arrival with research and upgrades folded into base stats (crit into damage): the virtual player has no
 * upgrades. Its gear stays worn (at no upgrade, the upgrades' share folded in), with its gold and Mastery, so the
 * Smith's next grades are bought on top of it.
 */
export type FoldedArrival = { mapId: string; stats: PlayerPowerStats; equipped: Equipped; gold: number; masteryPoints: MasteryPointsBySchool };

/**
 * The Balance Lab's representative run (research and upgrades on, as the scorecard plays it), each map's
 * arrival build as plain stats. For maps the research-free campaign above never reaches. Cached like it.
 */
export function labArrivalBuilds(cacheDir: string, endlessMaps = 13): FoldedArrival[] {
  const file = join(cacheDir, `lab-arrivals-${cacheKey()}-e${endlessMaps}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const result = runBalanceSimulation({ ...defaultBalanceSimulationConfig(), balanceSettings: structuredClone(GAME_BALANCE.settings), trials: 1, endlessMaps });
  const builds: FoldedArrival[] = [];
  for (const map of result.maps) {
    const arrival = result.arrivalStates?.[map.mapId];
    if (!arrival) continue;
    const effective = effectivePlayerPowerStats({ ...arrival.stats, equippedHead: arrival.equipped.head, equippedChest: arrival.equipped.chest, equippedRightHand: arrival.equipped.weapon },
      arrival.research, itemId => simulationUpgradeLevel(arrival, itemId));
    // Crits at the run's rating with the weapon's.
    const rating = (arrival.stats.critRating ?? 0) + (arrival.equipped.weapon ? weaponRatings(arrival.equipped.weapon, simulationUpgradeLevel(arrival, arrival.equipped.weapon)).crit : 0);
    const crit = critPowerFactor({ critChance: (arrival.research.criticalChance ?? 0) / 100,
      critMultiplier: criticalDamageMultiplier({ researchRank: arrival.research.criticalDamage, rating, capRank: arrival.research.critCap }) });
    // What the worn gear gives at no upgrade, taken back out: the virtual player wears it.
    const { weapon, head, chest } = arrival.equipped;
    const gearDamage = equipmentDamageFactor(weapon, head, chest), gearHealth = 1 + equipmentMaxHealthMultiplierBonus(head, chest);
    const gearRegen = 1 + equipmentRegenerationMultiplierBonus(head, chest);
    // The run's own attack interval: the virtual player's weapon adds its rating in combat, as the gear's other factors.
    builds.push({ mapId: map.mapId, stats: stats({ ...effective, attackRate: arrival.stats.attackRate, damage: effective.damage * crit / gearDamage,
      maxHp: effective.maxHp / gearHealth, regen: effective.regen / gearRegen }),
      equipped: { ...arrival.equipped }, gold: arrival.gold ?? 0, masteryPoints: { ...arrival.masteryPoints } });
  }
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, JSON.stringify(builds, null, 1));
  return builds;
}
