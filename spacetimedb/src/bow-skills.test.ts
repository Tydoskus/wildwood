import { readFileSync } from "node:fs";
import { Timestamp } from "spacetimedb";
import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportEnemy } from "../../tests/helpers/enemy-defeat";
import { eraseIdentityRows } from "./account-erasure";
import { bowSkillKey } from "./bow-skills";
import { combatTimeKey, PLAUSIBLE_KILL_TOLERANCE } from "./enemy-defeats";
import { bowSkillChanceRangeTenths, bowSkillReachMultiplier } from "../../shared/bow-skills";
import { ATTACK_BALANCE_VERSION, SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
import { STARTER_BOW } from "../../shared/items";
import { TERMS_VERSION } from "../../shared/legal";
import { DUEL_COMBAT_VERSION } from "../../shared/duel-combat";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

type Fixture = ReturnType<typeof crystalFixture>;
const rowFor = (f: Fixture, itemId: string, who = f.ctx.sender) => f.db.playerBowSkill.key.find(bowSkillKey(who, itemId));
const rows = (f: Fixture, who = f.ctx.sender) => [...f.db.playerBowSkill.identity.filter(who)];
/** Every skill appears, at the bottom tenth of its range, and every loot roll wins. */
const luckyRandom = (f: Fixture, float = .1) => {
  Object.assign(f.ctx, { random: Object.assign(() => float, { integerInRange: (min: number) => min }) });
};
const seedRoll = (f: Fixture, itemId: string, roll: { arrowStorm: number; ricochet: number; piercingShot: number }, who = f.ctx.sender) =>
  f.seed("playerBowSkill", { key: bowSkillKey(who, itemId), identity: who, itemId, ...roll });

it("rolls a bow the moment it drops, in its tier's range, and never again", () => {
  const f = crystalFixture();
  luckyRandom(f);
  f.patch("playerProgress", { damage: 1e15 });
  fillDefeatBudget(f, "crystal_hollows", "Shard Hopper");
  reportEnemy(f, "Shard Hopper", 1);
  const roll = rowFor(f, "crystal_bow");
  // Crystalwing is a tier 10 bow: 4.9-10.7%. A draw of .1 lands 5 tenths in.
  const { min, max } = bowSkillChanceRangeTenths(10);
  expect([min, max]).toEqual([49, 107]);
  expect(roll).toMatchObject({ itemId: "crystal_bow", arrowStorm: 5.4, ricochet: 5.4, piercingShot: 5.4 });
  // Armor and helmets are not bows and get no row.
  expect(rows(f).map(row => row.itemId)).toEqual(["crystal_bow"]);
  // Another drop of the same bow keeps the first roll.
  luckyRandom(f, .9);
  reportEnemy(f, "Shard Hopper", 1);
  expect(rowFor(f, "crystal_bow")).toEqual(roll);
});

it("records a bow whose skills all failed to appear, so it is never rolled again", () => {
  const f = crystalFixture();
  luckyRandom(f, .5); // .5 is past the one-in-three appearance chance
  f.patch("playerProgress", { damage: 1e15 });
  fillDefeatBudget(f, "crystal_hollows", "Shard Hopper");
  reportEnemy(f, "Shard Hopper", 1);
  expect(rowFor(f, "crystal_bow")).toMatchObject({ arrowStorm: 0, ricochet: 0, piercingShot: 0 });
});

it("rolls a gifted bow when the gift is claimed", () => {
  const f = crystalFixture();
  luckyRandom(f);
  f.seed("playerItemGift", { key: "test:gift", identity: f.ctx.sender, campaign: "test", itemId: STARTER_BOW, claimed: false, createdAt: f.ctx.timestamp });
  f.run(server.claimDeveloperItemGift, { key: "test:gift" });
  expect(rowFor(f, STARTER_BOW)).toMatchObject({ arrowStorm: 1.2, ricochet: 1.2, piercingShot: 1.2 });
});

it("never rolls a bow held before skills existed: world entry, duels and duplicate drops leave it without skills", () => {
  const f = crystalFixture();
  luckyRandom(f);
  f.patch("playerProgress", { inventoryJson: '["starter_stone","iron_bow"]' });
  f.seed("playerLegalConsent", { identity: f.ctx.sender, termsVersion: TERMS_VERSION, ageBand: 2, acceptedAt: f.ctx.timestamp });
  f.run(server.enterWorld, { tabId: "testtabid" });
  expect(rowFor(f, "iron_bow")).toBeNull();
});

it("serves a player only their own rolls through my_bow_skills", () => {
  const f = crystalFixture();
  seedRoll(f, "iron_bow", { arrowStorm: 2, ricochet: 0, piercingShot: 0 });
  seedRoll(f, "iron_bow", { arrowStorm: 3, ricochet: 0, piercingShot: 0 }, identity("3"));
  expect((server.myBowSkills as any)(f.ctx)).toEqual([expect.objectContaining({ itemId: "iron_bow", arrowStorm: 2 })]);
});

function linkGuest(f: Fixture, guest: ReturnType<typeof identity>) {
  f.db.playerProgress.identity.delete(f.ctx.sender);
  f.progress(guest);
  f.seed("playerBalanceVersion", { identity: guest, version: ATTACK_BALANCE_VERSION });
  f.seed("accountLink", { code: "bow-link", guest, createdAt: f.ctx.timestamp });
  f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
  f.run(server.claimGuestAccount, { code: "bow-link" });
}

it("moves a guest's rolls to the account, keeping the account's own roll for a bow it already had", () => {
  const f = crystalFixture();
  const guest = identity("2");
  seedRoll(f, "iron_bow", { arrowStorm: 9, ricochet: 9, piercingShot: 9 }, guest);
  seedRoll(f, "night_bow", { arrowStorm: 4, ricochet: 0, piercingShot: 3 }, guest);
  seedRoll(f, "iron_bow", { arrowStorm: 1, ricochet: 0, piercingShot: 0 });
  linkGuest(f, guest);
  expect(rows(f, guest)).toEqual([]);
  expect(rowFor(f, "iron_bow")).toMatchObject({ arrowStorm: 1, ricochet: 0, piercingShot: 0 });
  expect(rowFor(f, "night_bow")).toMatchObject({ arrowStorm: 4, ricochet: 0, piercingShot: 3, identity: f.ctx.sender });
});

it("is erased with the account and removed wherever a player's rows are removed", () => {
  const f = crystalFixture();
  const other = identity("3");
  seedRoll(f, "iron_bow", { arrowStorm: 2, ricochet: 0, piercingShot: 0 });
  seedRoll(f, "iron_bow", { arrowStorm: 2, ricochet: 0, piercingShot: 0 }, other);
  eraseIdentityRows(f.ctx, [f.ctx.sender]);
  expect(rows(f)).toEqual([]);
  expect(rows(f, other)).toHaveLength(1);
  const lifecycle = readFileSync(new URL("./account-lifecycle.ts", import.meta.url), "utf8");
  const section = (start: string, end: string) => lifecycle.slice(lifecycle.indexOf(start), lifecycle.indexOf(end, lifecycle.indexOf(start)));
  expect(section("function removeVirtualPlayerData", "function removePlayerIdentityData")).toContain("removeBowSkills(ctx, identity)");
  expect(section("function removePlayerIdentityData", "return {")).toContain("removeBowSkills(ctx, identity)");
});

// Kill-claim bounds. One arrow a second that one-shots, and ten seconds banked
// on the account's combat clock: without skills the bound is 12 kills.
const ENEMY = "Shard Hopper";
const TOP = { arrowStorm: 15, ricochet: 15, piercingShot: 15 };
const kills = (f: Fixture) => Number(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n);
function oneShotter(roll?: typeof TOP) {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', bowCount: 1, damage: 1e15, attackRate: 1, projectileCount: 1 });
  if (roll) seedRoll(f, STARTER_BOW, roll);
  fillDefeatBudget(f, "crystal_hollows", ENEMY);
  f.seed("enemyDefeatBudget", { key: combatTimeKey(f.ctx.sender), identity: f.ctx.sender, tokens: 10, updatedAtMicros: f.ctx.timestamp.microsSinceUnixEpoch });
  return f;
}

it("pays an honest top-rolled bow its full claim where the skill-free bound would clip it", () => {
  // Ten arrows at 15% each: on average 1 + .15 * (5 + 2 + 4) = 2.65 enemies
  // struck per arrow, so an honest client lands about 26 kills in ten seconds.
  const honest = Math.floor(10 * bowSkillReachMultiplier(TOP));
  expect(honest).toBe(26);
  const plain = oneShotter();
  reportEnemy(plain, ENEMY, honest);
  expect(kills(plain)).toBe(Math.floor(10 * PLAUSIBLE_KILL_TOLERANCE));
  const skilled = oneShotter(TOP);
  reportEnemy(skilled, ENEMY, honest);
  expect(kills(skilled)).toBe(honest);
});

it("still bounds a script that claims more than even a top-rolled bow could land", () => {
  const f = oneShotter(TOP);
  reportEnemy(f, ENEMY, 100);
  expect(kills(f)).toBe(Math.floor(10 * bowSkillReachMultiplier(TOP) * PLAUSIBLE_KILL_TOLERANCE));
  expect(kills(f)).toBeLessThan(100);
  expect(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)).toBeNull();
});

