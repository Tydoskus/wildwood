import { SenderError } from "spacetimedb/server";
import { Timestamp } from "spacetimedb";
import { itemUpgradeDurationMs } from "../../shared/items";
import { slotUpgradeDurationWithResearch } from "../../shared/utility-research";

export const UPGRADE_BENCH_SLOT_ONE = 1;
export const UPGRADE_BENCH_SLOT_TWO = 2;
export const UPGRADE_BENCH_SLOT_THREE = 3;

/** Keep the legacy missing-slot value pointed at slot one for old schedules. */
export function normalizeUpgradeBenchSlot(slot: unknown) {
  const numericSlot = Number(slot);
  return numericSlot === UPGRADE_BENCH_SLOT_TWO || numericSlot === UPGRADE_BENCH_SLOT_THREE
    ? numericSlot : UPGRADE_BENCH_SLOT_ONE;
}

export function requireUpgradeBenchSlot(slot: unknown) {
  const numericSlot = Number(slot);
  if (numericSlot !== UPGRADE_BENCH_SLOT_ONE && numericSlot !== UPGRADE_BENCH_SLOT_TWO && numericSlot !== UPGRADE_BENCH_SLOT_THREE) {
    throw new SenderError("Unknown upgrade slot.");
  }
  return numericSlot;
}

export function activeItemUpgradeForSlot(ctx: any, identity: any, slot: number) {
  if (slot === UPGRADE_BENCH_SLOT_THREE) return ctx.db.activeItemUpgradeSlotThree.identity.find(identity);
  if (slot === UPGRADE_BENCH_SLOT_TWO) return ctx.db.activeItemUpgradeSlotTwo.identity.find(identity);
  return ctx.db.activeItemUpgrade.identity.find(identity);
}

export function activeItemUpgradeEntriesFor(ctx: any, identity: any) {
  const slotOne = ctx.db.activeItemUpgrade.identity.find(identity);
  const slotTwo = ctx.db.activeItemUpgradeSlotTwo.identity.find(identity);
  const slotThree = ctx.db.activeItemUpgradeSlotThree.identity.find(identity);
  return [
    ...(slotOne ? [{ slot: UPGRADE_BENCH_SLOT_ONE, active: slotOne }] : []),
    ...(slotTwo ? [{ slot: UPGRADE_BENCH_SLOT_TWO, active: slotTwo }] : []),
    ...(slotThree ? [{ slot: UPGRADE_BENCH_SLOT_THREE, active: slotThree }] : []),
  ];
}

export function insertActiveItemUpgrade(ctx: any, slot: number, active: any) {
  if (slot === UPGRADE_BENCH_SLOT_THREE) return ctx.db.activeItemUpgradeSlotThree.insert(active);
  if (slot === UPGRADE_BENCH_SLOT_TWO) return ctx.db.activeItemUpgradeSlotTwo.insert(active);
  return ctx.db.activeItemUpgrade.insert(active);
}

export function deleteActiveItemUpgrade(ctx: any, identity: any, slot: number) {
  if (slot === UPGRADE_BENCH_SLOT_THREE) ctx.db.activeItemUpgradeSlotThree.identity.delete(identity);
  else if (slot === UPGRADE_BENCH_SLOT_TWO) ctx.db.activeItemUpgradeSlotTwo.identity.delete(identity);
  else ctx.db.activeItemUpgrade.identity.delete(identity);
}

export function secondUpgradeSlotUnlockedFor(ctx: any, identity: any) {
  return ctx.db.playerUpgradeBench.identity.find(identity)?.secondSlotUnlocked === true;
}

export function thirdUpgradeSlotUnlockedFor(ctx: any, identity: any) {
  const bench = ctx.db.playerUpgradeBench.identity.find(identity);
  return bench?.secondSlotUnlocked === true && Boolean(ctx.db.playerUpgradeBenchThirdSlot.identity.find(identity));
}

/** Apply a newly earned speed rank to an in-flight job without extending it. */
export function rebaseActiveItemUpgradeTimer(ctx: any, active: any, slot: number) {
  const duration = BigInt(slotUpgradeDurationWithResearch(
    itemUpgradeDurationMs(active.currentLevel), ctx.db.playerResearch.identity.find(active.identity)?.slotUpgradeSpeed ?? 0,
  )) * 1_000n;
  const expectedFinish = active.startedAt.microsSinceUnixEpoch + duration;
  if (expectedFinish >= active.completesAt.microsSinceUnixEpoch) return active;
  const next = { ...active, completesAt: new Timestamp(expectedFinish), remainingMicros: duration };
  if (ctx.timestamp.microsSinceUnixEpoch >= expectedFinish) return next;
  if (slot === UPGRADE_BENCH_SLOT_THREE) ctx.db.activeItemUpgradeSlotThree.identity.update(next);
  else if (slot === UPGRADE_BENCH_SLOT_TWO) ctx.db.activeItemUpgradeSlotTwo.identity.update(next);
  else ctx.db.activeItemUpgrade.identity.update(next);
  return next;
}

export function refreshActiveSlotUpgrades(ctx: any, identity: any, reconcile: (ctx: any, active: any, slot: number) => void) {
  for (const { slot, active } of activeItemUpgradeEntriesFor(ctx, identity)) reconcile(ctx, active, slot);
}
