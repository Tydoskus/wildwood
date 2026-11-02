// Item upgrade timers: the scheduled completion row per bench slot, finishing,
// cancelling and reconciling an active upgrade, and removing a player's upgrade
// data. Moved out of index.ts unchanged; the upgrade reducers stay there.
import { normalizeUpgradeBenchSlot, deleteActiveItemUpgrade, rebaseActiveItemUpgradeTimer } from "./upgrade-bench-slots";
import { removeEquipmentOffers, removeEquipmentCopies } from "./equipment-copies";
import { removeRefineData, standsAtTheSmith } from "./item-refine";
import { removeCardData } from "./gear-cards";
import { deleteSnapshotRow, updateSnapshotRow, insertSnapshotRow } from "./snapshot-row-writes";
import { ScheduleAt } from "spacetimedb";
import { slotUpgradeTierFor, slotUpgradeKey, defaultPlayerProgress, restoreItemToProgress } from "./progress-helpers";
import { MAX_SLOT_UPGRADE_TIER } from "../../shared/items";
import { readPlayerProgress } from "./wide-stats";
import { isUpgradeSlot, upgradeSlotForItem } from "../../shared/slot-upgrades";
import { writeProgressAndPresentation } from "./player-power";
import type { ModuleReducerCtx } from "./index";
import { requireUpgradeBenchSlot, UPGRADE_BENCH_SLOT_TWO, secondUpgradeSlotUnlockedFor, UPGRADE_BENCH_SLOT_THREE, thirdUpgradeSlotUnlockedFor, activeItemUpgradeForSlot, activeItemUpgradeEntriesFor, insertActiveItemUpgrade } from "./upgrade-bench-slots";
import { requireControllingPlayer } from "./session-guards";
import { isTownMap, TOWN_BENCH_POSITION } from "./town";
import { withinStationReach } from "./door-reach";
import { SenderError } from "spacetimedb/server";
import { activeDuelFor } from "./duel-runtime";
import { UPGRADE_SLOT_LABELS } from "../../shared/slot-upgrades";
import { slotUpgradeDurationWithResearch } from "../../shared/utility-research";
import { itemUpgradeDurationMs } from "../../shared/items";
import { Timestamp } from "spacetimedb";
import { touchCombatProfile } from "./combat-profile";

export function removeItemUpgradeCompletionSchedules(ctx: any, identity: any, slot?: number) {
  const scheduledIds = [...ctx.db.itemUpgradeCompletionSchedule.identity.filter(identity) as Iterable<any>]
    .filter((scheduled: any) => slot === undefined || normalizeUpgradeBenchSlot(scheduled.slot) === slot)
    .map((scheduled: any) => scheduled.scheduledId);
  for (const scheduledId of scheduledIds) ctx.db.itemUpgradeCompletionSchedule.scheduledId.delete(scheduledId);
}

export function removePlayerItemDrops(ctx: any, identity: any, keepCopies = false) {
  for (const drop of [...ctx.db.playerItemDrop.byIdentity.filter(identity) as Iterable<any>]) {
    ctx.db.playerItemDrop.key.delete(drop.key);
  }
  if (keepCopies) removeEquipmentOffers(ctx, identity); // Prestige keeps the bag, kept copies, refines, ores and cards included.
  else { removeEquipmentCopies(ctx, identity); removeRefineData(ctx, identity); removeCardData(ctx, identity); } // Kept copies, waiting offers, refines, ores and cards are gear too.
}

export function removePlayerItemUpgradeData(ctx: any, identity: any, removeDrops = false) {
  if (ctx.db.activeItemUpgrade.identity.find(identity)) ctx.db.activeItemUpgrade.identity.delete(identity);
  if (ctx.db.activeItemUpgradeSlotTwo.identity.find(identity)) ctx.db.activeItemUpgradeSlotTwo.identity.delete(identity);
  if (ctx.db.activeItemUpgradeSlotThree.identity.find(identity)) ctx.db.activeItemUpgradeSlotThree.identity.delete(identity);
  removeItemUpgradeCompletionSchedules(ctx, identity);
  for (const upgrade of [...ctx.db.playerItemUpgrade.byIdentity.filter(identity) as Iterable<any>]) {
    deleteSnapshotRow(ctx, "playerItemUpgrade", upgrade.key);
  }
  if (removeDrops) removePlayerItemDrops(ctx, identity);
}

