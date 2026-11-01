import { equipmentLocked, moveEquipmentLock, swapEquipmentLocks } from "./equipment-locks";
import { SenderError, table, t } from "spacetimedb/server";
import { Timestamp, type Identity } from "spacetimedb";
import { isSkillBow } from "../../shared/bow-skills";
import { isSkillSword } from "../../shared/sword-skills";
import { isSkillStaff } from "../../shared/staff-skills";
import { isSkillWeapon, mergeSkillRolls, rollWeaponSkills, weaponSkillColumns, weaponSkillRollOf, type WeaponSkillRoll } from "../../shared/weapon-skills";
import { canDestroyEquipment, canonicalItemId } from "../../shared/items";
import { salvageOre } from "../../shared/refine";
import { bagCapacityFor } from "./bag-capacity";
import {
  EQUIPMENT_OFFER_LIFETIME_MS, MAX_PENDING_EQUIPMENT_OFFERS, bagSlotsUsed, isDuplicateOfferItem,
} from "../../shared/equipment-copies";
import { bowSkillKey } from "./bow-skills";
import { setSwordSkillRoll, swordSkillKey } from "./sword-skills";
import {
  forgetStaffCopyRoll, forgetStaffOfferRoll, forgetStaffSkillRoll, moveStaffRowRoll, setStaffCopyRoll, setStaffOfferRoll,
  setStaffSkillRoll, staffCopyKey, staffCopyRoll, staffOfferKey, staffOfferRoll,
} from "./staff-skills";
import { ensureWeaponSkillRoll, weaponSkillRollFor } from "./weapon-skills";
import { addOres, oreKindsHeldFor, promoteCopyRefine, refineLevelFor, setRefineLevel, swapFirstCopyRefine } from "./item-refine";
import { readPlayerProgress } from "./wide-stats";
import { syncWornSkill } from "./worn-skill";
import { luckInPlay } from "./luck-research";
import { daggerSkillKey, setDaggerSkillRoll } from "./dagger-skills";
import { isSkillDagger } from "../../shared/dagger-skills";

/**
 * Copies of an item beyond the first, one row per copy a player chose to keep.
 *
 * The first copy is the item id in inventoryJson, with its roll in
 * player_bow_skill, player_sword_skill or player_staff_skill. It is always the copy an equipment slot holds: equipping
 * another copy swaps the two rolls (see select below), so kill validation,
 * duels and the client's combat keep reading the equipped weapon's roll by item
 * id, and inventoryJson, the equipment fields and every catalog lookup hold
 * only the first copy. Older clients see one copy of each item. Other gear stores zero skill chances.
 *
 * Private, read through the caller-scoped my_equipment_copies view. New
 * tables rather than columns: a column on a table every session reads would
 * strand every open tab on publish.
 */
export const playerEquipmentCopy = table({ name: "player_equipment_copy", public: false }, {
  id: t.u64().primaryKey().autoInc(),
  identity: t.identity().index("btree"),
  itemId: t.string(),
  arrowStorm: t.f32(),
  ricochet: t.f32(),
  piercingShot: t.f32(),
  acquiredAt: t.timestamp(),
  whirlwind: t.f32().default(0), deflect: t.f32().default(0), shockwave: t.f32().default(0),
  backstab: t.f32().default(0), poison: t.f32().default(0), dodge: t.f32().default(0),
});

/**
 * Every item a player has ever had drop, for the Gear Collection in the map window: one row per item, kept for
 * good. Gear in the bag counts too, row or not, read on the client.
 */
export const playerItemCollection = table({ name: "player_item_collection", public: false }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  itemId: t.string(),
});

/** Marks an item collected, once. */
export function collectItem(ctx: Ctx, identity: Identity, itemId: string) {
  const canonical = canonicalItemId(itemId);
  if (!canonical) return;
  const key = `${identity.toHexString()}:${canonical}`;
  if (!ctx.db.playerItemCollection.key.find(key)) ctx.db.playerItemCollection.insert({ key, identity, itemId: canonical });
}

/** Prestige keeps the collection; Reset Save and account deletion take it (removeEquipmentCopies). A guest's joins the account's. */
export function mergeItemCollection(ctx: Ctx, guest: Identity, account: Identity) {
  for (const row of [...ctx.db.playerItemCollection.identity.filter(guest)] as any[]) {
    ctx.db.playerItemCollection.key.delete(row.key);
    collectItem(ctx, account, row.itemId);
  }
}

