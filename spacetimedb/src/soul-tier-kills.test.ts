import { expect, it, vi } from "vitest";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportKills } from "../../tests/helpers/enemy-defeat";
import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import { CAMPAIGN_UNLOCK_FIELDS } from "../../shared/equipment-access";
import { enemyDefeatDefinition } from "../../shared/enemy-defeats";
import { ENEMY_TYPES } from "../../shared/enemy-definitions";
import { generateMap, proceduralMapId, PROCEDURAL_ENTRY_BOSS } from "../../shared/procedural-maps";
import { BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
import { STARTER_BOW } from "../../shared/items";
import { SOUL_REWARD_KILL_TYPES } from "../../shared/soul-dimension";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

/** A strong player with every map open, so the kill bound never clips a one-kill claim. */
function strong() {
  const f = crystalFixture();
  f.patch("playerProgress", { ...Object.fromEntries(CAMPAIGN_UNLOCK_FIELDS.map(field => [field, true])), equippedRightHand: STARTER_BOW,
    inventoryJson: '["starter_bow"]', damage: 1e20, maxHp: 1e20, bossRewardClaims: BOSS_REWARD_CLAIM_BITS[PROCEDURAL_ENTRY_BOSS] });
  f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 20 });
  return f;
}
const counted = (f: any) => {
  const row = f.db.playerRewardKills.identity.find(f.ctx.sender);
  return Object.fromEntries(SOUL_REWARD_KILL_TYPES.map(type => [type, Number(row?.[type] ?? 0n)]));
};
let stream = 0;
function killOne(f: any, mapId: string, enemy: string) {
  f.patch("player", { mapId });
  fillDefeatBudget(f, mapId, enemy);
  const streamId = `soul-tier-${String(++stream).padStart(10, "0")}`;
  reportKills(f, { streamId, sequence: 1n, mapId, enemies: [{ enemy, count: 1 }], simulatedMillis: 30_000 });
}

it("counts a kill of every reward type on every campaign map, map 1 to 15, under that type", () => {
  for (const map of CAMPAIGN_MAPS) {
    const f = strong();
    const expected = Object.fromEntries(SOUL_REWARD_KILL_TYPES.map(type => [type, 0]));
    for (const enemy of Object.keys(ENEMY_TYPES)) {
      const definition = enemyDefeatDefinition(map.id, enemy);
      if (!definition || !(definition.reward.type in expected)) continue;
      killOne(f, map.id, enemy);
      expected[definition.reward.type] += 1;
    }
    expect(Object.values(expected).reduce((sum, count) => sum + count, 0), map.id).toBeGreaterThan(0);
    expect(counted(f), map.id).toEqual(expected);
  }
});

it("counts Endless kills under each site's own reward type", () => {
  for (const stage of [1, 7, 15]) {
    const f = strong();
    const mapId = proceduralMapId(stage);
    const expected = Object.fromEntries(SOUL_REWARD_KILL_TYPES.map(type => [type, 0]));
    const sites = generateMap(mapId).camps.reduce((sum, camp) => sum + camp.count, 0);
    // One kill of every site, a report every few seconds, as a client sends them.
    f.patch("player", { mapId });
    const streamId = `soul-tier-endless-${stage}`.padEnd(20, "0");
    let sequence = 0n;
    for (let site = 0; site < sites; site += 1) {
      const definition = enemyDefeatDefinition(mapId, `site:${site}`);
      if (!definition || !(definition.reward.type in expected)) continue;
      fillDefeatBudget(f, mapId, `site:${site}`);
      f.ctx.timestamp = new (f.ctx.timestamp.constructor as any)(f.ctx.timestamp.microsSinceUnixEpoch + 5_000_000n);
      reportKills(f, { streamId, sequence: ++sequence, mapId, enemies: [{ enemy: `site:${site}`, count: 1 }], simulatedMillis: 5_000 });
      expected[definition.reward.type] += 1;
    }
    // Every stage holds all four tier types.
    for (const type of ["damage", "health", "armor", "regen"]) expect(expected[type], `${mapId} ${type}`).toBeGreaterThan(0);
    expect(counted(f), mapId).toEqual(expected);
  }
});
