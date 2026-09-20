import { GEM_KILL_CREDIT_PER_GEM, gemKillCredit, settleGemKillCredit } from "../../shared/gem-drops";

// Gems paid for enemy kills. The gem_kill_progress and player_gem_drop tables,
// the schema registration and the dev_grant_retroactive_kill_gems reducer
// declaration stay in index.ts; this module owns the bodies they call. The
// wallet write and the virtual-player check arrive through deps so the code
// here reads the same as it did in the entry module.

export type KillGemsDeps = {
  applyGemBalanceChange: (ctx: any, input: { identity: any; delta: bigint; kind: string; note: string; externalReference: string }) => unknown;
  isVirtualPlayer: (ctx: any, identity: any) => boolean;
};

export function createKillGems(deps: KillGemsDeps) {
  const { applyGemBalanceChange, isVirtualPlayer } = deps;

  /**
   * Turn accepted kills into gem credit and pay out whole gems. The reference
   * carries the lifetime kill count after this batch, which only ever rises, so
   * a replayed batch cannot pay twice.
   */
  function grantKillGems(ctx: any, identity: any, acceptedDefeats: number, active: boolean, lifetimeKillsAfter: bigint) {
    const earned = gemKillCredit(acceptedDefeats, active);
    if (earned === 0n) return 0n;
    const progress = ctx.db.gemKillProgress.identity.find(identity);
    const settled = settleGemKillCredit((progress?.credit ?? 0n) + earned);
    const row = { identity, credit: settled.remainder };
    if (progress) ctx.db.gemKillProgress.identity.update(row); else ctx.db.gemKillProgress.insert(row);
    if (settled.gems === 0n) return 0n;
    applyGemBalanceChange(ctx, { identity, delta: settled.gems, kind: "enemy_kills", note: "Gems earned from enemy kills",
      externalReference: `kill-gems:${identity.toHexString()}:${lifetimeKillsAfter}` });
    publishGemDrop(ctx, identity, settled.gems);
    return settled.gems;
  }

  function publishGemDrop(ctx: any, identity: any, gems: bigint) {
    const current = ctx.db.playerGemDrop.identity.find(identity);
    const next = { identity, amount: Number(gems), sequence: (current?.sequence ?? 0n) + 1n, droppedAt: ctx.timestamp };
    if (current) ctx.db.playerGemDrop.identity.update(next); else ctx.db.playerGemDrop.insert(next);
  }

  // One-time catch-up for kills earned before gems were paid for them. History
  // carries no record of who was active, so every past kill counts at the idle
  // rate. A player is marked done by their progress row, so running this twice
  // pays nobody twice, and kills from here on flow through grantKillGems.
  function grantRetroactiveKillGems(ctx: any) {
    let players = 0, paid = 0, gems = 0n;
    for (const lifetime of [...ctx.db.playerLifetime.iter()] as any[]) {
      if (ctx.db.gemKillProgress.identity.find(lifetime.identity) || isVirtualPlayer(ctx, lifetime.identity)) continue;
      players += 1;
      const settled = settleGemKillCredit(lifetime.enemyKills);
      ctx.db.gemKillProgress.insert({ identity: lifetime.identity, credit: settled.remainder });
      if (settled.gems === 0n) continue;
      applyGemBalanceChange(ctx, { identity: lifetime.identity, delta: settled.gems, kind: "enemy_kills",
        note: "Gems for enemy kills before kill gems existed", externalReference: `kill-gems:retro:${lifetime.identity.toHexString()}` });
      paid += 1; gems += settled.gems;
    }
    console.log(`Retroactive kill gems: ${players} players marked, ${paid} paid, ${gems} gems at 1 per ${GEM_KILL_CREDIT_PER_GEM} kills`);
    return { players, paid, gems };
  }

  return { grantKillGems, grantRetroactiveKillGems };
}
