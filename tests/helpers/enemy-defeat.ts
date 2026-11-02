import { defeatBudget, enemyDefeatDefinition } from "../../shared/enemy-defeats";
import { ENEMY_TYPES } from "../../shared/enemy-definitions";
import { server } from "./crystal-hollows-fixture";
import { defeatClock, withDefeatClock, type DefeatClockName } from "../../spacetimedb/src/enemy-defeats";
/**
 * The game time an honest tab reports: the real time since the account's
 * combat clock last moved (else since its previous report). Paid that,
 * report_enemy_defeats never scales a claim and refills the combat clock at
 * real time, as the retired record_enemy_defeats did.
 */
export function honestSimulatedMillis(f: any) {
  const since = readDefeatClock(f, "combat") ?? readDefeatClock(f, "sim");
  return since ? Math.max(0, Math.round(Number(f.ctx.timestamp.microsSinceUnixEpoch - since.updatedAtMicros) / 1000)) : 0;
}

/** One of the account's clocks in player_defeat_clock, undefined when it has never run. */
export const readDefeatClock = (f: any, name: DefeatClockName) => defeatClock(f.db.playerDefeatClock.identity.find(f.ctx.sender), name);

/** Sets one of the account's clocks, as a report at `at` would have left it. */
export function seedDefeatClock(f: any, name: DefeatClockName, tokens: number, at: bigint = f.ctx.timestamp.microsSinceUnixEpoch) {
  const row = f.db.playerDefeatClock.identity.find(f.ctx.sender);
  const next = withDefeatClock(row ?? { identity: f.ctx.sender, reportTokens: 0, reportAt: 0n, simTokens: 0, simAt: 0n,
    combatTokens: 0, combatAt: 0n, rateTokens: 0, rateAt: 0n }, name, tokens, at);
  if (row) f.db.playerDefeatClock.identity.update(next); else f.db.playerDefeatClock.insert(next);
}

/** Sends a kill report as the current client does, with honest game time unless the batch says otherwise. */
export function reportKills(f: any, batch: Record<string, unknown>, reducer: (...args: any[]) => unknown = server.reportEnemyDefeats) {
  return f.run(reducer, { simulatedMillis: honestSimulatedMillis(f), ...batch });
}

/** Sends one kill report for the player's map, with honest game time unless `simulatedMillis` is given. */
export function reportEnemy(f: any, enemy?: string, count = 1, simulatedMillis?: number) {
  const mapId = f.db.player.identity.find(f.ctx.sender).mapId;
  enemy ??= mapId.startsWith("endless_") ? "site:0" : Object.keys(ENEMY_TYPES).find(kind => enemyDefeatDefinition(mapId, kind))!;
  const streamId = "test-defeats-stream-0001";
  const key = `${f.ctx.sender.toHexString()}:${streamId}`;
  const sequence = (f.db.regularEnemyStream.key.find(key)?.sequence ?? f.db.regularEnemyLootCursor.key.find(key)?.sequence ?? 0n) + 1n;
  return reportKills(f, { mapId, streamId, sequence, enemies: [{ enemy, count }], ...(simulatedMillis === undefined ? {} : { simulatedMillis }) });
}

/**
 * Fills the spawn bank for one species so a test measures the bound it means
 * to. A first report on a map is limited to the arrival bank (what is standing
 * there plus one report window), which otherwise clips a large claim before the
 * damage or perk bound under test gets a chance to.
 */
export function fillDefeatBudget(f: any, mapId: string, enemy: string) {
  const definition = enemyDefeatDefinition(mapId, enemy)!;
  const { capacity } = defeatBudget(definition.population);
  const key = `${f.ctx.sender.toHexString()}:${mapId}`, updatedAtMicros = f.ctx.timestamp.microsSinceUnixEpoch;
  const bank = f.db.enemyDefeatBank.key.find(key);
  const buckets = [...(bank?.buckets ?? []).filter((bucket: any) => bucket.enemy !== enemy), { enemy, tokens: capacity, updatedAtMicros }];
  if (bank) f.db.enemyDefeatBank.key.update({ ...bank, buckets, updatedAtMicros });
  else f.seed("enemyDefeatBank", { key, identity: f.ctx.sender, buckets, updatedAtMicros });
}