/**
 * A drop of equipment the player already had, waiting for Keep or Ignore.
 * The new copy's roll is made when the offer is, with the same rules as any
 * new weapon, so the player compares the real thing. Unanswered offers are
 * ignored by maintenance once expiresAt passes; at most
 * MAX_PENDING_EQUIPMENT_OFFERS wait per player.
 */
export const pendingEquipmentOffer = table({ name: "pending_equipment_offer", public: false }, {
  id: t.u64().primaryKey().autoInc(),
  identity: t.identity().index("btree"),
  itemId: t.string(),
  arrowStorm: t.f32(),
  ricochet: t.f32(),
  piercingShot: t.f32(),
  createdAt: t.timestamp(),
  expiresAt: t.timestamp(),
  whirlwind: t.f32().default(0), deflect: t.f32().default(0), shockwave: t.f32().default(0),
  backstab: t.f32().default(0), poison: t.f32().default(0), dodge: t.f32().default(0),
});

type Ctx = any;

const sameIdentity = (a: Identity, b: Identity) => a.toHexString() === b.toHexString();
const byId = (a: { id: bigint }, b: { id: bigint }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A kept copy's or an offer's roll: a staff's from player_staff_skill, any other from its own columns. */
export const copyRollOf = (ctx: Ctx, copy: any): WeaponSkillRoll => isSkillStaff(copy.itemId) ? staffCopyRoll(ctx, copy.id) : weaponSkillRollOf(copy);
const offerRollOf = (ctx: Ctx, offer: any): WeaponSkillRoll => isSkillStaff(offer.itemId) ? staffOfferRoll(ctx, offer.id) : weaponSkillRollOf(offer);
export function deleteOffer(ctx: Ctx, offer: any) {
  ctx.db.pendingEquipmentOffer.id.delete(offer.id);
  if (isSkillStaff(offer.itemId)) forgetStaffOfferRoll(ctx, offer.id);
}
export function deleteCopy(ctx: Ctx, copy: any) {
  ctx.db.playerEquipmentCopy.id.delete(copy.id);
  if (isSkillStaff(copy.itemId)) forgetStaffCopyRoll(ctx, copy.id);
}

/** A player's kept extra copies, oldest first, optionally of one item. */
export function extraCopiesOf(ctx: Ctx, identity: Identity, itemId?: string): any[] {
  const rows = [...ctx.db.playerEquipmentCopy.identity.filter(identity)] as any[];
  return (itemId ? rows.filter(row => row.itemId === itemId) : rows).sort(byId);
}

function pendingOffersOf(ctx: Ctx, identity: Identity): any[] {
  return ([...ctx.db.pendingEquipmentOffer.identity.filter(identity)] as any[]).sort(byId);
}

/** Past the cap, the oldest offers are ignored for the player. */
function trimOffers(ctx: Ctx, identity: Identity) {
  const offers = pendingOffersOf(ctx, identity);
  for (const offer of offers.slice(0, Math.max(0, offers.length - MAX_PENDING_EQUIPMENT_OFFERS))) deleteOffer(ctx, offer);
}

/** One copy with this roll, waiting for Keep or Ignore. The caller trims the offers. */
function insertOffer(ctx: Ctx, identity: Identity, itemId: string, roll: WeaponSkillRoll) {
  const expiresAt = new Timestamp(ctx.timestamp.microsSinceUnixEpoch + BigInt(EQUIPMENT_OFFER_LIFETIME_MS) * 1_000n);
  const offer = ctx.db.pendingEquipmentOffer.insert({ id: 0n, identity, itemId, ...weaponSkillColumns(roll), createdAt: ctx.timestamp, expiresAt });
  setStaffOfferRoll(ctx, identity, itemId, offer.id, roll);
}

/** Offers `count` copies of an item the player already holds. Anything that is not equipment is dropped. */
export function offerDuplicateEquipment(ctx: Ctx, identity: Identity, itemId: string, count = 1, skillLuck = 0) {
  const canonical = canonicalItemId(itemId);
  if (!canonical || !isDuplicateOfferItem(canonical)) return;
  const offers = Math.min(MAX_PENDING_EQUIPMENT_OFFERS, Math.max(0, Math.floor(count)));
  if (!offers) return;
  for (let offer = 0; offer < offers; offer += 1) insertOffer(ctx, identity, canonical, rollWeaponSkills(canonical, () => ctx.random(), skillLuck));
  trimOffers(ctx, identity);
}

/** A dropped weapon's Skill Luck rank; read only for a skill weapon. */
const dropSkillLuck = (ctx: Ctx, identity: Identity, itemId: string) => isSkillWeapon(itemId) ? luckInPlay(ctx, identity).skillLuck : 0;

/** A new item that found the bag full. Each weapon roll differs, so each waits; other gear waits once. */
export function offerItemForFullBag(ctx: Ctx, identity: Identity, itemId: string, count = 1) {
  collectItem(ctx, identity, itemId);
  if (isSkillWeapon(itemId)) { offerDuplicateEquipment(ctx, identity, itemId, count, dropSkillLuck(ctx, identity, itemId)); return; }
  if (!pendingOffersOf(ctx, identity).some(offer => offer.itemId === itemId)) offerDuplicateEquipment(ctx, identity, itemId, 1);
}

/**
 * Duplicates from loot, settled on the spot: no offer, no spare copy. Each copy of a skill weapon rolls like
 * any new one and merges into the first copy's roll (mergeSkillRolls): each skill keeps the higher of the two,
 * so a skill never goes down. The weapon keeps
 * its refine, cards, slots and lock. Gifts and mail do not come through here and always offer.
 */
export function receiveDuplicateEquipment(ctx: Ctx, identity: Identity, itemId: string, count = 1, skillLuck = 0) {
  const canonical = canonicalItemId(itemId);
  if (!canonical || !isDuplicateOfferItem(canonical) || !isSkillWeapon(canonical)) return;
  const copies = Math.min(MAX_PENDING_EQUIPMENT_OFFERS, Math.max(0, Math.floor(count)));
  for (let copy = 0; copy < copies; copy += 1) {
    const roll = rollWeaponSkills(canonical, () => ctx.random(), skillLuck);
    const merged = mergeSkillRolls(canonical, weaponSkillRollFor(ctx, identity, canonical), roll);
    if (merged) setFirstCopyRoll(ctx, identity, canonical, merged);
  }
}

/** A new kept copy of an item already in the bag, with its own roll and refine: a craft of a piece held. */
export function insertKeptCopy(ctx: Ctx, identity: Identity, itemId: string, roll: WeaponSkillRoll, refine: number) {
  const copy = ctx.db.playerEquipmentCopy.insert({ id: 0n, identity, itemId, ...weaponSkillColumns(roll), acquiredAt: ctx.timestamp });
  setStaffCopyRoll(ctx, identity, itemId, copy.id, roll);
  setRefineLevel(ctx, identity, itemId, copy.id, refine);
  return copy;
}

/** A Reforge: `count` fresh rolls merged into one copy's skills, each keeping the higher. Copy 0 is the first copy. */
export function reforgeCopySkills(ctx: Ctx, identity: Identity, itemId: string, copyId: bigint, count: number, skillLuck: number) {
  const copy = copyId ? ctx.db.playerEquipmentCopy.id.find(copyId) : null;
  let roll: WeaponSkillRoll = copy ? copyRollOf(ctx, copy) : weaponSkillRollFor(ctx, identity, itemId);
  let changed = false;
  for (let draw = 0; draw < count; draw += 1) {
    const merged = mergeSkillRolls(itemId, roll, rollWeaponSkills(itemId, () => ctx.random(), skillLuck));
    if (merged) { roll = merged; changed = true; }
  }
  if (!changed) return;
  if (!copy) { setFirstCopyRoll(ctx, identity, itemId, roll); return; }
  ctx.db.playerEquipmentCopy.id.update({ ...copy, ...weaponSkillColumns(roll) });
  setStaffCopyRoll(ctx, identity, itemId, copy.id, roll);
}

/**
 * Announces a drop to its player. The first copy of an item enters the bag and
 * rolls; a drop of equipment already held, and every copy past the first in
 * one batch, can only raise the held weapon's skills (receiveDuplicateEquipment).
 */
export function publishItemDrop(ctx: Ctx, identity: Identity, itemId: string, alreadyOwned: boolean, quantity = 1) {
  collectItem(ctx, identity, itemId);
  const skillLuck = dropSkillLuck(ctx, identity, itemId);
  if (!alreadyOwned) ensureWeaponSkillRoll(ctx, identity, itemId, skillLuck);
  receiveDuplicateEquipment(ctx, identity, itemId, alreadyOwned ? quantity : quantity - 1, skillLuck);
  const key = `${identity.toHexString()}:${itemId}`;
  const current = ctx.db.playerItemDrop.key.find(key);
  const next = {
    key,
    identity,
    itemId,
    alreadyOwned,
    sequence: (current?.sequence ?? 0n) + BigInt(quantity),
    droppedAt: ctx.timestamp,
  };
  if (current) ctx.db.playerItemDrop.key.update(next);
  else ctx.db.playerItemDrop.insert(next);
}

/** Maintenance: every offer past its five minutes is ignored, whether or not its player is online. */
export function expireEquipmentOffers(ctx: Ctx) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const offer of [...ctx.db.pendingEquipmentOffer.iter()] as any[]) {
    if (offer.expiresAt.microsSinceUnixEpoch <= now) deleteOffer(ctx, offer);
  }
}

