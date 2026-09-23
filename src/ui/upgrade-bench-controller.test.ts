import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { FROST_BOW } from "../../shared/items";
import { UPGRADE_BENCH_TOUCH_OFFSET_Y, UPGRADE_CANCEL_CONFIRMATION, createUpgradeBenchController, playerTouchesUpgradeBench, upgradeBenchTouchTransition, upgradePickerPreview, upgradeSlotAfterPickerDismiss, upgradesFinishedSinceLastPoll } from "./upgrade-bench-controller";
import type { ActiveItemUpgrade } from "../wildstat-coop";
import { createInventoryNotice } from "./inventory-notice";

afterEach(() => vi.unstubAllGlobals());

describe("upgrade bench touch latch", () => {
  it("requires leaving before a closed bench can open again", () => {
    const entered = upgradeBenchTouchTransition(false, true);
    expect(entered).toEqual({ touching: true, shouldOpen: true });

    // Closing the window does not change contact with the bench.
    const stillTouching = upgradeBenchTouchTransition(entered.touching, true);
    expect(stillTouching).toEqual({ touching: true, shouldOpen: false });

    const left = upgradeBenchTouchTransition(stillTouching.touching, false);
    expect(left).toEqual({ touching: false, shouldOpen: false });
    expect(upgradeBenchTouchTransition(left.touching, true)).toEqual({ touching: true, shouldOpen: true });
  });

  it("centers the interaction collision above the decor depth point", () => {
    const bench = { x: 800, y: 710 };
    expect(UPGRADE_BENCH_TOUCH_OFFSET_Y).toBe(-36);
    expect(playerTouchesUpgradeBench({ x: 800, y: 674 }, bench)).toBe(true);
    expect(playerTouchesUpgradeBench({ x: 854, y: 674 }, bench)).toBe(true);
    expect(playerTouchesUpgradeBench({ x: 855, y: 674 }, bench)).toBe(false);
    expect(playerTouchesUpgradeBench({ x: 800, y: 713 }, bench)).toBe(true);
    expect(playerTouchesUpgradeBench({ x: 800, y: 714 }, bench)).toBe(false);
    expect(playerTouchesUpgradeBench({ x: 800, y: 595 }, bench)).toBe(false);
    expect(playerTouchesUpgradeBench({ x: 800, y: 753 }, bench)).toBe(false);
  });

  it("warns that cancellation forfeits progress toward the next level", () => {
    expect(UPGRADE_CANCEL_CONFIRMATION).toBe(
      "Are you sure you want to cancel? You will lose current progress to the next upgrade.",
    );
  });

  it("previews the tier a track is about to gain, measured on the gear in it", () => {
    // Upgrades belong to the slot now, so the preview names the track and its
    // next tier, and reads the numbers off whatever is equipped there.
    expect(upgradePickerPreview("HAND", 0, FROST_BOW)).toEqual({
      name: "WEAPON \u00b7 TIER 0 \u2192 1",
      equippedItemId: FROST_BOW,
      changes: [
        { label: "DAMAGE", current: "+11.43%", next: "+11.89%" },
      ],
    });
    // An empty slot still shows the tier; there is nothing to measure.
    expect(upgradePickerPreview("HEAD", 4)).toEqual({
      name: "HELMET \u00b7 TIER 4 \u2192 5", equippedItemId: "", changes: [],
    });
  });

  it("restores a slotted item's actions when item choices are dismissed", () => {
    expect(upgradeSlotAfterPickerDismiss(1, FROST_BOW)).toBe(1);
    expect(upgradeSlotAfterPickerDismiss(1, "")).toBeNull();
    expect(upgradeSlotAfterPickerDismiss(null, FROST_BOW)).toBeNull();
  });
});