export function ensureItemUpgradeCompletionSchedule(ctx: any, active: any, slot: number) {
  const completesAtMicros = active.completesAt.microsSinceUnixEpoch;
  // The sweep calls this for every running upgrade; leave a correct schedule alone.
  const existing = [...ctx.db.itemUpgradeCompletionSchedule.identity.filter(active.identity) as Iterable<any>]
    .filter((scheduled: any) => normalizeUpgradeBenchSlot(scheduled.slot) === slot);
  if (!active.paused && existing.length === 1 && existing[0].itemId === active.itemId
    && existing[0].targetLevel === active.targetLevel && existing[0].completesAtMicros === completesAtMicros) return;
  removeItemUpgradeCompletionSchedules(ctx, active.identity, slot);
  if (active.paused) return;
  ctx.db.itemUpgradeCompletionSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(completesAtMicros),
    identity: active.identity,
    itemId: active.itemId,
    targetLevel: active.targetLevel,
    completesAtMicros,
    slot,
  });
}

export function completeActiveItemUpgrade(ctx: any, active: any, slot: number) {
  // The tier lands by itself the moment the schedule fires, online or not.
  // Nothing is returned to the bag, because nothing was taken from it.
  const currentLevel = slotUpgradeTierFor(ctx, active.identity, active.itemId);
  if (currentLevel === active.currentLevel && active.targetLevel === currentLevel + 1 && active.targetLevel <= MAX_SLOT_UPGRADE_TIER) {
    const key = slotUpgradeKey(active.identity, active.itemId);
    const current = ctx.db.playerItemUpgrade.key.find(key);
    const completed = { key, identity: active.identity, itemId: active.itemId, level: active.targetLevel };
    if (current) updateSnapshotRow(ctx, "playerItemUpgrade", completed);
    else insertSnapshotRow(ctx, "playerItemUpgrade", completed);
    // Often the scheduler's write, where no reducer of this player's bumps the stamp.
    touchCombatProfile(ctx, active.identity);
    const progress = readPlayerProgress(ctx, active.identity);
    if (progress) writeProgressAndPresentation(ctx, progress);
  }
  deleteActiveItemUpgrade(ctx, active.identity, slot);
  removeItemUpgradeCompletionSchedules(ctx, active.identity, slot);
}

export function cancelActiveItemUpgrade(ctx: any, active: any, slot: number) {
  // A slot upgrade takes nothing from the bag, so there is nothing to hand
  // back. A row left over from when upgrades belonged to items still names an
  // item, and that one is still returned.
  if (!isUpgradeSlot(active.itemId)) {
    const progress = readPlayerProgress(ctx, active.identity) ?? defaultPlayerProgress(active.identity);
    writeProgressAndPresentation(ctx, restoreItemToProgress(progress, active.itemId));
  }
  deleteActiveItemUpgrade(ctx, active.identity, slot);
  removeItemUpgradeCompletionSchedules(ctx, active.identity, slot);
}

export function reconcileActiveItemUpgrade(ctx: any, active: any, slot: number) {
  // itemId holds the slot; an item id is mapped to its slot, so a running
  // slot upgrade is kept rather than thrown away.
  const upgradeSlot = isUpgradeSlot(active.itemId) ? active.itemId : upgradeSlotForItem(active.itemId);
  if (!upgradeSlot
    || active.currentLevel !== slotUpgradeTierFor(ctx, active.identity, upgradeSlot)
    || active.targetLevel !== active.currentLevel + 1) {
    cancelActiveItemUpgrade(ctx, active, slot);
    return;
  }
  if (active.paused) {
    cancelActiveItemUpgrade(ctx, active, slot);
    return;
  }
  const nextActive = rebaseActiveItemUpgradeTimer(ctx, active, slot);
  if (ctx.timestamp.microsSinceUnixEpoch >= nextActive.completesAt.microsSinceUnixEpoch) {
    completeActiveItemUpgrade(ctx, nextActive, slot);
    return;
  }
  ensureItemUpgradeCompletionSchedule(ctx, nextActive, slot);
}

