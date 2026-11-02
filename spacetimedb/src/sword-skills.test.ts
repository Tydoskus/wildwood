import { Timestamp } from "spacetimedb";
import { advanceDuelCombat, initialDuelCombatState } from "../../shared/duel-combat";
import { createCombatReport } from "./boss-combat";
import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { publishItemDrop, offerDuplicateEquipment } from "./equipment-copies";
import { ensureSwordSkillRoll, mergeSwordSkills, setSwordSkillRoll, swordSkillKey, swordSkillRollFor } from "./sword-skills";
import { eraseIdentityRows } from "./account-erasure";
import { weaponSkillColumns } from "../../shared/weapon-skills";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const swordCtx = (f: ReturnType<typeof crystalFixture>) => f.ctx as unknown as Parameters<typeof swordSkillRollFor>[0];
const A = { whirlwind: 7, deflect: 0, shockwave: 0 }, B = { whirlwind: 0, deflect: 9, shockwave: 10 };
function swordsman() {
  const f = crystalFixture();
  f.patch("playerProgress", { inventoryJson: '["ion_sword"]', equippedRightHand: "ion_sword", ionCitadelUnlocked: true });
  f.transaction(() => setSwordSkillRoll(swordCtx(f), f.ctx.sender, "ion_sword", A));
  return f;
}

it("rolls new swords once, retaining even an empty roll through destruction and another drop", () => {
  const f = crystalFixture();
  Object.assign(f.ctx, { random: () => .9 });
  f.transaction(() => publishItemDrop(f.ctx, f.ctx.sender, "ion_sword", false));
  expect(swordSkillRollFor(swordCtx(f), f.ctx.sender, "ion_sword")).toEqual({ whirlwind: 0, deflect: 0, shockwave: 0 });
  Object.assign(f.ctx, { random: () => 0 });
  f.transaction(() => ensureSwordSkillRoll(swordCtx(f), f.ctx.sender, "ion_sword"));
  expect(swordSkillRollFor(swordCtx(f), f.ctx.sender, "ion_sword")).toEqual({ whirlwind: 0, deflect: 0, shockwave: 0 });
  expect(f.db.playerBowSkill.key.find(swordSkillKey(f.ctx.sender, "ion_sword"))).toBeNull();
});

it("carries the offered sword's roll through keeping, selecting and promoting its copy", () => {
  const f = swordsman();
  Object.assign(f.ctx, { random: () => .1 });
  f.transaction(() => offerDuplicateEquipment(f.ctx, f.ctx.sender, "ion_sword"));
  const [offer] = [...f.db.pendingEquipmentOffer.iter()];
  expect(offer.whirlwind).toBeGreaterThan(0);
  f.db.pendingEquipmentOffer.id.update({ ...offer, ...weaponSkillColumns(B) });
  f.run(server.resolveEquipmentOffer, { id: offer.id, keep: true });
  const [copy] = [...f.db.playerEquipmentCopy.iter()];
  expect(copy).toMatchObject(B);
  f.run(server.selectEquipmentCopy, { copyId: copy.id });
  expect(swordSkillRollFor(swordCtx(f), f.ctx.sender, "ion_sword")).toEqual(B);
  expect(f.db.playerEquipmentCopy.id.find(copy.id)).toMatchObject(A);
  f.run(server.destroyEquipmentCopy, { itemId: "ion_sword", copyId: 0n });
  expect(swordSkillRollFor(swordCtx(f), f.ctx.sender, "ion_sword")).toEqual(A);
  expect([...f.db.playerEquipmentCopy.iter()]).toHaveLength(0);
});

it("raises a sword's skills in place, locked or not, and never lowers one", () => {
  const f = swordsman();
  Object.assign(f.ctx, { random: () => .1 });
  f.transaction(() => publishItemDrop(f.ctx, f.ctx.sender, "ion_sword", true));
  expect(swordSkillRollFor(swordCtx(f), f.ctx.sender, "ion_sword").shockwave).toBeGreaterThan(0);
  f.run(server.setEquipmentLocked, { itemId: "ion_sword", copyId: 0n, locked: true });
  const weak = { whirlwind: .1, deflect: 0, shockwave: 0 };
  f.transaction(() => setSwordSkillRoll(swordCtx(f), f.ctx.sender, "ion_sword", weak));
  f.transaction(() => publishItemDrop(f.ctx, f.ctx.sender, "ion_sword", true));
  expect(swordSkillRollFor(swordCtx(f), f.ctx.sender, "ion_sword").deflect).toBeGreaterThan(0);
  // A high Whirlwind stays; the drop's Deflect and Shockwave are added beside it.
  const strong = { whirlwind: 50, deflect: 0, shockwave: 0 };
  f.transaction(() => setSwordSkillRoll(swordCtx(f), f.ctx.sender, "ion_sword", strong));
  f.transaction(() => publishItemDrop(f.ctx, f.ctx.sender, "ion_sword", true));
  const merged = swordSkillRollFor(swordCtx(f), f.ctx.sender, "ion_sword");
  expect(merged.whirlwind).toBe(50);
  expect(merged.deflect > 0 && merged.shockwave > 0).toBe(true);
});