/** Wherever a player's gear goes (reset, deletion), their extra copies, pending offers and Gear Collection go with it. */
export function removeEquipmentCopies(ctx: Ctx, identity: Identity) {
  for (const row of extraCopiesOf(ctx, identity)) deleteCopy(ctx, row);
  for (const row of [...ctx.db.playerItemCollection.identity.filter(identity)] as any[]) ctx.db.playerItemCollection.key.delete(row.key);
  removeEquipmentOffers(ctx, identity);
}

/** Prestige keeps the bag and its kept copies; only the offers still waiting are cleared. */
export function removeEquipmentOffers(ctx: Ctx, identity: Identity) {
  for (const offer of pendingOffersOf(ctx, identity)) deleteOffer(ctx, offer);
}

/**
 * A guest's save replaces the account's on link, bag included, so the guest's
 * extra copies replace the account's. Pending offers from both carry on under
 * the account, still bounded by the cap.
 */
export function mergeEquipmentCopies(ctx: Ctx, guest: Identity, account: Identity) {
  for (const row of extraCopiesOf(ctx, account)) deleteCopy(ctx, row);
  for (const row of extraCopiesOf(ctx, guest)) {
    ctx.db.playerEquipmentCopy.id.update({ ...row, identity: account });
    moveStaffRowRoll(ctx, staffCopyKey(row.id), account);
  }
  for (const offer of pendingOffersOf(ctx, guest)) {
    ctx.db.pendingEquipmentOffer.id.update({ ...offer, identity: account });
    moveStaffRowRoll(ctx, staffOfferKey(offer.id), account);
  }
  trimOffers(ctx, account);
}

