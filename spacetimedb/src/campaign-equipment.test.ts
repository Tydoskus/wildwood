import { STARTER_BOW } from "../../shared/items";
import { CAMPAIGN_UNLOCK_FIELDS } from "../../shared/equipment-access";
import { MAP_IDS } from "../../shared/rules";
import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { CAMPAIGN_EQUIPMENT } from "../../shared/campaign-equipment";
import { ENEMY_TYPES } from "../../shared/enemy-definitions";
import { enemyDefeatDefinition } from "../../shared/enemy-defeats";
import { regularMapLoot } from "../../shared/regular-map-loot";
import { canReplayRegularEnemyLoot, rollRegularEnemyLoot } from "./regular-enemy-loot";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const maps = [...new Set(Object.values(CAMPAIGN_EQUIPMENT).map(entry => entry.mapId))];
it.each(maps)("awards, equips, and preserves the new %s drops through an authoritative save", mapId => {
  const f = crystalFixture();
  f.patch("player", { mapId });
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1e15 });
  f.patch("playerProgress", Object.fromEntries(CAMPAIGN_UNLOCK_FIELDS.map((field, i) => [field, i < MAP_IDS.indexOf(mapId)])));
  f.ctx.random.integerInRange = () => 1;
  const enemy = Object.keys(ENEMY_TYPES).find(kind => enemyDefeatDefinition(mapId, kind))!;
  expect(enemy).toBeTruthy();
  const batch = { streamId: "campaign-loot-test-1234", sequence: 1n, mapId, enemies: [{ enemy, count: 1 }] };
  f.run(server.recordEnemyDefeats, batch);
  const earned = regularMapLoot(mapId).map(drop => drop.itemId);
  let progress = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(JSON.parse(progress.inventoryJson)).toEqual(expect.arrayContaining(earned));
  for (const [id, entry] of Object.entries(CAMPAIGN_EQUIPMENT).filter(([, entry]) => entry.mapId === mapId)) {
    const field = entry.definition.slot === "HEAD" ? "equippedHead" : entry.definition.slot === "CHEST" ? "equippedChest" : "equippedRightHand";
    f.run(server.savePlayerProgress, { ...progress, inventoryJson: "[]", [field]: id });
    progress = f.db.playerProgress.identity.find(f.ctx.sender);
    expect(progress[field]).toBe(id);
    expect(JSON.parse(progress.inventoryJson)).toContain(id);
  }
  f.run(server.recordEnemyDefeats, batch);
  expect([...f.db.playerItemDrop.iter()].every(drop => drop.sequence === 1n)).toBe(true);
});
it.each(Object.entries(CAMPAIGN_EQUIPMENT))("uses the exact winning boundary for %s", (id, entry) => {
  const f = crystalFixture();
  f.ctx.random.integerInRange = () => entry.wins;
  expect(rollRegularEnemyLoot(f.ctx as any, entry.mapId, 1).get(id)).toBe(1);
  f.ctx.random.integerInRange = () => entry.wins + 1;
  expect(rollRegularEnemyLoot(f.ctx as any, entry.mapId, 1).has(id)).toBe(false);
});
it("supports delayed loot replay eligibility on the final campaign map", () => {
  expect(canReplayRegularEnemyLoot("ion_citadel", { ionCitadelUnlocked: true })).toBe(true);
  expect(canReplayRegularEnemyLoot("ion_citadel", { ionCitadelUnlocked: false })).toBe(false);
});
