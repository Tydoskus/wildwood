import { defeatBudget, enemyDefeatDefinition } from "../../shared/enemy-defeats";
import { ENEMY_TYPES } from "../../shared/enemy-definitions";
import { server } from "./crystal-hollows-fixture";
export function reportEnemy(f: any, enemy?: string, count = 1) {
  const mapId = f.db.player.identity.find(f.ctx.sender).mapId;
  enemy ??= mapId.startsWith("endless_") ? "site:0" : Object.keys(ENEMY_TYPES).find(kind => enemyDefeatDefinition(mapId, kind))!;
  const streamId = "test-defeats-stream-0001";
  const key = `${f.ctx.sender.toHexString()}:${streamId}`;
  const sequence = (f.db.regularEnemyLootCursor.key.find(key)?.sequence ?? 0n) + 1n;
  return f.run(server.recordEnemyDefeats, { mapId, streamId, sequence, enemies: [{ enemy, count }] });
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
  f.seed("enemyDefeatBudget", {
    key: `${f.ctx.sender.toHexString()}:${mapId}:${enemy}`,
    identity: f.ctx.sender, tokens: capacity,
    updatedAtMicros: f.ctx.timestamp.microsSinceUnixEpoch,
  });
}
