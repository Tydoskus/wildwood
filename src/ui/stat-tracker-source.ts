import { hasApprovedGameSession } from "../coop/startup-state-machine";
import { effectivePlayerPowerStats, playerPowerForStats, unroundedPlayerPower } from "../../shared/player-power";
import type { TrackerBuild, TrackerValues } from "./stat-tracker-model";
import { attackCapInterval, attackSpeedLabel, attackSpeedRatingForInterval, critDamageLabel, type AttackCapArg } from "../../shared/stat-rating";
import { criticalDamage, type CriticalDamageParts } from "../../shared/critical-damage";

/**
 * Reading the tracker's figures needs the connection, the session, the loaded
 * character and the live combat values at once. Assemble that here so the
 * composition root keeps to a single call.
 */
export function createStatTrackerSource(deps: {
  coop: () => {
    localIdentity?: () => string | undefined;
    isConnected?: () => boolean;
    prestige?: () => { level: number } | null;
    prestigeChallenge?: () => { active?: boolean } | null;
    aggroChallenge?: () => { active?: boolean } | null;
    accountState?: () => unknown;
    itemUpgradeLevel?: (itemId: string) => number;
  } | null | undefined;
  hasStarted: () => boolean;
  isLoadedFor: (identity: string) => boolean;
  inTutorial: () => boolean;
  player: { baseMaxHp: number; damage: number; attackRate: number; armor: number; regen: number };
  inventory: unknown;
  displayedProgress: (stats: any, inventory: any) => Parameters<typeof effectivePlayerPowerStats>[0];
  researchRanks: () => Parameters<typeof effectivePlayerPowerStats>[1];
  kills: () => number;
  /** The attack speed cap in play, and critical damage's parts (research, perks, soul, the run's camps). */
  attackCap: () => AttackCapArg;
  critParts: () => CriticalDamageParts;
}) {
  return (): { identity: string; prestigeLevel: number; values: TrackerValues; build: TrackerBuild; details: Partial<Record<keyof TrackerValues, string>> } | null => {
    const coop = deps.coop();
    const identity = coop?.localIdentity?.();
    if (!identity || !deps.hasStarted() || !deps.isLoadedFor(identity) || !coop?.isConnected?.()
      || !hasApprovedGameSession(coop?.accountState?.() as never) || deps.inTutorial()) return null;
    const base = { maxHp: deps.player.baseMaxHp, damage: deps.player.damage,
      attackRate: deps.player.attackRate, armor: deps.player.armor, regen: deps.player.regen };
    const progress = deps.displayedProgress(base, deps.inventory);
    const stats = effectivePlayerPowerStats(progress, deps.researchRanks(),
      itemId => coop?.itemUpgradeLevel?.(itemId) ?? 0);
    // Attack speed and crit damage read like armor (Ryan): their number, and what it gives beside it.
    const cap = deps.attackCap(), crit = criticalDamage(deps.critParts());
    return { identity, prestigeLevel: coop.prestige?.()?.level ?? 0, values: { power: playerPowerForStats(stats), hp: stats.maxHp,
      damage: stats.damage, armor: stats.armor, regen: stats.regen, attackSpeed: attackSpeedRatingForInterval(deps.player.attackRate, cap),
      critDamage: crit.rating + crit.soul, kills: deps.kills() },
      details: { attackSpeed: attackSpeedLabel(1 / Math.max(deps.player.attackRate, attackCapInterval(cap)), 1 / attackCapInterval(cap)).replace(" (Max)", " Max"),
        critDamage: critDamageLabel(crit.multiplier, crit.cap).replace(" (Max)", " Max") },
      // The run the build belongs to, so the tracker starts over when a challenge swaps it.
      build: { run: coop.aggroChallenge?.()?.active ? "aggro" : coop.prestigeChallenge?.()?.active ? "reflect" : "main",
        basePower: unroundedPlayerPower(base) } };
  };
}