it("gives a bow with no roll, or a roll on a bow not in hand, no extra reach", () => {
  const f = oneShotter();
  seedRoll(f, "iron_bow", TOP);
  reportEnemy(f, ENEMY, 26);
  expect(kills(f)).toBe(Math.floor(10 * PLAUSIBLE_KILL_TOLERANCE));
});

it("widens the boss bound by Arrow Storm's extra damage on a lone boss, and only by that", () => {
  // Whether a first boss kill is paid depends on whether this player's damage
  // could have finished it inside the credit a report window grants. Find the
  // least damage that is paid, with and without the skills.
  const paid = (damage: number, roll?: typeof TOP) => {
    const f = crystalFixture();
    f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', bowCount: 1, damage, attackRate: 1, projectileCount: 1 });
    if (roll) seedRoll(f, STARTER_BOW, roll);
    reportEnemy(f, "boss", 1);
    return Boolean(f.db.enemyDefeatBudget.key.find(`${f.ctx.sender.toHexString()}:crystal_hollows:boss`));
  };
  const threshold = (roll?: typeof TOP) => {
    let low = 1, high = 1e30;
    for (let step = 0; step < 80; step++) {
      const mid = Math.sqrt(low * high);
      if (paid(mid, roll)) high = mid; else low = mid;
    }
    return high;
  };
  const plain = threshold();
  // 15% Arrow Storm: five extra arrows at half damage, 1 + .15 * 5 * .5 = 1.375.
  expect(plain / threshold(TOP)).toBeCloseTo(1.375, 2);
  // Ricochet and Piercing Shot have nothing else to reach on a boss.
  expect(plain / threshold({ arrowStorm: 0, ricochet: 15, piercingShot: 15 })).toBeCloseTo(1, 2);
});

