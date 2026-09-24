import { describe, expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { deliverEquipmentMail, equipmentMailKey } from "./mailbox-equipment";
import { publishMailboxLetter, mergeMailboxReceipts } from "./mailbox";
import { GEAR_MAIL_ID, GEAR_MAIL_TITLE, GEAR_MAIL_BODY } from "../../shared/mailbox-equipment";
import { EQUIPMENT_DROP_ITEM_IDS } from "../../shared/items";
import { BASE_INVENTORY_SLOT_CAPACITY } from "../../shared/gems";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
function fixture() {
  const f = crystalFixture();
  f.transaction(() => { deliverEquipmentMail(f.ctx as never, [f.ctx.sender]); publishMailboxLetter(f.ctx as never, { id: GEAR_MAIL_ID, title: GEAR_MAIL_TITLE, body: GEAR_MAIL_BODY, gems: 0n }); });
  return f;
}
describe("equipment mailbox", () => {
  it("freezes the highest map on delivery, excludes virtual/missing accounts and refuses unauthorized delivery", () => {
    const f = fixture(), bot = identity("2");
    expect(() => f.run(server.devDeliverEquipmentMail, { recipients: [f.ctx.sender] })).toThrow(/Developer/);
    f.progress(bot); f.seed("virtualPlayer", { identity: bot });
    f.patch("playerProgress", { ionCitadelUnlocked: true });
    f.transaction(() => deliverEquipmentMail(f.ctx as never, [f.ctx.sender, bot, identity("3")]));
    expect(f.db.mailboxEquipment.count()).toBe(1n);
    expect(server.myMailboxV2(f.ctx as never)[0]).toMatchObject({ itemIds: ["forest_cap", "wooden_armor", "starter_bow"], upgradeLevel: 9, claimed: false });
    expect(server.myMailboxV2({ ...f.ctx, sender: bot } as never)).toEqual([]);
  });
  it("claims once at +9, preserves +10, does not auto-equip, and cannot grant again after destroying gear", () => {
    const f = fixture();
    // Keyed by the slot the gift's items go in, not by the items.
    const key = `${f.ctx.sender.toHexString()}:HAND`;
    f.seed("playerItemUpgrade", { key, identity: f.ctx.sender, itemId: "starter_bow", level: 10 });
    f.run(server.claimMailboxGift, { id: GEAR_MAIL_ID });
    const progress = f.db.playerProgress.identity.find(f.ctx.sender);
    expect(JSON.parse(progress.inventoryJson)).toEqual(expect.arrayContaining(["forest_cap", "wooden_armor", "starter_bow"]));
    expect(progress.equippedRightHand).toBe("");
    // The gift raises the slots its items belong to: the weapon track keeps
    // the higher tier it already had, and the helmet track takes the gift's.
    expect(f.db.playerItemUpgrade.key.find(key).level).toBe(10);
    expect(f.db.playerItemUpgrade.key.find(`${f.ctx.sender.toHexString()}:HEAD`).level).toBe(9);
    expect(f.db.gemTransaction.count()).toBe(0n);
    f.patch("playerProgress", { inventoryJson: "[]", bowCount: 0, woodenArmorCount: 0 });
    f.run(server.claimMailboxGift, { id: GEAR_MAIL_ID });
    expect(f.db.playerProgress.identity.find(f.ctx.sender).inventoryJson).toBe("[]");
    expect(server.myMailboxV2(f.ctx as never)[0].claimed).toBe(true);
  });
  it("leaves a full-bag gift unclaimed and awards everything after the player frees space", () => {
    const f = fixture();
    const filler = EQUIPMENT_DROP_ITEM_IDS.filter(id => !["forest_cap", "wooden_armor", "starter_bow"].includes(id)).slice(0, BASE_INVENTORY_SLOT_CAPACITY);
    f.patch("playerProgress", { inventoryJson: JSON.stringify(filler) });
    const before = f.db.playerProgress.identity.find(f.ctx.sender);
    expect(() => f.run(server.claimMailboxGift, { id: GEAR_MAIL_ID })).toThrow(/Free .* inventory slot/);
    expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(before);
    expect(f.db.playerItemUpgrade.count()).toBe(0n);
    expect(server.myMailboxV2(f.ctx as never)[0].claimed).toBe(false);
    f.patch("playerProgress", { inventoryJson: "[]" });
    f.run(server.claimMailboxGift, { id: GEAR_MAIL_ID });
    expect(server.myMailboxV2(f.ctx as never)[0].claimed).toBe(true);
  });
  it("does not interfere with a running upgrade on gifted gear", () => {
    const f = fixture();
    f.seed("activeItemUpgrade", { identity: f.ctx.sender, itemId: "starter_bow", currentLevel: 8, targetLevel: 9 });
    expect(() => f.run(server.claimMailboxGift, { id: GEAR_MAIL_ID })).toThrow(/Finish or cancel/);
    expect(f.db.playerItemUpgrade.count()).toBe(0n);
    expect(server.myMailboxV2(f.ctx as never)[0].claimed).toBe(false);
  });
  it("carries guest mail and claim receipts into registration without a second gift", () => {
    const f = fixture(), account = identity("2");
    f.progress(account);
    f.run(server.claimMailboxGift, { id: GEAR_MAIL_ID });
    f.transaction(() => mergeMailboxReceipts(f.ctx as never, f.ctx.sender, account));
    expect(f.db.mailboxEquipment.key.find(equipmentMailKey(GEAR_MAIL_ID, f.ctx.sender))).toBeNull();
    expect(server.myMailboxV2({ ...f.ctx, sender: account } as never)[0]).toMatchObject({ claimed: true, upgradeLevel: 9 });
  });
});