/** Destroyed gear gives back one ore of its refine grade. */
function salvage(ctx: Ctx, itemId: string) {
  const ore = salvageOre(itemId);
  if (ore) addOres(ctx, ctx.sender, ore, 1);
}

/** Deletes the first copy's roll, bow, sword or staff. */
function forgetFirstCopyRoll(ctx: Ctx, identity: Identity, itemId: string) {
  if (isSkillStaff(itemId)) { forgetStaffSkillRoll(ctx, identity, itemId); return; }
  const bow = ctx.db.playerBowSkill.key.find(bowSkillKey(identity, itemId));
  if (bow) ctx.db.playerBowSkill.key.delete(bow.key);
  const sword = ctx.db.playerSwordSkill.key.find(swordSkillKey(identity, itemId));
  if (sword) ctx.db.playerSwordSkill.key.delete(sword.key);
  const dagger = ctx.db.playerDaggerSkill.key.find(daggerSkillKey(identity, itemId));
  if (dagger) ctx.db.playerDaggerSkill.key.delete(dagger.key);
}

/** Writes the first copy's roll. Anything that is not a skill weapon has none to write. */
export function setFirstCopyRoll(ctx: Ctx, identity: Identity, itemId: string, roll: WeaponSkillRoll) {
  writeFirstCopyRoll(ctx, identity, itemId, roll);
  // The weapon in hand shows its skills on the player's profile.
  syncWornSkill(ctx, identity);
}
function writeFirstCopyRoll(ctx: Ctx, identity: Identity, itemId: string, roll: WeaponSkillRoll) {
  if (isSkillSword(itemId)) { setSwordSkillRoll(ctx, identity, itemId, roll); return; }
  if (isSkillStaff(itemId)) { setStaffSkillRoll(ctx, identity, itemId, roll); return; }
  if (isSkillDagger(itemId)) { setDaggerSkillRoll(ctx, identity, itemId, roll); return; }
  if (!isSkillBow(itemId)) return;
  const { arrowStorm, ricochet, piercingShot } = weaponSkillColumns(roll);
  const row = { key: bowSkillKey(identity, itemId), identity, itemId, arrowStorm, ricochet, piercingShot };
  if (ctx.db.playerBowSkill.key.find(row.key)) ctx.db.playerBowSkill.key.update(row);
  else ctx.db.playerBowSkill.insert(row);
}