function duelAfter(seconds: number, roll?: typeof TOP) {
  const f = crystalFixture();
  const opponent = identity("2");
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', bowCount: 1, maxHp: 1e12 });
  f.progress(opponent, { maxHp: 1e12 });
  f.seed("playerProfile", { identity: opponent, displayName: "Opponent" });
  f.seed("player", { ...f.db.player.identity.find(f.ctx.sender), identity: opponent });
  if (roll) seedRoll(f, STARTER_BOW, roll);
  f.run(server.requestDuel, { opponent });
  const started = [...f.db.duel.iter()][0];
  f.ctx.timestamp = new Timestamp(started.startsAtMicros + BigInt(seconds * 1_000_000));
  f.run(server.pulseDuel);
  return { f, duel: f.db.duel.id.find(started.id) };
}

it("fights a duel with the challenger's equipped bow skills, read from their rolls", () => {
  const plain = duelAfter(5);
  // A bow held before skills existed has no roll, and a duel does not give it one.
  expect(rowFor(plain.f, STARTER_BOW)).toBeNull();
  expect(plain.duel.combatVersion).toBe(DUEL_COMBAT_VERSION);
  const storm = duelAfter(5, { arrowStorm: 100, ricochet: 0, piercingShot: 0 });
  expect(storm.duel.challengerAttacks).toBe(plain.duel.challengerAttacks);
  expect(storm.duel.challengerAttacks).toBeGreaterThan(0);
  // Every hit brings five more arrows at half damage: 3.5 times as much.
  expect(storm.duel.challengerDamageDealt / plain.duel.challengerDamageDealt).toBeCloseTo(3.5, 1);
  // The opponent had no skills and deals exactly what they did.
  expect(storm.duel.opponentDamageDealt).toBe(plain.duel.opponentDamageDealt);
  // Resolving again from the same state gives the same fight.
  expect(duelAfter(5, { arrowStorm: 100, ricochet: 0, piercingShot: 0 }).duel).toEqual(storm.duel);
});
