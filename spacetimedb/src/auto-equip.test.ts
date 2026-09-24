import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportEnemy } from "../../tests/helpers/enemy-defeat";
import { bowSkillKey, bowSkillRollFor } from "./bow-skills";
import { combatTimeKey } from "./enemy-defeats";
import { publishItemDrop } from "./equipment-copies";
import { CAMPAIGN_UNLOCK_FIELDS } from "../../shared/equipment-access";
import { BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
import { IRON_BOW, SAMURAI_HAT, STARTER_BOW, STARTER_STONE } from "../../shared/items";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

type Fixture = ReturnType<typeof crystalFixture>;
type Roll = { arrowStorm: number; ricochet: number; piercingShot: number };
const LOW: Roll = { arrowStorm: 1, ricochet: 0, piercingShot: 0 }; // Skills +2.5%
const TOP: Roll = { arrowStorm: 3, ricochet: 3, piercingShot: 3 }; // a starter bow's best: +17.1%
const NONE: Roll = { arrowStorm: 0, ricochet: 0, piercingShot: 0 };
const ALL_MAPS = Object.fromEntries(CAMPAIGN_UNLOCK_FIELDS.map(field => [field, true]));
const UP_TO_CRYSTAL = Object.fromEntries(CAMPAIGN_UNLOCK_FIELDS.slice(0, CAMPAIGN_UNLOCK_FIELDS.indexOf("crystalHollowsUnlocked") + 1).map(field => [field, true]));

const rollOf = (row: any): Roll => ({ arrowStorm: row.arrowStorm, ricochet: row.ricochet, piercingShot: row.piercingShot });
const firstRoll = (f: Fixture, itemId = STARTER_BOW) => rollOf(bowSkillRollFor(f.ctx as any, f.ctx.sender, itemId));
const offers = (f: Fixture) => [...f.db.pendingEquipmentOffer.identity.filter(f.ctx.sender)];
const copies = (f: Fixture) => [...f.db.playerEquipmentCopy.identity.filter(f.ctx.sender)];
const progress = (f: Fixture) => f.db.playerProgress.identity.find(f.ctx.sender);
const inventory = (f: Fixture): string[] => JSON.parse(progress(f).inventoryJson);
const seedFirst = (f: Fixture, roll: Roll, itemId = STARTER_BOW) =>
  f.seed("playerBowSkill", { key: bowSkillKey(f.ctx.sender, itemId), identity: f.ctx.sender, itemId, ...roll });
const seedCopy = (f: Fixture, roll: Roll, itemId = STARTER_BOW) =>
  f.seed("playerEquipmentCopy", { id: 0n, identity: f.ctx.sender, itemId, ...roll, acquiredAt: f.ctx.timestamp });
const settings = (f: Fixture, autoKeepBest: boolean, autoEquipBest: boolean) =>
  f.seed("playerLootSetting", { identity: f.ctx.sender, autoKeepBest, autoEquipBest, updatedAt: f.ctx.timestamp });
/** ctx.random answering from a list, round and round. */
const draws = (f: Fixture, values: number[]) => {
  let next = 0;
  Object.assign(f.ctx, { random: Object.assign(() => values[next++ % values.length], { integerInRange: (min: number) => min }) });
};
const plainRandom = (f: Fixture) => {
  Object.assign(f.ctx, { random: Object.assign(() => .5, { integerInRange: (min: number, max: number) => Math.floor((min + max) / 2) }) });
};
// Each skill draws appearance then chance: 0 appears, .999 lands at the top of the range, .9 never appears.
const EVERY_SKILL_AT_THE_TOP = [0, .999];
const ARROW_STORM_ONLY_AT_THE_TOP = [0, .999, .9, .9, .9, .9];
const NO_SKILLS = [.9];

// Kill-claim bounds, as in bow-skills.test.ts: one arrow a second that
// one-shots and ten seconds banked, so without skills 12 kills are paid.
const ENEMY = "Shard Hopper";
const kills = (f: Fixture) => Number(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n);
function archer(roll: Roll = LOW) {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', bowCount: 1, damage: 1e15, attackRate: 1, projectileCount: 1 });
  seedFirst(f, roll);
  fillDefeatBudget(f, "crystal_hollows", ENEMY);
  f.seed("enemyDefeatBudget", { key: combatTimeKey(f.ctx.sender), identity: f.ctx.sender, tokens: 10, updatedAtMicros: f.ctx.timestamp.microsSinceUnixEpoch });
  return f;
}

it("puts a better duplicate roll on the first copy, so the bow in hand reads it for kill bounds", () => {
  const plain = archer(NONE);
  reportEnemy(plain, ENEMY, 16);
  expect(kills(plain)).toBe(12);

  const f = archer();
  draws(f, EVERY_SKILL_AT_THE_TOP);
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, STARTER_BOW, true));
  expect(firstRoll(f)).toEqual(TOP);
  expect(offers(f)).toEqual([]);
  expect(copies(f)).toEqual([]);
  expect(progress(f).equippedRightHand).toBe(STARTER_BOW);
  // 1 + .03 * (5 + 2 + 4) = 1.33 enemies an arrow, within the 1.25 tolerance: 16.
  plainRandom(f);
  reportEnemy(f, ENEMY, 16);
  expect(kills(f)).toBe(16);
});