export const UPGRADE_BENCH_USE_RANGE = 75;

export function startItemUpgradeFor(ctx: ModuleReducerCtx, { slot: requestedSlot, itemId }: { slot: number; itemId: string }) {
  const slot = requireUpgradeBenchSlot(requestedSlot);
  const playerAtBench = requireControllingPlayer(ctx);
  // The smithy's bench; the Smith's reach still counts for older tabs, where Slot Upgrades is his tab.
  const atBench = isTownMap(playerAtBench.mapId) && withinStationReach(ctx, playerAtBench, TOWN_BENCH_POSITION, UPGRADE_BENCH_USE_RANGE);
  if (!atBench && !standsAtTheSmith(ctx, playerAtBench)) {
    throw new SenderError("Go to the Smith or the Slot Upgrades bench first.");
  }
  if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
  if (slot === UPGRADE_BENCH_SLOT_TWO && !secondUpgradeSlotUnlockedFor(ctx, ctx.sender)) {
    throw new SenderError("Unlock the second queue first.");
  }
  if (slot === UPGRADE_BENCH_SLOT_THREE && !thirdUpgradeSlotUnlockedFor(ctx, ctx.sender)) {
    throw new SenderError("Unlock the third queue first.");
  }
  // `itemId` carries the upgrade slot: "HAND", "HEAD" or "CHEST". The
  // parameter keeps its name so the reducer signature stays compatible.
  const upgradeSlot = itemId;
  if (!isUpgradeSlot(upgradeSlot)) throw new SenderError("Choose a weapon, helmet or armor slot.");

  const existing = activeItemUpgradeForSlot(ctx, ctx.sender, slot);
  if (existing) reconcileActiveItemUpgrade(ctx, existing, slot);
  const active = activeItemUpgradeForSlot(ctx, ctx.sender, slot);
  if (active) throw new SenderError("That queue is already in use.");
  if (activeItemUpgradeEntriesFor(ctx, ctx.sender).some(({ active: other }) => other.itemId === upgradeSlot)) {
    throw new SenderError(`Your ${UPGRADE_SLOT_LABELS[upgradeSlot]} slot is already upgrading.`);
  }

  // The bag is untouched: a slot tier is not the item, so nothing is taken
  // away while it runs and nothing has to be handed back when it finishes.
  const currentLevel = slotUpgradeTierFor(ctx, ctx.sender, upgradeSlot);
  if (currentLevel >= MAX_SLOT_UPGRADE_TIER) {
    throw new SenderError(`Your ${UPGRADE_SLOT_LABELS[upgradeSlot]} slot is already +${MAX_SLOT_UPGRADE_TIER}.`);
  }

  const durationMicros = BigInt(slotUpgradeDurationWithResearch(itemUpgradeDurationMs(currentLevel), ctx.db.playerResearch.identity.find(ctx.sender)?.slotUpgradeSpeed ?? 0)) * 1_000n;
  const safeDurationMicros = durationMicros > 0n ? durationMicros : 1n;
  const completesAt = new Timestamp(ctx.timestamp.microsSinceUnixEpoch + safeDurationMicros);
  const nextActive = {
    identity: ctx.sender,
    itemId: upgradeSlot,
    currentLevel,
    targetLevel: currentLevel + 1,
    startedAt: ctx.timestamp,
    completesAt,
    paused: false,
    remainingMicros: safeDurationMicros,
  };
  insertActiveItemUpgrade(ctx, slot, nextActive);
  ensureItemUpgradeCompletionSchedule(ctx, nextActive, slot);
}
