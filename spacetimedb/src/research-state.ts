/** Server-owned research row creation and legacy-rank repair. */
export function createResearchState(deps: {
  updateSnapshotRow: (ctx: any, table: "playerResearch", row: any) => void;
  insertSnapshotRow: (ctx: any, table: "playerResearch", row: any) => void;
}) {
  function defaultPlayerResearch(identity: any) {
    return { identity, warcraft: 0, foraging: 0, frontierMastery: 0, vitality: 0, precision: 0, regeneration: 0,
      criticalChance: 0, criticalDamage: 0, moveSpeed: 0, prosperity: 0, researchSpeed: 0,
      slotUpgradeSpeed: 0, enemyRespawn: 0, bossRespawn: 0, offlineWindow: 0, utilityMoveSpeed: 0,
      utilityAttackRange: 0 };
  }

  return function researchForPlayer(ctx: any, identity: any) {
    const existing = ctx.db.playerResearch.identity.find(identity);
    if (existing) {
      if (existing.frontierMastery === 0) return existing;
      const wiped = { ...existing, frontierMastery: 0 };
      deps.updateSnapshotRow(ctx, "playerResearch", wiped);
      return wiped;
    }
    const next = defaultPlayerResearch(identity);
    deps.insertSnapshotRow(ctx, "playerResearch", next);
    return next;
  };
}