it("throws away a worse or equal duplicate without an offer", () => {
  for (const sequence of [NO_SKILLS, EVERY_SKILL_AT_THE_TOP]) {
    const f = archer(TOP);
    draws(f, sequence);
    f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, STARTER_BOW, true, 3));
    expect(firstRoll(f)).toEqual(TOP);
    expect(offers(f)).toEqual([]);
    expect(copies(f)).toEqual([]);
  }
});

it("measures a new copy against the best kept copy too, and never touches kept copies", () => {
  const f = archer(LOW);
  seedCopy(f, TOP);
  draws(f, ARROW_STORM_ONLY_AT_THE_TOP); // +7.5%: better than the first copy, not the kept one
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, STARTER_BOW, true));
  expect(firstRoll(f)).toEqual(LOW);
  expect(copies(f).map(rollOf)).toEqual([TOP]);
  expect(offers(f)).toEqual([]);
});

it("throws away duplicates of gear without skills, silently", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: JSON.stringify([SAMURAI_HAT]) });
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, SAMURAI_HAT, true, 2));
  expect(offers(f)).toEqual([]);
  expect(copies(f)).toEqual([]);
  expect(inventory(f).filter(id => id === SAMURAI_HAT)).toHaveLength(1);
  expect(f.db.playerItemDrop.key.find(`${f.ctx.sender.toHexString()}:${SAMURAI_HAT}`).alreadyOwned).toBe(true);
});

it("still makes a Keep/Ignore offer when the player turned Auto keep best off", () => {
  const f = archer(LOW);
  settings(f, false, true);
  draws(f, EVERY_SKILL_AT_THE_TOP);
  f.run((ctx: any) => publishItemDrop(ctx, ctx.sender, STARTER_BOW, true));
  expect(offers(f).map(rollOf)).toEqual([TOP]);
  expect(firstRoll(f)).toEqual(LOW);
});

it("lets the loot filter win: a filtered bow never drops, so it is never compared", () => {
  const f = crystalFixture();
  draws(f, [0]);
  f.patch("playerProgress", { damage: 1e15, inventoryJson: JSON.stringify(["crystal_bow"]) });
  seedFirst(f, NONE, "crystal_bow");
  f.run(server.setIgnoredDrops, { itemIds: ["crystal_bow"], ignored: true });
  fillDefeatBudget(f, "crystal_hollows", ENEMY);
  reportEnemy(f, ENEMY, 1);
  expect(firstRoll(f, "crystal_bow")).toEqual(NONE);
  expect(f.db.playerItemDrop.key.find(`${f.ctx.sender.toHexString()}:crystal_bow`)).toBeNull();
  expect(offers(f)).toEqual([]);
});

/** A player on Crystal Hollows who has reached it, with a weaker bow in hand. */
function looter(extra: Record<string, unknown> = {}) {
  const f = crystalFixture();
  draws(f, [0]); // every loot roll wins
  f.patch("playerProgress", { damage: 1e15, inventoryJson: JSON.stringify([IRON_BOW]), equippedRightHand: IRON_BOW, ...UP_TO_CRYSTAL, ...extra });
  fillDefeatBudget(f, "crystal_hollows", ENEMY);
  return f;
}

it("equips a better new drop, with the player row showing it", () => {
  const f = looter();
  reportEnemy(f, ENEMY, 1);
  expect(inventory(f)).toContain("crystal_bow");
  expect(progress(f).equippedRightHand).toBe("crystal_bow");
  expect(f.db.player.identity.find(f.ctx.sender).rightHandItem).toBe("crystal_bow");
});

it("leaves a new drop in the bag when it is worse, locked, or the player turned Auto equip off", () => {
  // Skills count: the new crystal bow rolls every skill, so the ion bow in hand needs its own to stay ahead.
  const worse = looter({ inventoryJson: JSON.stringify(["ion_bow"]), equippedRightHand: "ion_bow", ...ALL_MAPS });
  seedFirst(worse, { arrowStorm: 15, ricochet: 15, piercingShot: 15 }, "ion_bow");
  reportEnemy(worse, ENEMY, 1);
  expect(inventory(worse)).toContain("crystal_bow");
  expect(progress(worse).equippedRightHand).toBe("ion_bow");

  const locked = looter({ crystalHollowsUnlocked: false });
  reportEnemy(locked, ENEMY, 1);
  expect(inventory(locked)).toContain("crystal_bow");
  expect(progress(locked).equippedRightHand).toBe(IRON_BOW);

  const off = looter();
  settings(off, true, false);
  reportEnemy(off, ENEMY, 1);
  expect(inventory(off)).toContain("crystal_bow");
  expect(progress(off).equippedRightHand).toBe(IRON_BOW);
});

