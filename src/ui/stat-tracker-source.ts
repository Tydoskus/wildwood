import { hasApprovedGameSession } from "../coop/startup-state-machine";
import { effectivePlayerPowerStats, playerPowerForStats } from "../../shared/player-power";
import type { TrackerValues } from "./stat-tracker-model";

/**
 * Reading the tracker's figures needs the connection, the session, the loaded
 * character and the live combat values at once. Assemble that here so the
 * composition root keeps to a single call.
 */
export function createStatTrackerSource(deps: {
  coop: () => {
    localIdentity?: () => string | undefined;
    isConnected?: () => boolean;
    accountState?: () => unknown;
    itemUpgradeLevel?: (itemId: string) => number;
    prestige?: () => { level: number } | null;
  } | null | undefined;
  hasStarted: () => boolean;
  isLoadedFor: (identity: string) => boolean;
  inTutorial: () => boolean;
  player: { baseMaxHp: number; damage: number; attackRate: number; armor: number; regen: number };
  inventory: unknown;
  displayedProgress: (stats: any, inventory: any) => Parameters<typeof effectivePlayerPowerStats>[0];
  researchRanks: () => Parameters<typeof effectivePlayerPowerStats>[1];
  kills: () => number;
}) {
  return (): { identity: string; values: TrackerValues; prestige: number } | null => {
    const coop = deps.coop();
    const identity = coop?.localIdentity?.();
    if (!identity || !deps.hasStarted() || !deps.isLoadedFor(identity) || !coop?.isConnected?.()
      || !hasApprovedGameSession(coop?.accountState?.() as never) || deps.inTutorial()) return null;
    const progress = deps.displayedProgress({ maxHp: deps.player.baseMaxHp, damage: deps.player.damage,
      attackRate: deps.player.attackRate, armor: deps.player.armor, regen: deps.player.regen }, deps.inventory);
    const stats = effectivePlayerPowerStats(progress, deps.researchRanks(),
      itemId => coop?.itemUpgradeLevel?.(itemId) ?? 0);
    return { identity, values: { power: playerPowerForStats(stats), hp: stats.maxHp,
      damage: stats.damage, armor: stats.armor, regen: stats.regen, kills: deps.kills() },
      prestige: coop?.prestige?.()?.level ?? 0 };
  };
}
