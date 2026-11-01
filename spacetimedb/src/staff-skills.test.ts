import { Timestamp } from "spacetimedb";
import { BOW_ATTACK_SPEED_BONUS } from "../../shared/bow-skills";
import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportEnemy, seedDefeatClock } from "../../tests/helpers/enemy-defeat";
import { progressOf } from "../../tests/helpers/progress";
import { advanceDuelCombat, initialDuelCombatState } from "../../shared/duel-combat";
import { mapEnemyPopulation } from "../../shared/enemy-defeats";
import { REGULAR_ENEMY_RESPAWN_SECONDS } from "../../shared/rules";
import { STARTER_BOW, STARTER_STAFF } from "../../shared/items";
import { CAMPAIGN_UNLOCK_FIELDS } from "../../shared/equipment-access";
import { STAFF_BOLT_DAMAGE_FACTOR, STAFF_CAST_INTERVAL_FACTOR, STAFF_SPLASH_MAX_TARGETS, staffSkillReachMultiplier } from "../../shared/staff-skills";
import { TOWN_FEET_OFFSET, TOWN_SMITH_POSITION } from "../../shared/town";
import { PLAUSIBLE_KILL_TOLERANCE } from "./enemy-defeats";
import { createCombatReport } from "./boss-combat";
import { eraseIdentityRows } from "./account-erasure";
import { offerDuplicateEquipment, publishItemDrop } from "./equipment-copies";
import { syncWornSkill } from "./worn-skill";
import {
  mergeStaffSkills, setStaffOfferRoll, setStaffSkillRoll, staffCopyKey, staffCopyRoll, staffOfferKey, staffSkillKey, staffSkillRollFor,
} from "./staff-skills";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

type Fixture = ReturnType<typeof crystalFixture>;
const ctxOf = (f: Fixture) => f.ctx as any;
const A = { meteor: 7, chain: 0, frostNova: 0 }, B = { meteor: 0, chain: 9, frostNova: 10 };
const ALL_MAPS = Object.fromEntries(CAMPAIGN_UNLOCK_FIELDS.map(field => [field, true]));
function mage(roll = A) {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: '["ion_staff"]', equippedRightHand: "ion_staff", ...ALL_MAPS });
  f.transaction(() => setStaffSkillRoll(ctxOf(f), f.ctx.sender, "ion_staff", roll));
  return f;
}

it("rolls a staff the moment it drops, in its tier's range, into its own table and no column", () => {
  const f = crystalFixture();
  Object.assign(f.ctx, { random: () => 0 });
  f.transaction(() => publishItemDrop(f.ctx, f.ctx.sender, "ion_staff", false));
  // Tier 15 rolls 7-15%: every skill appears at the bottom of it.
  expect(staffSkillRollFor(ctxOf(f), f.ctx.sender, "ion_staff")).toEqual({ meteor: 7, chain: 7, frostNova: 7 });
  expect(f.db.playerStaffSkill.key.find(staffSkillKey(f.ctx.sender, "ion_staff"))).toMatchObject({ copyId: 0n, offerId: 0n });
  expect([...f.db.playerBowSkill.iter()]).toHaveLength(0);
  expect([...f.db.playerSwordSkill.iter()]).toHaveLength(0);
  // A duplicate merges in per skill: never lower.
  Object.assign(f.ctx, { random: () => .999 });
  f.transaction(() => publishItemDrop(f.ctx, f.ctx.sender, "ion_staff", true));
  expect(staffSkillRollFor(ctxOf(f), f.ctx.sender, "ion_staff")).toEqual({ meteor: 7, chain: 7, frostNova: 7 });
});

it("carries an offered staff's roll through keeping, selecting and promoting its copy, and cleans up after each", () => {
  const f = mage();
  Object.assign(f.ctx, { random: () => .1 });
  f.transaction(() => offerDuplicateEquipment(f.ctx, f.ctx.sender, "ion_staff"));
  const [offer] = [...f.db.pendingEquipmentOffer.iter()];
  // The offer row keeps its old shape: zero bow and sword columns, the roll beside it.
  expect(offer).toMatchObject({ arrowStorm: 0, whirlwind: 0 });
  expect(f.db.playerStaffSkill.key.find(staffOfferKey(offer.id))).toBeTruthy();
  f.transaction(() => setStaffOfferRoll(ctxOf(f), f.ctx.sender, "ion_staff", offer.id, B));
  f.run(server.resolveEquipmentOffer, { id: offer.id, keep: true });
  expect(f.db.playerStaffSkill.key.find(staffOfferKey(offer.id))).toBeNull();
  const [copy] = [...f.db.playerEquipmentCopy.iter()];
  expect(staffCopyRoll(ctxOf(f), copy.id)).toEqual(B);
  f.run(server.selectEquipmentCopy, { copyId: copy.id });
  expect(staffSkillRollFor(ctxOf(f), f.ctx.sender, "ion_staff")).toEqual(B);
  expect(staffCopyRoll(ctxOf(f), copy.id)).toEqual(A);
  f.run(server.destroyEquipmentCopy, { itemId: "ion_staff", copyId: 0n });
  expect(staffSkillRollFor(ctxOf(f), f.ctx.sender, "ion_staff")).toEqual(A);
  expect([...f.db.playerEquipmentCopy.iter()]).toHaveLength(0);
  expect(f.db.playerStaffSkill.key.find(staffCopyKey(copy.id))).toBeNull();
});

