import { SenderError, table, t } from "spacetimedb/server";
import { Timestamp, type Identity } from "spacetimedb";
import { NO_BOW_SKILLS, isSkillBow, rollBowSkills, type BowSkillRoll } from "../../shared/bow-skills";
import { canDestroyEquipment, canonicalItemId } from "../../shared/items";
import { inventorySlotCapacity } from "../../shared/gems";
import {
  EQUIPMENT_OFFER_LIFETIME_MS, MAX_PENDING_EQUIPMENT_OFFERS, bagSlotsUsed, isDuplicateOfferItem,
} from "../../shared/equipment-copies";
import { bowSkillKey, bowSkillRollFor, ensureBowSkillRoll } from "./bow-skills";
import { isDropIgnored } from "./ignored-drops";

/**
 * Copies of an item beyond the first, one row per copy a player chose to keep.
 *
 * The first copy is the item id in inventoryJson, with its roll in
 * player_bow_skill. It is always the copy an equipment slot holds: equipping
 * another copy swaps the two rolls (see select below), so kill validation,
 * duels and the client's combat keep reading the equipped bow's roll by item
 * id, and inventoryJson, the equipment fields and every catalog lookup stay as
 * they were. Old clients see one copy of each item and nothing else changes
 * for them. Non-bows store zeros: their copies are identical.
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
});

/**
 * A drop of equipment the player already had, waiting for Keep or Ignore.
 * The new copy's roll is made when the offer is, with the same rules as any
 * new bow, so the player compares the real thing. Unanswered offers are
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
});

type Ctx = any;

const sameIdentity = (a: Identity, b: Identity) => a.toHexString() === b.toHexString();
const byId = (a: { id: bigint }, b: { id: bigint }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function rollOf(row: any): BowSkillRoll {
  return { arrowStorm: row.arrowStorm, ricochet: row.ricochet, piercingShot: row.piercingShot };
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
  for (const offer of offers.slice(0, Math.max(0, offers.length - MAX_PENDING_EQUIPMENT_OFFERS))) {
    ctx.db.pendingEquipmentOffer.id.delete(offer.id);
  }
}

/** Offers `count` copies of an item the player already holds. Anything that is not equipment is dropped as before. */
export function offerDuplicateEquipment(ctx: Ctx, identity: Identity, itemId: string, count = 1) {
  const canonical = canonicalItemId(itemId);
  if (!canonical || !isDuplicateOfferItem(canonical)) return;
  const offers = Math.min(MAX_PENDING_EQUIPMENT_OFFERS, Math.max(0, Math.floor(count)));
  if (!offers) return;
  const expiresAt = new Timestamp(ctx.timestamp.microsSinceUnixEpoch + BigInt(EQUIPMENT_OFFER_LIFETIME_MS) * 1_000n);
  for (let offer = 0; offer < offers; offer += 1) {
    const roll = rollBowSkills(canonical, () => ctx.random()) ?? NO_BOW_SKILLS;
    ctx.db.pendingEquipmentOffer.insert({ id: 0n, identity, itemId: canonical, ...roll, createdAt: ctx.timestamp, expiresAt });
  }
  trimOffers(ctx, identity);
}

/**
 * Announces a drop to its player. The first copy of an item enters the bag and
 * rolls; a drop of equipment already held, and every copy past the first in
 * one batch, becomes a Keep/Ignore offer instead of being thrown away, unless
 * the player marked that item ignored on the map, when the copies are
 * answered Ignore on arrival. The first copy lands either way.
 */
export function publishItemDrop(ctx: Ctx, identity: Identity, itemId: string, alreadyOwned: boolean, quantity = 1) {
  if (!alreadyOwned) ensureBowSkillRoll(ctx, identity, itemId); // Only a bow entering the bag rolls.
  const copies = alreadyOwned ? quantity : quantity - 1;
  if (copies > 0 && !isDropIgnored(ctx, identity, itemId)) offerDuplicateEquipment(ctx, identity, itemId, copies);
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
    if (offer.expiresAt.microsSinceUnixEpoch <= now) ctx.db.pendingEquipmentOffer.id.delete(offer.id);
  }
}

/** Wherever a player's gear goes (prestige, reset, deletion), their extra copies and pending offers go with it. */
export function removeEquipmentCopies(ctx: Ctx, identity: Identity) {
  for (const row of extraCopiesOf(ctx, identity)) ctx.db.playerEquipmentCopy.id.delete(row.id);
  for (const offer of pendingOffersOf(ctx, identity)) ctx.db.pendingEquipmentOffer.id.delete(offer.id);
}

/**
 * A guest's save replaces the account's on link, bag included, so the guest's
 * extra copies replace the account's. Pending offers from both carry on under
 * the account, still bounded by the cap.
 */
