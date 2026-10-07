import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { simulateExistingPlayer } from '../../../balance/simulator';
import { LIVE_BALANCE } from '../../../balance/live-balance';
import { createEmptyResearchRanks } from '../../../../shared/research';
import { DEFAULT_ATTACK_INTERVAL, PLAYER_BASE_DAMAGE, PLAYER_BASE_HP, PLAYER_BASE_REGEN } from '../../../../shared/rules';
import type { PlayerPowerStats } from '../../../../shared/player-power';

/** What the Balance Lab expects a player to bring to a map, and how long it expects the map to take. */
export type ReferenceBuild = {
  mapId: string;
  /** Earned base stats on arrival (gear not included). */
  stats: PlayerPowerStats;
  equipped: { head: string; chest: string; weapon: string };
  entryPower: number;
  /** The Lab's minutes on this map (null when it never left). */
  minutes: number | null;
  exit: { stats: PlayerPowerStats; equipped: { head: string; chest: string; weapon: string } } | null;
};

const stats = (value: { damage: number; maxHp: number; armor: number; regen: number; attackRate: number }): PlayerPowerStats =>
  ({ damage: value.damage, maxHp: value.maxHp, armor: value.armor, regen: value.regen, attackRate: value.attackRate });

/**
 * One Balance Lab campaign from a fresh character, as the harness plays it:
 * the natural strategy, no research, no equipment upgrades (its loot is kept).
 * Each map's entry build is the 1.0x a virtual player is scaled from, because
 * the maps are tuned to it, not to referenceBuildForMap. Takes about a minute,
 * so it is cached per balance revision.
 */
export function campaignReferenceBuilds(cacheDir: string): ReferenceBuild[] {
  const file = join(cacheDir, `reference-builds-r${LIVE_BALANCE.revision}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const trial = simulateExistingPlayer({ trials: 1, researchPlan: 'off', steadyEquipmentUpgrades: false, strategy: 'natural',
    balanceSettings: LIVE_BALANCE.settings, durationSeconds: 400 * 3600 }, {
    stats: { damage: PLAYER_BASE_DAMAGE, maxHp: PLAYER_BASE_HP, armor: 0, regen: PLAYER_BASE_REGEN, attackRate: DEFAULT_ATTACK_INTERVAL },
    research: createEmptyResearchRanks(), equipped: { head: '', chest: '', weapon: 'starter_bow' },
    bootsEquipped: false, itemUpgradeLevel: 0, equipmentStrengthMultiplier: 1, mapIndex: 0, ownedItems: ['starter_bow'], bossRewardClaims: 0,
  });
  const builds: ReferenceBuild[] = trial.maps.map(map => ({
    mapId: map.mapId, stats: stats(map.entryState.stats), equipped: { ...map.entryState.equipped }, entryPower: map.entryPower,
    minutes: map.exitedAtSeconds === null ? null : (map.exitedAtSeconds - map.enteredAtSeconds) / 60,
    exit: map.exitedAtSeconds === null ? null : { stats: stats(map.exitState.stats), equipped: { ...map.exitState.equipped } },
  }));
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, JSON.stringify(builds, null, 1));
  return builds;
}