it("keeps rolls private, moves a guest's roll to the account, and erases it with that account", () => {
  const f = swordsman(), guest = identity("3");
  f.transaction(() => setSwordSkillRoll(swordCtx(f), guest, "iron_sword", B));
  expect((server.mySwordSkills as any)(f.ctx).map((row: any) => row.itemId)).toEqual(["ion_sword"]);
  f.transaction(() => mergeSwordSkills(swordCtx(f), guest, f.ctx.sender));
  expect(swordSkillRollFor(swordCtx(f), f.ctx.sender, "iron_sword")).toEqual(B);
  expect([...f.db.playerSwordSkill.identity.filter(guest)]).toHaveLength(0);
  f.transaction(() => eraseIdentityRows(f.ctx, [f.ctx.sender]));
  expect([...f.db.playerSwordSkill.iter()]).toHaveLength(0);
});


it("freezes sword rolls for a duel and keeps that same snapshot through its replay", () => {
  const f = swordsman(), opponent = identity("b");
  f.patch("playerProgress", { damage: 10, maxHp: 10000 });
  f.progress(opponent, { inventoryJson: '["starter_bow"]', equippedRightHand: "starter_bow", damage: 10, maxHp: 10000 });
  f.seed("playerProfile", { identity: opponent, displayName: "Opponent" });
  f.seed("player", { ...f.db.player.identity.find(f.ctx.sender), identity: opponent });
  f.transaction(() => setSwordSkillRoll(swordCtx(f), f.ctx.sender, "ion_sword", { whirlwind: 100, deflect: 100, shockwave: 100 }));
  f.run(server.requestDuel, { opponent });
  const duel = [...f.db.duel.iter()][0], frozen = f.db.duelCombatSnapshot.duelId.find(duel.id);
  expect(frozen).toMatchObject({ challengerWhirlwind: 100, challengerDeflect: 100, challengerShockwave: 100, opponentWhirlwind: 0 });
  f.transaction(() => setSwordSkillRoll(swordCtx(f), f.ctx.sender, "ion_sword", A));
  f.ctx.timestamp = new Timestamp(duel.endsAtMicros + 1_000_000n); f.run(server.pulseDuel);
  const finishing = f.db.duel.id.find(duel.id);
  const predicted = advanceDuelCombat({ ...duel, ...frozen }, initialDuelCombatState(duel), 0,
    Number(finishing.lastResolvedAt.microsSinceUnixEpoch - duel.startsAtMicros));
  expect(finishing.opponentHp).toBeCloseTo(predicted.opponentHp, 4);
  expect(finishing.challengerDamageDealt).toBeCloseTo(predicted.challengerDamageDealt, 4);
  f.ctx.timestamp = new Timestamp(finishing.endsAtMicros); f.run(server.pulseDuel);
  expect(f.db.duelCombatSnapshot.duelId.find(duel.id)).toEqual(frozen);
  expect(f.db.duelReplay.id.find(duel.id)).toBeTruthy();
});

it("allows sword reach and bounds Deflect independently of damage taken, including Reflect Only", () => {
  const f = swordsman();
  f.patch("playerProgress", { damage: 0, maxHp: 100, regen: 0, armor: 0, equippedHead: "", equippedChest: "" });
  // A fresh report each time: rows are seeded here without the reducers that would bump the combat profile stamp.
  const bound = () => createCombatReport({ attackIntervalForProgress: progress => progress.attackRate,
    itemUpgradeLevelFor: () => 0, inventoryForProgress: progress => JSON.parse(progress.inventoryJson),
    equippedRightHandForProgress: progress => progress.equippedRightHand, equippedLeftHandForProgress: progress => progress.equippedLeftHand,
    equippedHeadForProgress: progress => progress.equippedHead, equippedChestForProgress: progress => progress.equippedChest })
    .combatBoundForReport(f.ctx as any).preview({ type: "damage", amount: 0, count: 0 });
  f.transaction(() => setSwordSkillRoll(swordCtx(f), f.ctx.sender, "ion_sword", {}));
  const plain = bound();
  f.transaction(() => setSwordSkillRoll(swordCtx(f), f.ctx.sender, "ion_sword", { whirlwind: 10, shockwave: 10, deflect: 10 }));
  const skilled = bound();
  expect(skilled.reach).toBeCloseTo(plain.reach! * 3.2);
  expect(plain.reflectDps).toBe(0); expect(skilled.reflectDps).toBeCloseTo(1000);
  f.seed("playerPrestigeChallenge", { identity: f.ctx.sender, active: true });
  const challenge = bound();
  expect(challenge.dps).toBeGreaterThan(0); expect(challenge.reflectDps).toBe(0);
});
