import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { reportEnemy } from "../../tests/helpers/enemy-defeat";
import { CAMPAIGN_UNLOCK_FIELDS } from "../../shared/equipment-access";
import { MAP_IDS, BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
import { personalBossDefinition } from "../../shared/personal-bosses";
import { generatedBossStats, generateMap } from "../../shared/procedural-maps";
import { researchStatRewardMultiplier } from "../../shared/research";
import { Timestamp } from 'spacetimedb';
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
function strongBossFixture(mapId: string) {
  const f = crystalFixture();
  f.patch('player', { mapId });
  f.patch('playerProgress', { damage: personalBossDefinition(mapId)!.hp,
    inventoryJson: '["starter_bow"]', equippedRightHand: 'starter_bow' });
  return f;
}
it('consumes an excessive boss backlog once and keeps the player in the world', () => {
  const f = strongBossFixture('endless_40');
  reportEnemy(f, 'boss', 100);
  // One minute of credit plus the 60-second respawn: two clears, the rest is excess.
  expect(f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills).toBe(2n);
  expect(() => f.run(server.recordEnemyDefeats, { mapId: 'endless_40', streamId: 'test-defeats-stream-0001', sequence: 1n, enemies: [{ enemy: 'boss', count: 100 }] })).not.toThrow();
  expect(f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills).toBe(2n);
  expect(f.db.regularEnemyLootCursor.key.find(`${f.ctx.sender.toHexString()}:test-defeats-stream-0001`).sequence).toBe(1n);
  // The excess earns nothing and is written down for a person to read. It never
  // costs the session: a client can send this many boss kills honestly enough.
  expect([...f.db.enemyDefeatReview.iter()]).toMatchObject([{ enemy: 'boss', kind: 'boss-time', requested: 100, accepted: 2 }]);
  expect(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)).toBeNull();
  expect(() => f.run(server.changeMap, { mapId: 'home_exterior', x: 600, y: 700 })).not.toThrow();
  expect(f.db.player.identity.find(f.ctx.sender).mapId).toBe('home_exterior');
});
it('uses each map combat-time budget instead of a global twenty-boss cutoff', () => {
  const f = strongBossFixture('endless_40'), start = f.ctx.timestamp.microsSinceUnixEpoch;
  let calls = 0;
  const claim = (mapId: string, count: number, seconds: number) => {
    f.patch('player', { mapId }); f.ctx.timestamp = new Timestamp(start + BigInt(seconds) * 1_000_000n);
    f.run(server.recordEnemyDefeats, { mapId, streamId: `different-browser-${++calls}`, sequence: 1n, enemies: [{ enemy: 'boss', count }] });
  };
  // Each map's own credit pays two instant clears; the retired global cutoff never applies.
  claim('tutorial_forest', 2, 0); claim('beginner_desert', 2, 100); claim('intermediate_snowlands', 2, 200);
  expect(f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills).toBe(6n);
  claim('advanced_lava_wastes', 2, 299);
  expect(f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills).toBe(8n);
  expect(f.db.bossDefeatWindow.identity.find(f.ctx.sender)).toBeNull();
  claim('infernal_depths', 2, 301);
  expect(f.db.playerLifetime.identity.find(f.ctx.sender).enemyKills).toBe(10n);
});
it.each(["endless_1", "endless_40"] as const)("awards all four scaled stats once for %s", mapId => {
  const f = strongBossFixture(mapId);
  const before = { ...f.db.playerProgress.identity.find(f.ctx.sender) };
  const multiplier = researchStatRewardMultiplier(f.db.playerResearch.identity.find(f.ctx.sender));
  reportEnemy(f, "boss");
  const after = f.db.playerProgress.identity.find(f.ctx.sender);
  const fields = { damage: "damage", health: "maxHp", armor: "armor", regen: "regen" } as const;
  const rewards = generatedBossStats(generateMap(mapId)).rewards;
  expect(rewards.map(reward => reward.type)).toEqual(["damage", "health", "armor", "regen"]);
  for (const reward of rewards) {
    const field = fields[reward.type as keyof typeof fields];
    expect(after[field]).toBe(before[field] + reward.amount * multiplier);
  }
  f.run(server.recordEnemyDefeats, { streamId: "test-defeats-stream-0001", sequence: 1n, mapId, enemies: [{ enemy: "boss", count: 1 }] });
  expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(after);
});
it.each([...MAP_IDS, "endless_40"].filter(mapId => personalBossDefinition(mapId)))("awards the reporting player's personal clear on %s", mapId => {
  const f = strongBossFixture(mapId);
  reportEnemy(f, "boss");
  const definition = personalBossDefinition(mapId)!;
  if (definition.kind === "procedural") expect(f.db.proceduralProgress.identity.find(f.ctx.sender).completed).toBe(40);
  else {
    const progress = f.db.playerProgress.identity.find(f.ctx.sender);
    expect(progress.bossRewardClaims & (BOSS_REWARD_CLAIM_BITS as any)[definition.kind]).not.toBe(0);
    const index = MAP_IDS.indexOf(mapId as typeof MAP_IDS[number]);
    if (index < CAMPAIGN_UNLOCK_FIELDS.length) expect(progress[CAMPAIGN_UNLOCK_FIELDS[index]]).toBe(true);
  }
  // Client simulation never writes shared HP, contribution tables or reward schedules.
  expect([...f.db.dragonContribution.iter()]).toHaveLength(0);
  expect([...f.db.proceduralInstanceContribution.iter()]).toHaveLength(0);
  expect([...f.db.dragonRespawnSchedule.iter()]).toHaveLength(0);
});
it.each(["damageDragon", "damageSpiderFromPosition", "damageFrostclawFromPosition", "damageMagmaliskFromPosition", "damageGloomrootFromPosition", "damageTidewyrmFromPosition", "damageKoiShogunFromPosition", "damageTempestKirinFromPosition", "damageMiremawFromPosition", "damagePrismshellFromPosition", "damageIronhornFromPosition", "damageDreadreaperFromPosition", "damageVoltwardenFromPosition", "damageGravebloomFromPosition", "damageAegisPrimeFromPosition", "hitProceduralBoss", "hitProceduralBossBatch"])("blocks old shared combat endpoint %s", name => {
  const f = crystalFixture();
  expect(() => f.run((server as any)[name], { hits: 100, x: 4050, y: 4050, mapId: "endless_1", encounter: 1n, bossKey: "old" })).toThrow("updated");
});
