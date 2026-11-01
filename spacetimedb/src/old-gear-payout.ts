import { table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import { BLACK_BOOTS, canonicalItemId, itemDefinition } from "../../shared/items";
import { itemTier } from "../../shared/item-tier";
import { isGradeItemId } from "../../shared/grade-equipment";
import { oldTierSalePrice } from "../../shared/gear-grades";
import { fallbackWeapon, weaponKind } from "../../shared/equip-best";
import { isUpgradeSlot } from "../../shared/slot-upgrades";
import { inventoryForProgress } from "./progress-helpers";
import { readPlayerProgress, iterPlayerProgress } from "./wide-stats";
import { writeProgressAndPresentation } from "./player-power";
import { addGold } from "./gold";
import { grantMasteryPoints } from "./weapon-mastery";
import { masteryPointsForLevel, weaponSchool, type WeaponSchool } from "../../shared/weapon-mastery";
import { deleteCopy, deleteOffer, extraCopiesOf } from "./equipment-copies";
import { refineLevelFor } from "./item-refine";
import { activeItemUpgradeEntriesFor, deleteActiveItemUpgrade, normalizeUpgradeBenchSlot } from "./upgrade-bench-slots";
import { syncWornSkill } from "./worn-skill";
import { markLeaderboardDirty, requestLeaderboardRefresh } from "./leaderboard-refresh";

/**
 * What each player was paid when graded gear replaced the old map gear (migration 62): every old piece
 * wiped, with its refine, and the gold paid for it. Private, for support. Reset Save keeps it; deleting
 * the account erases it.
 */
export const oldGearPayout = table({ name: "old_gear_payout", public: false }, {
  identity: t.identity().primaryKey(),
  itemsJson: t.string(),
  gold: t.u64(),
  /** Mastery points paid for the old gear's refine stars, by school. */
  masteryJson: t.string(),
  at: t.timestamp(),
});

/** Each refine star on wiped old gear pays this much Mastery, at most REFINE_MASTERY_CAP for a player. */
export const REFINE_STAR_MASTERY_POINTS = 30;
export const REFINE_MASTERY_CAP = masteryPointsForLevel(8);

type Ctx = any;

/** Old campaign and map gear: an item with a map tier that is not graded. The starter stone stays. */
export function isOldMapGear(itemId: unknown): boolean {
  const id = canonicalItemId(itemId);
  // Black Boots stay: graded boots replace them gradually, not on the day.
  return Boolean(id && id !== BLACK_BOOTS && !isGradeItemId(id) && itemDefinition(id)?.acquisition !== "STARTER" && itemTier(id) !== undefined);
}

const WORN = ["equippedHead", "equippedChest", "equippedFeet", "equippedRightHand", "equippedLeftHand"] as const;
const SAVE_FIELDS = ["inventoryJson", "bowCount", "woodenArmorCount", ...WORN] as const;

/** A save without its old gear, and the distinct old ids its bag held. Worn slots holding one end empty. */
export function progressWithoutOldGear(progress: any): { progress: any; wiped: string[] } {
  const inventory = inventoryForProgress(progress);
  const wiped = [...new Set(inventory.filter(isOldMapGear))];
  if (!wiped.length && !WORN.some(field => isOldMapGear(progress[field]))) return { progress, wiped };
  const kept = [...new Set(inventory.filter(id => !isOldMapGear(id)))];
  const next = { ...progress, inventoryJson: JSON.stringify(kept), bowCount: 0, woodenArmorCount: 0 };
  for (const field of ["equippedHead", "equippedChest", "equippedFeet"] as const) if (isOldMapGear(next[field])) next[field] = "";
  const right = progress.equippedRightHand || "", left = progress.equippedLeftHand || "";
  if (isOldMapGear(right) || isOldMapGear(left)) {
    const keptRight = isOldMapGear(right) ? "" : right, keptLeft = isOldMapGear(left) ? "" : left;
    // The hand falls back as an empty one does: the best kept weapon of the same kind, else the stone.
    const kind = weaponKind(canonicalItemId(isOldMapGear(right) ? right : left));
    next.equippedRightHand = keptRight || (keptLeft ? "" : fallbackWeapon(kept, kind));
    next.equippedLeftHand = keptRight ? "" : keptLeft;
  }
  return { progress: next, wiped };
}

/** A stored save (progressJson) without its old gear, or null when it has none or does not parse. */
function savedRunWithoutOldGear(json: string, identity: Identity): { json: string; wiped: string[] } | null {
  let saved: any;
  try { saved = JSON.parse(json); } catch { return null; }
  if (!saved || typeof saved !== "object") return null;
  const before = { ...saved, identity };
  const { progress, wiped } = progressWithoutOldGear(before);
  if (progress === before) return null;
  const changed = Object.fromEntries(SAVE_FIELDS.map(field => [field, progress[field]]));
  return { json: JSON.stringify({ ...saved, ...changed }), wiped };
}

type Piece = { itemId: string; count: number; refines: number[]; from: Set<string> };

/**
 * Wipes every old piece the player holds, anywhere, and pays oldTierSalePrice for each. A first copy pays once
 * however many places name it (bag, worn, bench job, unclaimed mail or gift, a stored challenge run); each kept
 * copy and waiting offer pays on its own. The Endless rebase archive is cleared too but never restored by the
 * game, so what only it holds is recorded unpaid. Slot tiers stay; refines and skill rolls go with the items.
 */
export function payOutOldGear(ctx: Ctx, identity: Identity) {
  const hex = identity.toHexString();
  const firsts = new Map<string, Piece>(), extras = new Map<string, Piece>(), archived = new Set<string>();
  const note = (map: Map<string, Piece>, itemId: string, from: string, refine?: number) => {
    const piece = map.get(itemId) ?? { itemId, count: 0, refines: [], from: new Set<string>() };
    piece.from.add(from);
    if (refine !== undefined) { piece.count += 1; piece.refines.push(refine); }
    else if (!piece.count) piece.count = 1;
    map.set(itemId, piece);
  };
  const first = (itemId: string, from: string) => note(firsts, canonicalItemId(itemId) ?? itemId, from);

  const progress = readPlayerProgress(ctx, identity);
  const live = progress ? progressWithoutOldGear(progress) : null;
  const worn = new Set<string>(WORN.map(field => canonicalItemId(progress?.[field]) ?? ""));
  for (const itemId of live?.wiped ?? []) first(itemId, worn.has(itemId) ? "worn" : "bag");

  // Restorable runs bring their bag back (carryOwnership), so what they hold is owned and paid.
  for (const [handle, from] of [[ctx.db.prestigeChallengeBackup, "saved run"], [ctx.db.prestigeChallengeRun, "parked run"], [ctx.db.aggroChallengeRun, "parked aggro run"]] as const) {
    const row = handle?.identity.find(identity);
    const stripped = row && savedRunWithoutOldGear(row.progressJson, identity);
    if (!stripped) continue;
    handle.identity.update({ ...row, progressJson: stripped.json });
    for (const itemId of stripped.wiped) first(itemId, from);
  }
  const archive = ctx.db.playerEndlessRebaseBackup?.identity.find(identity);
  const strippedArchive = archive?.progressJson ? savedRunWithoutOldGear(archive.progressJson, identity) : null;
  if (strippedArchive) {
    ctx.db.playerEndlessRebaseBackup.identity.update({ ...archive, progressJson: strippedArchive.json });
    for (const itemId of strippedArchive.wiped) archived.add(itemId);
  }

  // A bench job from before slot tiers holds its item out of the bag: cancelled without handing it back.
  for (const { slot, active } of activeItemUpgradeEntriesFor(ctx, identity)) {
    if (isUpgradeSlot(active.itemId) || !isOldMapGear(active.itemId)) continue;
    deleteActiveItemUpgrade(ctx, identity, slot);
    for (const scheduled of [...ctx.db.itemUpgradeCompletionSchedule.identity.filter(identity)] as any[]) {
      if (normalizeUpgradeBenchSlot(scheduled.slot) === slot) ctx.db.itemUpgradeCompletionSchedule.scheduledId.delete(scheduled.scheduledId);
    }
    first(active.itemId, "bench");
  }
  for (const gift of [...ctx.db.playerItemGift.identity.filter(identity)] as any[]) {
    if (gift.claimed || !isOldMapGear(gift.itemId)) continue;
    ctx.db.playerItemGift.key.update({ ...gift, claimed: true });
    first(gift.itemId, "gift");
  }
  for (const mail of [...ctx.db.mailboxEquipment.identity.filter(identity)] as any[]) {
    if (ctx.db.mailboxReceipt.key.find(`${mail.letterId}:${hex}`)?.claimed) continue;
    let items: unknown[] = [];
    try { const parsed = JSON.parse(mail.itemIdsJson); if (Array.isArray(parsed)) items = parsed; } catch {}
    const old = items.filter(isOldMapGear) as string[];
    if (!old.length) continue;
    for (const itemId of old) first(itemId, "mail");
    const rest = items.filter(itemId => !isOldMapGear(itemId));
    if (rest.length) ctx.db.mailboxEquipment.key.update({ ...mail, itemIdsJson: JSON.stringify(rest) });
    else ctx.db.mailboxEquipment.key.delete(mail.key);
  }

  for (const copy of extraCopiesOf(ctx, identity)) {
    if (!isOldMapGear(copy.itemId)) continue;
    note(extras, copy.itemId, "copy", refineLevelFor(ctx, identity, copy.itemId, copy.id));
    deleteCopy(ctx, copy);
  }
  for (const offer of [...ctx.db.pendingEquipmentOffer.identity.filter(identity)] as any[]) {
    if (!isOldMapGear(offer.itemId)) continue;
    note(extras, offer.itemId, "offer", 0);
    deleteOffer(ctx, offer);
  }

  // Per-item rows: refines (recorded for the pieces paid), skill rolls, locks, filter entries.
  const firstRefines = new Map<string, number>();
  for (const row of [...ctx.db.playerItemRefine.identity.filter(identity)] as any[]) {
    if (!isOldMapGear(row.itemId)) continue;
    firstRefines.set(row.itemId, Number(row.level) || 0);
    ctx.db.playerItemRefine.key.delete(row.key);
  }
  for (const row of [...ctx.db.playerCopyRefine.identity.filter(identity)] as any[]) {
    if (isOldMapGear(row.itemId)) ctx.db.playerCopyRefine.copyId.delete(row.copyId);
  }
  for (const handle of [ctx.db.playerBowSkill, ctx.db.playerSwordSkill, ctx.db.playerStaffSkill, ctx.db.playerEquipmentLock, ctx.db.playerIgnoredDrop, ctx.db.playerRefinePity]) {
    for (const row of [...handle.identity.filter(identity)] as any[]) if (isOldMapGear(row.itemId)) handle.key.delete(row.key);
  }
  const result = ctx.db.playerRefineResult.identity.find(identity);
  if (result && isOldMapGear(result.itemId)) ctx.db.playerRefineResult.identity.delete(identity);
  for (const build of [...ctx.db.playerBuild.identity.filter(identity)] as any[]) {
    let gear: Record<string, unknown>;
    try { gear = JSON.parse(build.gearJson); } catch { continue; }
    if (!gear || typeof gear !== "object" || !Object.values(gear).some(isOldMapGear)) continue;
    const cleared = Object.fromEntries(Object.entries(gear).map(([slot, itemId]) => [slot, isOldMapGear(itemId) ? "" : itemId]));
    ctx.db.playerBuild.key.update({ ...build, gearJson: JSON.stringify(cleared) });
  }

  const changed = Boolean(live && live.progress !== progress);
  if (changed) writeProgressAndPresentation(ctx, live!.progress);
  else if ([ctx.db.playerWornSkill, ctx.db.playerWornStaffSkill].some(handle => isOldMapGear(handle?.identity.find(identity)?.itemId))) syncWornSkill(ctx, identity);
  if (changed) markLeaderboardDirty(ctx, identity);

  for (const piece of firsts.values()) piece.refines = [firstRefines.get(piece.itemId) ?? 0];
  for (const itemId of archived) if (!firsts.has(itemId)) note(firsts, itemId, "archive");
  const entries = [...firsts.values(), ...extras.values()].map(piece => {
    const unpaid = piece.from.size === 1 && piece.from.has("archive");
    const tier = itemTier(piece.itemId) ?? 0;
    const count = unpaid ? 0 : piece.count;
    return { itemId: piece.itemId, tier, count, refines: unpaid ? [firstRefines.get(piece.itemId) ?? 0] : piece.refines,
      gold: count * oldTierSalePrice(tier), from: [...piece.from].sort() };
  }).sort((a, b) => a.itemId.localeCompare(b.itemId) || a.from.join().localeCompare(b.from.join()));
  const gold = entries.reduce((sum, entry) => sum + entry.gold, 0);
  addGold(ctx, identity, gold);
  // Refine stars become a little Mastery: a weapon's for its own school, armor's for the school of the weapon in hand.
  const handSchool = weaponSchool(canonicalItemId(progress?.equippedRightHand) ?? undefined);
  const stars: Partial<Record<WeaponSchool, number>> = {};
  for (const entry of entries) {
    if (!entry.count) continue;
    const school = itemDefinition(entry.itemId)?.weapon ? weaponSchool(entry.itemId) : handSchool;
    stars[school] = (stars[school] ?? 0) + entry.refines.reduce((sum, level) => sum + Math.max(0, Number(level) || 0), 0);
  }
  const earned = Object.values(stars).reduce((sum, count) => sum + (count ?? 0) * REFINE_STAR_MASTERY_POINTS, 0);
  const scale = earned > REFINE_MASTERY_CAP ? REFINE_MASTERY_CAP / earned : 1;
  const mastery: Partial<Record<WeaponSchool, number>> = {};
  for (const [school, count] of Object.entries(stars) as [WeaponSchool, number][]) {
    const points = Math.floor(count * REFINE_STAR_MASTERY_POINTS * scale);
    if (points > 0) { mastery[school] = points; grantMasteryPoints(ctx, identity, school, points); }
  }
  if (entries.length) recordPayout(ctx, identity, entries, gold, mastery);
  return { gold, changed };
}

/** Adds to the player's payout row, or writes it. */
function recordPayout(ctx: Ctx, identity: Identity, entries: unknown[], gold: number, mastery: Partial<Record<WeaponSchool, number>>) {
  const current = ctx.db.oldGearPayout.identity.find(identity);
  let earlier: unknown[] = [];
  try { const parsed = JSON.parse(current?.itemsJson ?? "[]"); if (Array.isArray(parsed)) earlier = parsed; } catch {}
  let earlierMastery: Record<string, number> = {};
  try { const parsed = JSON.parse(current?.masteryJson ?? "{}"); if (parsed && typeof parsed === "object") earlierMastery = parsed; } catch {}
  for (const [school, points] of Object.entries(mastery)) earlierMastery[school] = (earlierMastery[school] ?? 0) + (points ?? 0);
  const row = { identity, itemsJson: JSON.stringify([...earlier, ...entries]), gold: (current?.gold ?? 0n) + BigInt(gold),
    masteryJson: JSON.stringify(earlierMastery), at: ctx.timestamp };
  if (current) ctx.db.oldGearPayout.identity.update(row);
  else ctx.db.oldGearPayout.insert(row);
}

/** Migration 62: every player holding old gear anywhere, found in one pass per table, wiped and paid once. */
export function payOutAllOldGear(ctx: Ctx) {
  const holders = new Map<string, Identity>();
  const hold = (identity: Identity) => holders.set(identity.toHexString(), identity);
  for (const progress of iterPlayerProgress(ctx)) {
    if (progressWithoutOldGear(progress).progress !== progress) hold(progress.identity);
  }
  for (const handle of [ctx.db.prestigeChallengeBackup, ctx.db.prestigeChallengeRun, ctx.db.aggroChallengeRun, ctx.db.playerEndlessRebaseBackup]) {
    for (const row of handle?.iter() ?? [] as any[]) if (row.progressJson && savedRunWithoutOldGear(row.progressJson, row.identity)) hold(row.identity);
  }
  for (const handle of [ctx.db.activeItemUpgrade, ctx.db.activeItemUpgradeSlotTwo, ctx.db.activeItemUpgradeSlotThree,
    ctx.db.playerItemGift, ctx.db.playerEquipmentCopy, ctx.db.pendingEquipmentOffer, ctx.db.playerItemRefine, ctx.db.playerCopyRefine,
    ctx.db.playerRefineResult, ctx.db.playerBowSkill, ctx.db.playerSwordSkill, ctx.db.playerStaffSkill, ctx.db.playerWornSkill,
    ctx.db.playerWornStaffSkill, ctx.db.playerEquipmentLock, ctx.db.playerIgnoredDrop]) {
    for (const row of handle.iter() as Iterable<any>) if (isOldMapGear(row.itemId)) hold(row.identity);
  }
  for (const mail of ctx.db.mailboxEquipment.iter() as Iterable<any>) {
    try { if ((JSON.parse(mail.itemIdsJson) as unknown[]).some(isOldMapGear)) hold(mail.identity); } catch {}
  }
  for (const build of ctx.db.playerBuild.iter() as Iterable<any>) {
    try { if (Object.values(JSON.parse(build.gearJson) ?? {}).some(isOldMapGear)) hold(build.identity); } catch {}
  }
  let changed = false;
  for (const identity of holders.values()) {
    if (ctx.db.oldGearPayout.identity.find(identity)) continue;
    changed = payOutOldGear(ctx, identity).changed || changed;
  }
  if (changed) requestLeaderboardRefresh(ctx);
}

/** A guest's payout record follows its save onto the account it links to. */
export function mergeOldGearPayout(ctx: Ctx, guest: Identity, account: Identity) {
  const row = ctx.db.oldGearPayout.identity.find(guest);
  if (!row) return;
  ctx.db.oldGearPayout.identity.delete(guest);
  let entries: unknown[] = [];
  try { const parsed = JSON.parse(row.itemsJson); if (Array.isArray(parsed)) entries = parsed; } catch {}
  const current = ctx.db.oldGearPayout.identity.find(account);
  if (!current) { ctx.db.oldGearPayout.insert({ ...row, identity: account }); return; }
  let earlier: unknown[] = [];
  try { const parsed = JSON.parse(current.itemsJson); if (Array.isArray(parsed)) earlier = parsed; } catch {}
  const mastery: Record<string, number> = {};
  for (const json of [current.masteryJson, row.masteryJson]) {
    try { for (const [school, points] of Object.entries(JSON.parse(json || "{}") as Record<string, number>)) mastery[school] = (mastery[school] ?? 0) + (Number(points) || 0); } catch {}
  }
  ctx.db.oldGearPayout.identity.update({ ...current, itemsJson: JSON.stringify([...earlier, ...entries]), gold: current.gold + row.gold, masteryJson: JSON.stringify(mastery) });
}