it("equips gear already in the bag when reaching a map unlocks it, only with Auto equip on", () => {
  for (const autoEquipBest of [true, false]) {
    const f = crystalFixture();
    f.patch("playerProgress", { damage: 1e15, inventoryJson: JSON.stringify([IRON_BOW, "clockwork_bow"]), equippedRightHand: IRON_BOW, ...UP_TO_CRYSTAL });
    settings(f, true, autoEquipBest);
    // Prismshell's reward opens Clockwork Ruins, the clockwork bow's tier.
    reportEnemy(f, "boss", 1);
    expect(progress(f).clockworkRuinsUnlocked).toBe(true);
    expect(progress(f).equippedRightHand).toBe(autoEquipBest ? "clockwork_bow" : IRON_BOW);
  }
});

/** A player who finished the campaign with top gear, ready to prestige. */
function veteran() {
  const f = crystalFixture();
  f.patch("playerProgress", {
    ...ALL_MAPS, bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime, bowCount: 1,
    inventoryJson: JSON.stringify([STARTER_BOW, IRON_BOW, "ion_bow", "ion_helmet", "forest_cap", SAMURAI_HAT]),
    equippedRightHand: "ion_bow", equippedHead: "ion_helmet",
  });
  f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 1 });
  seedFirst(f, TOP, "ion_bow");
  seedCopy(f, LOW, "ion_bow");
  f.seed("pendingEquipmentOffer", { id: 0n, identity: f.ctx.sender, itemId: "ion_bow", ...LOW, createdAt: f.ctx.timestamp, expiresAt: f.ctx.timestamp });
  f.run(server.setIgnoredDrops, { itemIds: ["slot:FEET"], ignored: true });
  return f;
}

it("keeps the bag, kept copies, bow rolls, loot filter and settings through prestige", () => {
  const f = veteran();
  settings(f, false, true);
  f.run(server.prestigeAccount, {});
  expect(inventory(f)).toEqual(expect.arrayContaining([STARTER_BOW, IRON_BOW, "ion_bow", "ion_helmet", SAMURAI_HAT]));
  expect(firstRoll(f, "ion_bow")).toEqual(TOP);
  expect(copies(f).map(rollOf)).toEqual([LOW]);
  expect(offers(f)).toEqual([]);
  expect([...f.db.playerIgnoredDrop.identity.filter(f.ctx.sender)].map(row => row.itemId)).toEqual(["slot:FEET"]);
  expect(f.db.playerLootSetting.identity.find(f.ctx.sender)).toMatchObject({ autoKeepBest: false });
  // Everything else prestige does is unchanged: the maps start over.
  expect(CAMPAIGN_UNLOCK_FIELDS.some(field => progress(f)[field])).toBe(false);
});

it("swaps gear its maps lock away for the best usable gear, never leaving an empty hand", () => {
  const f = veteran();
  f.run(server.prestigeAccount, {});
  // The ion bow and helmet are locked until Ion Citadel; the starter bow and forest cap are the best usable.
  expect(progress(f).equippedRightHand).toBe(STARTER_BOW);
  expect(progress(f).equippedHead).toBe("forest_cap");
  expect(f.db.player.identity.find(f.ctx.sender).rightHandItem).toBe(STARTER_BOW);
  expect(() => f.run(server.savePlayerProgress, { ...progress(f), equippedRightHand: "ion_bow", enemyKills: 0 })).toThrow(/Reach .* to equip/);

  // With nothing usable in the bag, the hand falls back to the starter stone every player owns.
  const bare = crystalFixture();
  bare.patch("playerProgress", { ...ALL_MAPS, bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime,
    inventoryJson: JSON.stringify(["ion_bow"]), equippedRightHand: "ion_bow" });
  bare.seed("proceduralProgress", { identity: bare.ctx.sender, completed: 1 });
  bare.run(server.prestigeAccount, {});
  expect(inventory(bare)).toContain("ion_bow");
  expect(progress(bare).equippedRightHand).toBe(STARTER_STONE);
});

it("still clears the bag and kept copies on a reset", () => {
  const f = veteran();
  f.run(server.resetPlayerProgress, {});
  expect(inventory(f)).not.toContain("ion_bow");
  expect(copies(f)).toEqual([]);
  expect(offers(f)).toEqual([]);
  expect(progress(f).equippedRightHand).toBe(STARTER_STONE);
});