export function mergeEquipmentCopies(ctx: Ctx, guest: Identity, account: Identity) {
  for (const row of extraCopiesOf(ctx, account)) ctx.db.playerEquipmentCopy.id.delete(row.id);
  for (const row of extraCopiesOf(ctx, guest)) ctx.db.playerEquipmentCopy.id.update({ ...row, identity: account });
  for (const offer of pendingOffersOf(ctx, guest)) ctx.db.pendingEquipmentOffer.id.update({ ...offer, identity: account });
  trimOffers(ctx, account);
}

/** Writes the first copy's roll. Anything that is not a skill bow has none to write. */
function setFirstCopyRoll(ctx: Ctx, identity: Identity, itemId: string, roll: BowSkillRoll) {
  if (!isSkillBow(itemId)) return;
  const row = { key: bowSkillKey(identity, itemId), identity, itemId, ...roll };
  if (ctx.db.playerBowSkill.key.find(row.key)) ctx.db.playerBowSkill.key.update(row);
  else ctx.db.playerBowSkill.insert(row);
}

const equippedFields = (progress: any): string[] =>
  [progress.equippedHead, progress.equippedChest, progress.equippedFeet, progress.equippedRightHand, progress.equippedLeftHand];

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
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
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
      ctx.db.pendingEquipmentOffer.id.delete(offer.id);
      return;
    }
    if (offer.expiresAt.microsSinceUnixEpoch <= ctx.timestamp.microsSinceUnixEpoch) {
      throw new SenderError("That item ran out of time and was ignored.");
    }
    const progress = ctx.db.playerProgress.identity.find(ctx.sender);
    if (!progress) throw new SenderError("Player unavailable.");
    const inventory = deps.inventoryForProgress(progress);
    const capacity = inventorySlotCapacity(ctx.db.playerInventoryCapacity.identity.find(ctx.sender)?.slotsUnlocked ?? 0);
    if (bagSlotsUsed(inventory, equippedFields(progress), extraCopiesOf(ctx, ctx.sender).length) >= capacity) {
      throw new SenderError("Your bag is full. Free a slot to keep it.");
    }
    const roll = rollOf(offer);
    if (inventory.includes(offer.itemId)) {
      ctx.db.playerEquipmentCopy.insert({ id: 0n, identity: ctx.sender, itemId: offer.itemId, ...roll, acquiredAt: ctx.timestamp });
    } else {
      // The copy they had is gone since the offer was made: this one becomes the first.
      deps.writeProgressAndPresentation(ctx, deps.restoreItemToProgress(progress, offer.itemId));
      setFirstCopyRoll(ctx, ctx.sender, offer.itemId, roll);
    }
    ctx.db.pendingEquipmentOffer.id.delete(offer.id);
  }

  /**
   * Destroys one copy. `copyId` 0 is the first copy, the one in inventoryJson,
   * and is what destroy_equipment has always destroyed. When another copy is
   * kept, the oldest one takes the first copy's place, in its slot if it was
   * equipped, and the bag loses a copy rather than the item. The slot's tier
   * survives either way: it was never the item's to take away.
   */
  function destroy(ctx: Ctx, itemId: string, copyId: bigint) {
    deps.requireControllingPlayer(ctx);
    if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
    const canonical = canonicalItemId(itemId);
    if (!canonical || !canDestroyEquipment(canonical)) throw new SenderError("This item cannot be destroyed.");
    const progress = ownedProgress(ctx, canonical);
    if (copyId !== 0n) {
      const copy = ownCopy(ctx, copyId);
      if (copy.itemId !== canonical) throw new SenderError("That copy is not in your inventory.");
      ctx.db.playerEquipmentCopy.id.delete(copy.id);
      return;
    }
    const [replacement] = extraCopiesOf(ctx, ctx.sender, canonical);
    if (replacement) {
      setFirstCopyRoll(ctx, ctx.sender, canonical, rollOf(replacement));
      ctx.db.playerEquipmentCopy.id.delete(replacement.id);
      return;
    }
    deps.writeProgressAndPresentation(ctx, deps.removeItemFromProgress(progress, canonical));
  }

  /**
   * Makes a kept copy the first copy, the one an equipment slot holds, by
   * swapping its roll with the first copy's. The client then equips the item
   * as usual. Copies without a roll are identical, so there is nothing to swap.
   */
  function select(ctx: Ctx, copyId: bigint) {
    deps.requireControllingPlayer(ctx);
    if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
    const copy = ownCopy(ctx, copyId);
    ownedProgress(ctx, copy.itemId);
    if (!isSkillBow(copy.itemId)) return;
    const first = bowSkillRollFor(ctx, ctx.sender, copy.itemId);
    setFirstCopyRoll(ctx, ctx.sender, copy.itemId, rollOf(copy));
    ctx.db.playerEquipmentCopy.id.update({ ...copy, ...rollOf(first) });
  }

  return { resolveOffer, destroy, select };
}
