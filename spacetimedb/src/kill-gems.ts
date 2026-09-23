import { GEM_KILL_CREDIT_LEGACY_IDLE, GEM_KILL_CREDIT_PER_GEM, gemKillCredit, settleGemKillCredit } from "../../shared/gem-drops";

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
  function grantKillGems(ctx: any, identity: any, acceptedDefeats: number, lifetimeKillsAfter: bigint) {
    const earned = gemKillCredit(acceptedDefeats);
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

  // player_gem_drop is an event table: rows are delivered, not kept, so there
  // is no prior row to count from. The timestamp is the sequence; it only rises.
  function publishGemDrop(ctx: any, identity: any, gems: bigint) {
    ctx.db.playerGemDrop.insert({ identity, amount: Number(gems), sequence: ctx.timestamp.microsSinceUnixEpoch, droppedAt: ctx.timestamp });
  }

  // One-time catch-up for kills earned before gems were paid for them. History
  // carries no record of how each kill was earned, so historical kills retain
  // their original conservative rate. Completion is the retro ledger entry itself, so running this twice
  // pays nobody twice. A player who already has a progress row was killing
  // while the live path was up: their post-launch kills are credited there, so
  // only the kills before it are paid, and their live remainder is left alone.
  function grantRetroactiveKillGems(ctx: any) {
    let players = 0, paid = 0, gems = 0n;
    for (const lifetime of [...ctx.db.playerLifetime.iter()] as any[]) {
      if (isVirtualPlayer(ctx, lifetime.identity)) continue;
      const reference = `kill-gems:retro:${lifetime.identity.toHexString()}`;
      if (ctx.db.gemTransaction.externalReference.find(reference)) continue;
      players += 1;
      const progress = ctx.db.gemKillProgress.identity.find(lifetime.identity);
      let owed: bigint;
      if (!progress) {
        const settled = settleGemKillCredit(lifetime.enemyKills * GEM_KILL_CREDIT_LEGACY_IDLE);
        ctx.db.gemKillProgress.insert({ identity: lifetime.identity, credit: settled.remainder });
        owed = settled.gems;
      } else {
        // Treat paid credit as historical idle kills to avoid repaying them.
        let liveGems = 0n;
        for (const tx of ctx.db.gemTransaction.byIdentity.filter(lifetime.identity) as Iterable<any>) {
          if (tx.kind === "enemy_kills" && !String(tx.externalReference).includes(":retro:")) liveGems += tx.delta;
        }
        const liveKills = (liveGems * GEM_KILL_CREDIT_PER_GEM + progress.credit) / GEM_KILL_CREDIT_LEGACY_IDLE;
        const enemyKills = lifetime.enemyKills as bigint;
        owed = settleGemKillCredit((enemyKills > liveKills ? enemyKills - liveKills : 0n) * GEM_KILL_CREDIT_LEGACY_IDLE).gems;
      }
      if (owed === 0n) continue;
      applyGemBalanceChange(ctx, { identity: lifetime.identity, delta: owed, kind: "enemy_kills",
        note: "Gems for enemy kills before kill gems existed", externalReference: reference });
      paid += 1; gems += owed;
    }
    console.log(`Retroactive kill gems: ${players} players considered, ${paid} paid, ${gems} gems at 1 per ${GEM_KILL_CREDIT_PER_GEM / GEM_KILL_CREDIT_LEGACY_IDLE} historical kills`);
    return { players, paid, gems };
  }

  return { grantKillGems, grantRetroactiveKillGems };
}