describe("finished upgrade notification", () => {
  const job = (slot: 1 | 2 | 3, completesAtMs: number, itemId = "HAND"): ActiveItemUpgrade => ({
    slot, itemId, currentLevel: 0, targetLevel: 1, startedAtMs: 100,
    completesAtMs, paused: false, remainingMs: completesAtMs - 100,
  });
  const jobs = (...entries: ActiveItemUpgrade[]) => new Map(entries.map((entry) => [entry.slot, entry] as const));

  it("notices a job that disappears after its time", () => {
    expect(upgradesFinishedSinceLastPoll(jobs(job(1, 500)), new Map(), 500)).toEqual([job(1, 500)]);
    expect(upgradesFinishedSinceLastPoll(jobs(job(1, 500)), new Map(), 900)).toEqual([job(1, 500)]);
  });

  it("ignores a job cancelled before its time", () => {
    expect(upgradesFinishedSinceLastPoll(jobs(job(1, 500)), new Map(), 499)).toEqual([]);
  });

  it("ignores a job that is still running", () => {
    expect(upgradesFinishedSinceLastPoll(jobs(job(1, 500)), jobs(job(1, 500)), 900)).toEqual([]);
  });

  it("reports all three slots independently, including when they finish together", () => {
    const first = job(1, 500);
    const second = job(2, 600, "HEAD");
    const third = job(3, 600, "CHEST");
    expect(upgradesFinishedSinceLastPoll(jobs(first, second, third), jobs(second, third), 600)).toEqual([first]);
    expect(upgradesFinishedSinceLastPoll(jobs(first, second, third), jobs(first, third), 600)).toEqual([second]);
    expect(upgradesFinishedSinceLastPoll(jobs(first, second, third), new Map(), 600)).toEqual([first, second, third]);
  });

  it("notices a completed job when its bench slot immediately starts another", () => {
    const first = job(1, 500);
    const next = { ...first, startedAtMs: 550, targetLevel: 2 };
    expect(upgradesFinishedSinceLastPoll(jobs(first), jobs(next), 600)).toEqual([first]);
  });

  it("does not report a paused job or a job never observed", () => {
    const paused = { ...job(2, 500), paused: true };
    expect(upgradesFinishedSinceLastPoll(jobs(paused), new Map(), 900)).toEqual([]);
    expect(upgradesFinishedSinceLastPoll(new Map(), jobs(job(1, 500)), 600)).toEqual([]);
  });

  it("keeps the inventory red dot when the inventory opens after any bench slot finishes", () => {
    const names = ["inventory", "slot", "slotTwo", "slotThree", "action", "speedUp", "back", "closePicker"];
    const others = ["panel", "prompt", "statGain", "timer", "picker", "pickerItems"];
    const { document } = parseHTML(`<html><body>${names.map((name) => `<button id="${name}"></button>`).join("")}${others.map((name) => `<div id="${name}"></div>`).join("")}</body></html>`);
    vi.stubGlobal("document", document);
    const element = (name: string) => document.getElementById(name)!;
    const first = job(1, 500);
    const second = job(2, 700, "HEAD");
    const third = job(3, 900, "CHEST");
    let active = [first, second, third];
    let now = 100;
    const finished = vi.fn();
    const controller = createUpgradeBenchController(Object.fromEntries([...names, ...others].map((name) => [name, element(name)])) as never, {
      activeUpgrades: () => active, nowMs: () => now, onUpgradeFinished: finished,
      storage: { getItem: () => null, setItem: vi.fn() },
    } as never);
    const notice = createInventoryNotice(element("inventory"));
    const dot = element("inventory").querySelector<HTMLElement>(".inventory-notice")!;
    notice.set(controller.finishedUpgradeWaiting());
    expect(dot.hidden).toBe(true);

    now = 600; active = [second, third];
    notice.set(controller.finishedUpgradeWaiting());
    expect(dot.hidden).toBe(false);
    expect(finished).toHaveBeenCalledWith(first);

    element("inventory").click();
    notice.set(controller.finishedUpgradeWaiting());
    expect(dot.hidden).toBe(false);
    now = 800; active = [third];
    notice.set(controller.finishedUpgradeWaiting());
    expect(dot.hidden).toBe(false);
    expect(finished).toHaveBeenCalledWith(second);
    expect(finished).toHaveBeenCalledTimes(2);
    now = 1_000; active = [];
    notice.set(controller.finishedUpgradeWaiting());
    expect(dot.hidden).toBe(false);
    expect(finished).toHaveBeenCalledWith(third);
    expect(finished).toHaveBeenCalledTimes(3);
  });

  it("restores a finished job after the game was closed and scopes the dot to its player", () => {
    const names = ["inventory", "slot", "slotTwo", "slotThree", "action", "speedUp", "back", "closePicker"];
    const others = ["panel", "prompt", "statGain", "timer", "picker", "pickerItems"];
    const { document } = parseHTML(`<html><body>${names.map((name) => `<button id="${name}"></button>`).join("")}${others.map((name) => `<div id="${name}"></div>`).join("")}</body></html>`);
    vi.stubGlobal("document", document);
    const element = (name: string) => document.getElementById(name)!;
    const elements = Object.fromEntries([...names, ...others].map((name) => [name, element(name)])) as never;
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    let identity = "player-a";
    let active = [job(2, 500, "HEAD")];
    let tier = 0;
    const finished = vi.fn();
    const dependencies = {
      activeUpgrades: () => active, slotTier: () => tier, nowMs: () => 100,
      localIdentity: () => identity, storage, onUpgradeFinished: finished,
    } as never;
    const firstSession = createUpgradeBenchController(elements, dependencies);
    expect(firstSession.finishedUpgradeWaiting()).toBe(false);
    expect(firstSession.finishedUpgradeWaiting(false)).toBe(false);

    active = [];
    tier = 1;
    const nextSession = createUpgradeBenchController(elements, dependencies);
    expect(nextSession.finishedUpgradeWaiting()).toBe(true);
    expect(finished).toHaveBeenCalledWith(job(2, 500, "HEAD"));
    identity = "player-b";
    expect(nextSession.finishedUpgradeWaiting()).toBe(false);
  });

  it("marks a server-confirmed tier even if its active job was never observed", () => {
    const names = ["slot", "slotTwo", "slotThree", "action", "speedUp", "back", "closePicker"];
    const others = ["panel", "prompt", "statGain", "timer", "picker", "pickerItems"];
    const { document } = parseHTML(`<html><body>${names.map((name) => `<button id="${name}"></button>`).join("")}${others.map((name) => `<div id="${name}"></div>`).join("")}</body></html>`);
    vi.stubGlobal("document", document);
    const finished = vi.fn();
    const controller = createUpgradeBenchController(Object.fromEntries([...names, ...others].map((name) => [name, document.getElementById(name)!])) as never, {
      activeUpgrades: () => [], localIdentity: () => "player", onUpgradeFinished: finished,
    } as never);
    controller.observeUpgradeTier("CHEST", 4);
    expect(controller.finishedUpgradeWaiting()).toBe(true);
    expect(finished).toHaveBeenCalledWith(expect.objectContaining({ itemId: "CHEST", targetLevel: 4 }));
  });

  it("clears the red dot only after another upgrade fills every bench slot", async () => {
    const names = ["inventory", "slot", "slotTwo", "slotThree", "action", "speedUp", "back", "closePicker"];
    const others = ["panel", "prompt", "statGain", "timer", "picker", "pickerItems"];
    const { document } = parseHTML(`<html><body>${names.map((name) => `<button id="${name}"></button>`).join("")}${others.map((name) => `<div id="${name}"></div>`).join("")}</body></html>`);
    vi.stubGlobal("document", document);
    const element = (name: string) => document.getElementById(name)!;
    element("panel").hidden = true;
    let active: ActiveItemUpgrade[] = [];
    let attempts = 0;
    const startUpgrade = vi.fn(async (slot: 1 | 2, itemId: string) => {
      if (++attempts === 1) return { ok: false, error: "TRY AGAIN" };
      active = [...active, { ...job(slot, 1000, itemId), currentLevel: 1, targetLevel: 2 }];
      return { ok: true };
    });
    const controller = createUpgradeBenchController(Object.fromEntries([...names, ...others].map((name) => [name, element(name)])) as never, {
      activeUpgrades: () => active, slotTier: () => 1, secondSlotUnlocked: () => true, thirdSlotUnlocked: () => false,
      gemBalance: () => 0n, equippedIn: () => "", localIdentity: () => "player",
      playerPosition: () => ({ x: 0, y: 0 }), startUpgrade,
      beforeOpen: vi.fn(), clearPlayerInput: vi.fn(), setPaused: vi.fn(), showMessage: vi.fn(),
    } as never);
    controller.observeUpgradeTier("HAND", 1);
    expect(controller.finishedUpgradeWaiting()).toBe(true);
    controller.open();
    element("slot").click();
    (element("pickerItems").querySelector("button") as HTMLElement).click();
    element("action").click();
    await vi.waitFor(() => expect(startUpgrade).toHaveBeenCalledTimes(1));
    expect(controller.finishedUpgradeWaiting()).toBe(true);
    element("action").click();
    await vi.waitFor(() => expect(startUpgrade).toHaveBeenCalledTimes(2));
    expect(controller.finishedUpgradeWaiting()).toBe(true);
    element("slotTwo").click();
    (element("pickerItems").querySelector("button") as HTMLElement).click();
    element("action").click();
    await vi.waitFor(() => expect(startUpgrade).toHaveBeenCalledTimes(3));
    expect(controller.finishedUpgradeWaiting()).toBe(false);
  });

  it("offers slot three for 200 Gems only after slot two, then clears the dot when all three run", async () => {
    const names = ["inventory", "slot", "slotTwo", "slotThree", "action", "speedUp", "back", "closePicker"];
    const others = ["panel", "prompt", "statGain", "timer", "picker", "pickerItems"];
    const { document } = parseHTML(`<html><body>${names.map((name) => `<button id="${name}"></button>`).join("")}${others.map((name) => `<div id="${name}"></div>`).join("")}</body></html>`);
    vi.stubGlobal("document", document);
    const element = (name: string) => document.getElementById(name)!;
    element("panel").hidden = true;
    let secondUnlocked = false;
    let thirdUnlocked = false;
    let active: ActiveItemUpgrade[] = [job(1, 1_000, "HAND"), job(2, 1_000, "HEAD")];
    const confirmUnlock = vi.fn(async () => true);
    const unlockThirdSlot = vi.fn(async () => { thirdUnlocked = true; return { ok: true }; });
    const startUpgrade = vi.fn(async (slot: 1 | 2 | 3, itemId: string) => {
      active = [...active, job(slot, 1_000, itemId)];
      return { ok: true };
    });
    const controller = createUpgradeBenchController(Object.fromEntries([...names, ...others].map((name) => [name, element(name)])) as never, {
      activeUpgrades: () => active, slotTier: () => 0,
      secondSlotUnlocked: () => secondUnlocked, thirdSlotUnlocked: () => thirdUnlocked,
      gemBalance: () => 200n, equippedIn: () => "", localIdentity: () => "player",
      playerPosition: () => ({ x: 0, y: 0 }), startUpgrade, unlockThirdSlot,
      confirmUnlock, beforeOpen: vi.fn(), clearPlayerInput: vi.fn(), setPaused: vi.fn(), showMessage: vi.fn(),
    } as never);
    controller.open();
    expect(element("slotThree").hidden).toBe(true);
    secondUnlocked = true;
    controller.render();
    expect(element("slotThree").hidden).toBe(false);
    expect(element("slotThree").getAttribute("aria-label")).toContain("200 Gems");
    controller.observeUpgradeTier("CHEST", 1);
    expect(controller.finishedUpgradeWaiting()).toBe(true);
    element("slotThree").click();
    await vi.waitFor(() => expect(unlockThirdSlot).toHaveBeenCalledOnce());
    expect(confirmUnlock).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("200 Gems") }));
    expect(element("picker").hidden).toBe(false);
    (element("pickerItems").querySelector("button") as HTMLElement).click();
    element("action").click();
    await vi.waitFor(() => expect(startUpgrade).toHaveBeenCalledWith(3, "CHEST", expect.anything()));
    expect(controller.finishedUpgradeWaiting()).toBe(false);
  });
});
