import { advanceDuelCombat, initialDuelCombatState } from "../../shared/duel-combat";
import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { HIDDEN_COSMETIC_ITEM_ID } from "../../shared/equipment-appearance";
import { duelPositionsAt } from "../../shared/duel-approach";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it.each(["starter_bow", "wooden_sword"])("freezes the actual %s separately from hidden cosmetics through the saved replay", weapon => {
  const f = crystalFixture(), opponent = identity("b");
  f.patch("playerProgress", { inventoryJson: JSON.stringify([weapon]), equippedRightHand: weapon,
    cosmeticRightHand: HIDDEN_COSMETIC_ITEM_ID, damage: 10, maxHp: 10000 });
  f.progress(opponent, { inventoryJson: '["starter_bow"]', equippedRightHand: "starter_bow", damage: 10, maxHp: 10000 });
  f.seed("playerProfile", { identity: opponent, displayName: "Opponent" });
  f.seed("player", { ...f.db.player.identity.find(f.ctx.sender), identity: opponent });
  f.run(server.requestDuel, { opponent });
  const duel = [...f.db.duel.iter()][0];
  expect(duel).toMatchObject({ challengerWeaponItem: weapon, challengerRightHandItem: "", challengerLeftHandItem: "", challengerAttackRate: 1 });
  expect(duelPositionsAt(duel, 1).challengerMoving).toBe(weapon === "wooden_sword");
  f.ctx.timestamp = new Timestamp(duel.endsAtMicros + 1_000_000n); f.run(server.pulseDuel);
  const finishing = f.db.duel.id.find(duel.id);
  expect(finishing.challengerAttacks).toBeGreaterThan(0);
  expect(finishing.challengerDamageDealt).toBeGreaterThan(0);
  f.ctx.timestamp = new Timestamp(finishing.endsAtMicros); f.run(server.pulseDuel);
  expect(f.db.duelReplay.id.find(duel.id)).toMatchObject({ challengerWeaponItem: weapon, challengerRightHandItem: "" });
});

it("freezes bow skill rolls for combat and retains them for replay after equipment changes", () => {
  const f = crystalFixture(), opponent = identity("b"), who = f.ctx.sender;
  f.patch("playerProgress", { inventoryJson: '["starter_bow"]', equippedRightHand: "starter_bow", damage: 10, maxHp: 10000 });
  f.progress(opponent, { inventoryJson: '["starter_bow"]', equippedRightHand: "starter_bow", damage: 10, maxHp: 10000 });
  f.seed("playerProfile", { identity: opponent, displayName: "Opponent" });
  f.seed("player", { ...f.db.player.identity.find(who), identity: opponent });
  const key = `${who.toHexString()}:starter_bow`;
  f.seed("playerBowSkill", { key, identity: who, itemId: "starter_bow", arrowStorm: 100, ricochet: 100, piercingShot: 100 });
  f.run(server.requestDuel, { opponent });
  const duel = [...f.db.duel.iter()][0];
  const frozen = f.db.duelCombatSnapshot.duelId.find(duel.id);
  expect(frozen).toMatchObject({ challengerArrowStorm: 100, challengerRicochet: 100, challengerPiercingShot: 100 });
  f.db.playerBowSkill.key.update({ ...f.db.playerBowSkill.key.find(key), arrowStorm: 0 });
  f.ctx.timestamp = new Timestamp(duel.endsAtMicros + 1_000_000n); f.run(server.pulseDuel);
  const finishing = f.db.duel.id.find(duel.id);
  const predicted = advanceDuelCombat({ ...duel, ...frozen }, initialDuelCombatState(duel), 0, Number(finishing.lastResolvedAt.microsSinceUnixEpoch - duel.startsAtMicros));
  expect(finishing.opponentHp).toBeCloseTo(predicted.opponentHp, 4);
  expect(finishing.challengerDamageDealt).toBeCloseTo(predicted.challengerDamageDealt, 4);
  f.ctx.timestamp = new Timestamp(finishing.endsAtMicros); f.run(server.pulseDuel);
  expect(f.db.duelCombatSnapshot.duelId.find(duel.id)).toEqual(frozen);
  expect(f.db.duelReplay.id.find(duel.id)).toBeTruthy();
});