const equippedFields = (progress: any): string[] =>
  [progress.equippedHead, progress.equippedChest, progress.equippedFeet, progress.equippedRightHand, progress.equippedLeftHand];

/** Bag slots still free: the capacity bought less what bagSlotsUsed counts. */
export function freeBagSlots(ctx: Ctx, identity: Identity, progress: any, inventory: readonly string[]) {
  return bagCapacityFor(ctx, identity) - bagSlotsUsed(inventory, equippedFields(progress), extraCopiesOf(ctx, identity).length, oreKindsHeldFor(ctx, identity));
}

/** The reducer bodies, wired to the entry module's progress helpers. */
export function createEquipmentCopies(deps: {
  requireControllingPlayer: (ctx: Ctx) => unknown;
  activeDuelFor: (ctx: Ctx, identity: Identity) => unknown;
  inventoryForProgress: (progress: any) => string[];
  restoreItemToProgress: (progress: any, itemId: string) => any;
  removeItemFromProgress: (progress: any, itemId: string) => any;
  writeProgressAndPresentation: (ctx: Ctx, progress: any) => void;
}) {
  function ownedProgress(ctx: Ctx, itemId: string) {
    const progress = readPlayerProgress(ctx, ctx.sender);
    if (!progress || !deps.inventoryForProgress(progress).includes(itemId)) throw new SenderError("That item is not in your inventory.");
    return progress;
  }

  function ownCopy(ctx: Ctx, copyId: bigint) {
    const copy = ctx.db.playerEquipmentCopy.id.find(copyId);
    if (!copy || !sameIdentity(copy.identity, ctx.sender)) throw new SenderError("That copy is not in your inventory.");
    return copy;
  }

  /**
   * Keep adds the offered copy to the bag, with its roll, when a slot is free;
   * a full bag refuses and leaves the offer waiting. Ignore throws it away.
   * Answering an offer that is already gone does nothing, so a double tap or
   * a race with the expiry sweep is harmless.
   */
  function resolveOffer(ctx: Ctx, { id, keep }: { id: bigint; keep: boolean }) {
    deps.requireControllingPlayer(ctx);
    const offer = ctx.db.pendingEquipmentOffer.id.find(id);
    if (!offer || !sameIdentity(offer.identity, ctx.sender)) return;
    if (!keep) {
      deleteOffer(ctx, offer);
      return;
    }
    if (offer.expiresAt.microsSinceUnixEpoch <= ctx.timestamp.microsSinceUnixEpoch) {
      throw new SenderError("That item ran out of time and was ignored.");
    }
    const progress = readPlayerProgress(ctx, ctx.sender);
    if (!progress) throw new SenderError("Player unavailable.");
    const inventory = deps.inventoryForProgress(progress);
    if (freeBagSlots(ctx, ctx.sender, progress, inventory) <= 0) throw new SenderError("Your bag is full. Free a slot to keep it.");
    const roll = offerRollOf(ctx, offer);
    if (inventory.includes(offer.itemId)) {
      const copy = ctx.db.playerEquipmentCopy.insert({ id: 0n, identity: ctx.sender, itemId: offer.itemId, ...weaponSkillColumns(roll), acquiredAt: ctx.timestamp });
      setStaffCopyRoll(ctx, ctx.sender, offer.itemId, copy.id, roll);
    } else {
      // Not held (a drop into a full bag, or the copy they had is gone): this one becomes the first, unrefined.
      deps.writeProgressAndPresentation(ctx, deps.restoreItemToProgress(progress, offer.itemId));
      setFirstCopyRoll(ctx, ctx.sender, offer.itemId, roll);
      setRefineLevel(ctx, ctx.sender, offer.itemId, 0n, 0);
    }
    deleteOffer(ctx, offer);
  }

  /**
   * Destroys one copy. `copyId` 0 is the first copy, the one in inventoryJson,
   * and is what destroy_equipment destroys. When another copy is
   * kept, the oldest one takes the first copy's place, in its slot if it was
   * equipped, and the bag loses a copy rather than the item. The slot's tier
   * survives either way: it was never the item's to take away. A refine is the
   * copy's own: it goes with the copy destroyed, and the copy taking over brings
   * its own.
   */
  function destroy(ctx: Ctx, itemId: string, copyId: bigint) {
    deps.requireControllingPlayer(ctx);
    if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
    const canonical = canonicalItemId(itemId);
    if (!canonical || !canDestroyEquipment(canonical)) throw new SenderError("This item cannot be destroyed.");
    if (equipmentLocked(ctx, ctx.sender, canonical, copyId)) throw new SenderError("Unlock this equipment before deleting it.");
    removeCopy(ctx, canonical, copyId);
    salvage(ctx, canonical);
  }

  /** Takes one owned copy of `canonical` out of the bag as destroy describes, with nothing given back. */
  function removeCopy(ctx: Ctx, canonical: string, copyId: bigint) {
    const progress = ownedProgress(ctx, canonical);
    if (copyId !== 0n) {
      const copy = ownCopy(ctx, copyId);
      if (copy.itemId !== canonical) throw new SenderError("That copy is not in your inventory.");
      setRefineLevel(ctx, ctx.sender, canonical, copy.id, 0);
      deleteCopy(ctx, copy);
      return;
    }
    const [replacement] = extraCopiesOf(ctx, ctx.sender, canonical);
    if (replacement) {
      moveEquipmentLock(ctx, ctx.sender, canonical, replacement.id, 0n);
      setFirstCopyRoll(ctx, ctx.sender, canonical, copyRollOf(ctx, replacement));
      promoteCopyRefine(ctx, ctx.sender, canonical, replacement.id);
      deleteCopy(ctx, replacement);
      // The worn item may have changed level: its power follows.
      deps.writeProgressAndPresentation(ctx, progress);
      return;
    }
    setRefineLevel(ctx, ctx.sender, canonical, 0n, 0);
    const next = deps.removeItemFromProgress(progress, canonical);
    // The last one gone, its roll goes too: the next to drop rolls fresh instead of bringing this one back.
    if (!deps.inventoryForProgress(next).includes(canonical)) forgetFirstCopyRoll(ctx, ctx.sender, canonical);
    deps.writeProgressAndPresentation(ctx, next);
  }

  /**
   * Makes a kept copy the first copy, the one an equipment slot holds, by
   * swapping its roll and its refine with the first copy's. The client then
   * equips the item as usual. Copies of other items have no roll, but a refine
   * of their own still swaps.
   */
  function select(ctx: Ctx, copyId: bigint) {
    deps.requireControllingPlayer(ctx);
    if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
    const copy = ownCopy(ctx, copyId);
    const progress = ownedProgress(ctx, copy.itemId);
    swapEquipmentLocks(ctx, ctx.sender, copy.itemId, copy.id);
    const refineDiffers = refineLevelFor(ctx, ctx.sender, copy.itemId) !== refineLevelFor(ctx, ctx.sender, copy.itemId, copy.id);
    if (refineDiffers) {
      swapFirstCopyRefine(ctx, ctx.sender, copy.itemId, copy.id);
      deps.writeProgressAndPresentation(ctx, progress);
    }
    if (!isSkillWeapon(copy.itemId)) return;
    const first = weaponSkillRollFor(ctx, ctx.sender, copy.itemId);
    setFirstCopyRoll(ctx, ctx.sender, copy.itemId, copyRollOf(ctx, copy));
    ctx.db.playerEquipmentCopy.id.update({ ...copy, ...weaponSkillColumns(first) });
    setStaffCopyRoll(ctx, ctx.sender, copy.itemId, copy.id, first as WeaponSkillRoll);
  }

  return { resolveOffer, destroy, removeCopy, select };
}

/** The caller's Gear Collection. */
export function registerItemCollection(spacetimedb: any) {
  return spacetimedb.view({ name: "my_item_collection", public: true }, t.array(playerItemCollection.rowType),
    (ctx: any) => [...ctx.db.playerItemCollection.identity.filter(ctx.sender)]);
}