it("drops an ignored offer's roll with it", () => {
  const f = mage();
  f.transaction(() => offerDuplicateEquipment(f.ctx, f.ctx.sender, "ion_staff"));
  const [offer] = [...f.db.pendingEquipmentOffer.iter()];
  f.run(server.resolveEquipmentOffer, { id: offer.id, keep: false });
  expect([...f.db.playerStaffSkill.iter()].map(row => row.key)).toEqual([staffSkillKey(f.ctx.sender, "ion_staff")]);
});

it("keeps rolls private, moves a guest's to the account, and erases them with the account", () => {
  const f = mage(), guest = identity("3");
  f.transaction(() => setStaffSkillRoll(ctxOf(f), guest, "desert_staff", B));
  expect((server.myStaffSkills as any)(f.ctx).map((row: any) => row.itemId)).toEqual(["ion_staff"]);
  f.transaction(() => mergeStaffSkills(ctxOf(f), guest, f.ctx.sender));
  expect(staffSkillRollFor(ctxOf(f), f.ctx.sender, "desert_staff")).toEqual(B);
  expect([...f.db.playerStaffSkill.identity.filter(guest)]).toHaveLength(0);
  f.transaction(() => eraseIdentityRows(f.ctx, [f.ctx.sender]));
  expect([...f.db.playerStaffSkill.iter()]).toHaveLength(0);
});

it("shows the staff in hand's roll on the public profile table, not the bow and sword one", () => {
  const f = mage(B);
  f.seed("playerWornSkill", { identity: f.ctx.sender, itemId: "ion_bow", arrowStorm: 1, ricochet: 0, piercingShot: 0, whirlwind: 0, deflect: 0, shockwave: 0 });
  f.transaction(() => syncWornSkill(f.ctx, f.ctx.sender));
  expect(f.db.playerWornStaffSkill.identity.find(f.ctx.sender)).toMatchObject({ itemId: "ion_staff", chain: 9, frostNova: 10 });
  expect(f.db.playerWornSkill.identity.find(f.ctx.sender)).toBeNull();
});

// Kill-claim bounds. One cast every 1.35 s (the attack interval is 1 s) that one-shots, and ten seconds banked.
const ENEMY = "Shard Hopper";
const kills = (f: Fixture) => Number(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n);
function farmer(weapon: string, roll?: typeof A) {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: weapon, inventoryJson: JSON.stringify([weapon]), bowCount: 1, damage: 1e15, attackRate: 1, projectileCount: 1, ...ALL_MAPS });
  if (roll) f.transaction(() => setStaffSkillRoll(ctxOf(f), f.ctx.sender, weapon, roll));
  fillDefeatBudget(f, "crystal_hollows", ENEMY);
  seedDefeatClock(f, "combat", 10);
  return f;
}
const casts = 10 / STAFF_CAST_INTERVAL_FACTOR;
const wall = Math.floor(10 * mapEnemyPopulation("crystal_hollows") / REGULAR_ENEMY_RESPAWN_SECONDS + 1e-6);

it("pays an honest staff farmer every enemy its bursts kill in a pack, where a bow's bound would clip it", () => {
  // Seven casts in ten seconds, each burst killing a pack of four: 28 kills, more than seven casts alone allow.
  const honest = Math.floor(casts) * 4;
  expect(honest).toBe(28);
  expect(honest).toBeLessThanOrEqual(wall);
  const archer = farmer(STARTER_BOW);
  reportEnemy(archer, ENEMY, honest);
  expect(kills(archer)).toBe(Math.floor(10 * (1 + BOW_ATTACK_SPEED_BONUS) * PLAUSIBLE_KILL_TOLERANCE));
  const staff = farmer(STARTER_STAFF);
  reportEnemy(staff, ENEMY, honest);
  expect(kills(staff)).toBe(honest);
  // Skills only add reach.
  const skilled = farmer("ion_staff", { meteor: 15, chain: 15, frostNova: 15 });
  reportEnemy(skilled, ENEMY, honest);
  expect(kills(skilled)).toBe(honest);
});

it("still bounds a forged staff claim at what full bursts could land, or the map's respawn", () => {
  const f = farmer("ion_staff", { meteor: 15, chain: 15, frostNova: 15 });
  reportEnemy(f, ENEMY, 500);
  const staff = Math.floor(casts * staffSkillReachMultiplier({ meteor: 15, chain: 15, frostNova: 15 }) * PLAUSIBLE_KILL_TOLERANCE);
  expect(kills(f)).toBe(Math.min(staff, wall));
  expect(kills(f)).toBeLessThan(500);
  expect(f.db.defeatSessionRestriction.identity.find(f.ctx.sender)).toBeNull();
});

it("counts a staff's slower casts, heavier bolts and burst in the combat bound", () => {
  const f = farmer(STARTER_STAFF);
  f.patch("playerProgress", { damage: 10, equippedHead: "", equippedChest: "" });
  const { combatBoundForReport } = createCombatReport({ attackIntervalForProgress: progress => progress.attackRate,
    itemUpgradeLevelFor: () => 0, inventoryForProgress: progress => JSON.parse(progress.inventoryJson),
    equippedRightHandForProgress: progress => progress.equippedRightHand, equippedLeftHandForProgress: progress => progress.equippedLeftHand,
    equippedHeadForProgress: progress => progress.equippedHead, equippedChestForProgress: progress => progress.equippedChest });
  const bound = () => combatBoundForReport(f.ctx as any).preview({ type: "damage", amount: 0, count: 0 });
  const staff = bound();
  f.patch("playerProgress", { equippedRightHand: "starter_stone", inventoryJson: '["starter_stone"]' });
  const stone = bound();
  expect(staff.attackInterval).toBeCloseTo(STAFF_CAST_INTERVAL_FACTOR);
  expect(staff.dps).toBeCloseTo(stone.dps * STAFF_BOLT_DAMAGE_FACTOR / STAFF_CAST_INTERVAL_FACTOR);
  expect(staff.reach).toBeCloseTo(stone.reach! * STAFF_SPLASH_MAX_TARGETS);
});

it("freezes staff rolls for a duel and resolves it as its replay will", () => {
  const f = mage(), opponent = identity("b");
  f.patch("playerProgress", { damage: 10, maxHp: 10000 });
  f.progress(opponent, { inventoryJson: '["starter_bow"]', equippedRightHand: "starter_bow", damage: 10, maxHp: 10000 });
  f.seed("playerProfile", { identity: opponent, displayName: "Opponent" });
  f.seed("player", { ...f.db.player.identity.find(f.ctx.sender), identity: opponent });
  f.transaction(() => setStaffSkillRoll(ctxOf(f), f.ctx.sender, "ion_staff", { meteor: 100, chain: 100, frostNova: 100 }));
  f.run(server.requestDuel, { opponent });
  const duel = [...f.db.duel.iter()][0], frozen = f.db.duelCombatSnapshot.duelId.find(duel.id);
  const staff = f.db.duelStaffSkill.duelId.find(duel.id);
  expect(staff).toMatchObject({ challengerMeteor: 100, challengerChain: 100, challengerFrostNova: 100, opponentMeteor: 0 });
  // The staff's slower casts are in the duel row itself.
  expect(duel.challengerAttackRate).toBeCloseTo(duel.opponentAttackRate * STAFF_CAST_INTERVAL_FACTOR * (1 + BOW_ATTACK_SPEED_BONUS));
  f.transaction(() => setStaffSkillRoll(ctxOf(f), f.ctx.sender, "ion_staff", A));
  f.ctx.timestamp = new Timestamp(duel.endsAtMicros + 1_000_000n); f.run(server.pulseDuel);
  const finishing = f.db.duel.id.find(duel.id);
  const predicted = advanceDuelCombat({ ...duel, ...frozen, ...staff }, initialDuelCombatState(duel), 0,
    Number(finishing.lastResolvedAt.microsSinceUnixEpoch - duel.startsAtMicros));
  expect(finishing.opponentHp).toBeCloseTo(predicted.opponentHp, 4);
  expect(finishing.challengerDamageDealt).toBeCloseTo(predicted.challengerDamageDealt, 4);
  expect(finishing).not.toHaveProperty("challengerChilledUntil");
});

it("hands out a Starter Staff at the Smith, once at a time, into the bag", () => {
  const f = crystalFixture();
  const standAt = (x: number) => f.patch("player", { mapId: "town", x, y: TOWN_SMITH_POSITION.y - TOWN_FEET_OFFSET });
  standAt(TOWN_SMITH_POSITION.x + 400);
  expect(() => f.run(server.claimStarterStaff, {})).toThrow("Talk to the Smith first.");
  standAt(TOWN_SMITH_POSITION.x);
  f.run(server.claimStarterStaff, {});
  const bag = () => JSON.parse(progressOf(f, f.ctx.sender).inventoryJson) as string[];
  expect(bag()).toContain(STARTER_STAFF);
  expect(() => f.run(server.claimStarterStaff, {})).toThrow("already have a Starter Staff");
  // Thrown away, the Smith hands out another.
  f.run(server.destroyEquipmentCopy, { itemId: STARTER_STAFF, copyId: 0n });
  expect(bag()).not.toContain(STARTER_STAFF);
  f.run(server.claimStarterStaff, {});
  expect(bag()).toContain(STARTER_STAFF);
});
