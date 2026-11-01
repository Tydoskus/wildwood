import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { FROST_BOW, MAX_SLOT_UPGRADE_TIER, itemUpgradeStatChanges } from "../../shared/items";
import { SLOT_UPGRADES_TOUCH_OFFSET_Y, UPGRADE_CANCEL_CONFIRMATION, createSlotUpgradesController, playerTouchesSlotUpgrades, slotUpgradeCanStart, upgradePickerPreview, queueAfterPickerDismiss, upgradesFinishedSinceLastPoll } from "./slot-upgrades-controller";
import type { ActiveItemUpgrade } from "../wildstat-coop";
import { createInventoryNotice } from "./inventory-notice";
import { createStationLatch } from "./station-reach";

afterEach(() => vi.unstubAllGlobals());

describe("Slot Upgrades touch latch", () => {
  it("requires walking well away before a closed station can open again", () => {
    const latch = createStationLatch();
    expect(latch(true, false)).toBe(true);
    // Closing the window and sliding along the edge does not reopen it.
    expect(latch(true, false)).toBe(false);
    expect(latch(false, false)).toBe(false);
    expect(latch(true, false)).toBe(false);
    expect(latch(false, true)).toBe(false);
    expect(latch(true, false)).toBe(true);
  });

  it("centers the interaction collision above the decor depth point", () => {
    const station = { x: 800, y: 710 };
    expect(SLOT_UPGRADES_TOUCH_OFFSET_Y).toBe(-36);
    expect(playerTouchesSlotUpgrades({ x: 800, y: 674 }, station)).toBe(true);
    expect(playerTouchesSlotUpgrades({ x: 854, y: 674 }, station)).toBe(true);
    expect(playerTouchesSlotUpgrades({ x: 855, y: 674 }, station)).toBe(false);
    expect(playerTouchesSlotUpgrades({ x: 800, y: 713 }, station)).toBe(true);
    expect(playerTouchesSlotUpgrades({ x: 800, y: 714 }, station)).toBe(false);
    expect(playerTouchesSlotUpgrades({ x: 800, y: 595 }, station)).toBe(false);
    expect(playerTouchesSlotUpgrades({ x: 800, y: 753 }, station)).toBe(false);
  });

  it("warns that cancellation forfeits progress toward the next level", () => {
    expect(UPGRADE_CANCEL_CONFIRMATION).toBe(
      "Are you sure you want to cancel? You will lose this Slot Upgrade's progress.",
    );
  });

  it("previews the tier a slot is about to gain, measured on the gear in it", () => {
    // Upgrades belong to the slot, so the preview names the slot and its
    // next tier, and reads the numbers off whatever is equipped there.
    expect(upgradePickerPreview("HAND", 0, FROST_BOW)).toEqual({
      name: "Weapon \u00b7 +0 \u2192 +1",
      equippedItemId: FROST_BOW,
      changes: [
        { label: "DAMAGE", current: "×1.11", next: "×1.12" },
      ],
    });
    // An empty slot still shows the tier; there is nothing to measure.
    expect(upgradePickerPreview("HEAD", 4)).toEqual({
      name: "Helmet \u00b7 +4 \u2192 +5", equippedItemId: "", changes: [],
    });
    // A refined bow: both numbers stand on its refine, as the item window's do.
    const refined = upgradePickerPreview("HAND", 3, FROST_BOW, 5).changes[0];
    expect(refined).toEqual(itemUpgradeStatChanges(FROST_BOW, { tier: 3, refine: 5 })[0]);
    expect(parseFloat(refined.current.slice(1))).toBeGreaterThan(parseFloat(upgradePickerPreview("HAND", 3, FROST_BOW).changes[0].current.slice(1)));
  });

  it("restores a slotted item's actions when item choices are dismissed", () => {
    expect(queueAfterPickerDismiss(1, FROST_BOW)).toBe(1);
    expect(queueAfterPickerDismiss(1, "")).toBeNull();
    expect(queueAfterPickerDismiss(null, FROST_BOW)).toBeNull();
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

  it("notices a completed job when its queue immediately starts another", () => {
    const first = job(1, 500);
    const next = { ...first, startedAtMs: 550, targetLevel: 2 };
    expect(upgradesFinishedSinceLastPoll(jobs(first), jobs(next), 600)).toEqual([first]);
  });

  it("does not report a paused job or a job never observed", () => {
    const paused = { ...job(2, 500), paused: true };
    expect(upgradesFinishedSinceLastPoll(jobs(paused), new Map(), 900)).toEqual([]);
    expect(upgradesFinishedSinceLastPoll(new Map(), jobs(job(1, 500)), 600)).toEqual([]);
  });

  it("keeps the inventory red dot when the inventory opens after any queue finishes", () => {
    const names = ["inventory", "queueOne", "queueTwo", "queueThree", "action", "speedUp", "back", "closePicker"];
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
    const controller = createSlotUpgradesController(Object.fromEntries([...names, ...others].map((name) => [name, element(name)])) as never, {
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
    const names = ["inventory", "queueOne", "queueTwo", "queueThree", "action", "speedUp", "back", "closePicker"];
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
    const firstSession = createSlotUpgradesController(elements, dependencies);
    expect(firstSession.finishedUpgradeWaiting()).toBe(false);
    expect(firstSession.finishedUpgradeWaiting(false)).toBe(false);

    active = [];
    tier = 1;
    const nextSession = createSlotUpgradesController(elements, dependencies);
    expect(nextSession.finishedUpgradeWaiting()).toBe(true);
    expect(finished).toHaveBeenCalledWith(job(2, 500, "HEAD"));
    identity = "player-b";
    expect(nextSession.finishedUpgradeWaiting()).toBe(false);
  });

  it("marks a server-confirmed tier even if its active job was never observed", () => {
    const names = ["queueOne", "queueTwo", "queueThree", "action", "speedUp", "back", "closePicker"];
    const others = ["panel", "prompt", "statGain", "timer", "picker", "pickerItems"];
    const { document } = parseHTML(`<html><body>${names.map((name) => `<button id="${name}"></button>`).join("")}${others.map((name) => `<div id="${name}"></div>`).join("")}</body></html>`);
    vi.stubGlobal("document", document);
    const finished = vi.fn();
    const controller = createSlotUpgradesController(Object.fromEntries([...names, ...others].map((name) => [name, document.getElementById(name)!])) as never, {
      activeUpgrades: () => [], localIdentity: () => "player", onUpgradeFinished: finished,
    } as never);
    controller.observeUpgradeTier("CHEST", 4);
    expect(controller.finishedUpgradeWaiting()).toBe(true);
    expect(finished).toHaveBeenCalledWith(expect.objectContaining({ itemId: "CHEST", targetLevel: 4 }));
  });

  it("clears the red dot only after another upgrade fills every queue", async () => {
    const names = ["inventory", "queueOne", "queueTwo", "queueThree", "action", "speedUp", "back", "closePicker"];
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
    const controller = createSlotUpgradesController(Object.fromEntries([...names, ...others].map((name) => [name, element(name)])) as never, {
      activeUpgrades: () => active, slotTier: () => 1, secondQueueUnlocked: () => true, thirdQueueUnlocked: () => false,
      gemBalance: () => 0n, equippedIn: () => "", localIdentity: () => "player",
      playerPosition: () => ({ x: 0, y: 0 }), startUpgrade,
      beforeOpen: vi.fn(), clearPlayerInput: vi.fn(), setPaused: vi.fn(), showMessage: vi.fn(),
    } as never);
    controller.observeUpgradeTier("HAND", 1);
    expect(controller.finishedUpgradeWaiting()).toBe(true);
    controller.open();
    element("queueOne").click();
    (element("pickerItems").querySelector("button") as HTMLElement).click();
    element("action").click();
    await vi.waitFor(() => expect(startUpgrade).toHaveBeenCalledTimes(1));
    expect(controller.finishedUpgradeWaiting()).toBe(true);
    element("action").click();
    await vi.waitFor(() => expect(startUpgrade).toHaveBeenCalledTimes(2));
    expect(controller.finishedUpgradeWaiting()).toBe(true);
    element("queueTwo").click();
    (element("pickerItems").querySelector("button") as HTMLElement).click();
    element("action").click();
    await vi.waitFor(() => expect(startUpgrade).toHaveBeenCalledTimes(3));
    expect(controller.finishedUpgradeWaiting()).toBe(false);
  });

  it("offers slot three for 200 Gems only after slot two, and shows no dot while every unlocked slot runs", async () => {
    const names = ["inventory", "queueOne", "queueTwo", "queueThree", "action", "speedUp", "back", "closePicker"];
    const others = ["panel", "prompt", "statGain", "timer", "picker", "pickerItems"];
    const { document } = parseHTML(`<html><body>${names.map((name) => `<button id="${name}"></button>`).join("")}${others.map((name) => `<div id="${name}"></div>`).join("")}</body></html>`);
    vi.stubGlobal("document", document);
    const element = (name: string) => document.getElementById(name)!;
    element("panel").hidden = true;
    let secondUnlocked = false;
    let thirdUnlocked = false;
    let active: ActiveItemUpgrade[] = [job(1, 1_000, "HAND"), job(2, 1_000, "HEAD")];
    const confirmUnlock = vi.fn(async () => true);
    const unlockThirdQueue = vi.fn(async () => { thirdUnlocked = true; return { ok: true }; });
    const startUpgrade = vi.fn(async (slot: 1 | 2 | 3, itemId: string) => {
      active = [...active, job(slot, 1_000, itemId)];
      return { ok: true };
    });
    const controller = createSlotUpgradesController(Object.fromEntries([...names, ...others].map((name) => [name, element(name)])) as never, {
      activeUpgrades: () => active, slotTier: () => 0,
      secondQueueUnlocked: () => secondUnlocked, thirdQueueUnlocked: () => thirdUnlocked,
      gemBalance: () => 200n, equippedIn: () => "", localIdentity: () => "player",
      playerPosition: () => ({ x: 0, y: 0 }), startUpgrade, unlockThirdQueue,
      confirmUnlock, beforeOpen: vi.fn(), clearPlayerInput: vi.fn(), setPaused: vi.fn(), showMessage: vi.fn(),
    } as never);
    controller.open();
    expect(element("queueThree").hidden).toBe(true);
    secondUnlocked = true;
    controller.render();
    expect(element("queueThree").hidden).toBe(false);
    expect(element("queueThree").getAttribute("aria-label")).toContain("200 Gems");
    controller.observeUpgradeTier("CHEST", 1);
    // Both unlocked slots are running and slot three is not bought: nothing to start, so no dot.
    expect(controller.finishedUpgradeWaiting()).toBe(false);
    element("queueThree").click();
    await vi.waitFor(() => expect(unlockThirdQueue).toHaveBeenCalledOnce());
    expect(confirmUnlock).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("200 Gems") }));
    expect(element("picker").hidden).toBe(false);
    (element("pickerItems").querySelector("button") as HTMLElement).click();
    element("action").click();
    await vi.waitFor(() => expect(startUpgrade).toHaveBeenCalledWith(3, "CHEST", expect.anything()));
    expect(controller.finishedUpgradeWaiting()).toBe(false);
  });

  it("drops a remembered dot once the player's only queue is busy again, however it was started", () => {
    const names = ["inventory", "queueOne", "queueTwo", "queueThree", "action", "speedUp", "back", "closePicker"];
    const others = ["panel", "prompt", "statGain", "timer", "picker", "pickerItems"];
    const { document } = parseHTML(`<html><body>${names.map((name) => `<button id="${name}"></button>`).join("")}${others.map((name) => `<div id="${name}"></div>`).join("")}</body></html>`);
    vi.stubGlobal("document", document);
    const values = new Map<string, string>([["wildstat-upgrade-finished:player", JSON.stringify({ waiting: true, jobs: [] })]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    let active: ActiveItemUpgrade[] = [];
    let secondUnlocked = false;
    const controller = createSlotUpgradesController(Object.fromEntries([...names, ...others].map((name) => [name, document.getElementById(name)!])) as never, {
      activeUpgrades: () => active, slotTier: () => 0, nowMs: () => 100, localIdentity: () => "player", storage,
      secondQueueUnlocked: () => secondUnlocked, thirdQueueUnlocked: () => false,
    } as never);
    // A finish from an earlier session is still waiting and the queue is free.
    expect(controller.finishedUpgradeWaiting()).toBe(true);
    // The next tier was started from another tab: the one queue is busy, so the dot goes, for good.
    active = [job(1, 5_000, "HEAD")];
    expect(controller.finishedUpgradeWaiting()).toBe(false);
    expect(JSON.parse(values.get("wildstat-upgrade-finished:player")!).waiting).toBe(false);
    active = [];
    expect(controller.finishedUpgradeWaiting()).toBe(false);
    // With a second queue bought, one running job leaves a queue free.
    const other = createSlotUpgradesController(Object.fromEntries([...names, ...others].map((name) => [name, document.getElementById(name)!])) as never, {
      activeUpgrades: () => active, slotTier: () => 0, nowMs: () => 100, localIdentity: () => "other", storage,
      secondQueueUnlocked: () => secondUnlocked, thirdQueueUnlocked: () => false,
    } as never);
    values.set("wildstat-upgrade-finished:other", JSON.stringify({ waiting: true, jobs: [] }));
    secondUnlocked = true;
    active = [job(1, 5_000, "HEAD")];
    expect(other.finishedUpgradeWaiting()).toBe(true);
  });
  it("can start an upgrade only with a free queue and a slot below its last tier", () => {
    const one = (slot: 1 | 2 | 3) => slot === 1;
    const two = (slot: 1 | 2 | 3) => slot !== 3;
    const tiers = (tier: Partial<Record<string, number>>) => (slot: string) => tier[slot] ?? 0;
    const maxed = tiers({ HAND: MAX_SLOT_UPGRADE_TIER, HEAD: MAX_SLOT_UPGRADE_TIER, CHEST: MAX_SLOT_UPGRADE_TIER });
    // Every slot at its last tier: nothing to put in a queue.
    expect(slotUpgradeCanStart([], one, maxed)).toBe(false);
    expect(slotUpgradeCanStart([], two, maxed)).toBe(false);
    // One slot below max and a free queue.
    expect(slotUpgradeCanStart([], one, tiers({ HAND: MAX_SLOT_UPGRADE_TIER, HEAD: MAX_SLOT_UPGRADE_TIER, CHEST: 34 }))).toBe(true);
    // The only queue is busy.
    expect(slotUpgradeCanStart([job(1, 500, "CHEST")], one, tiers({}))).toBe(false);
    // A second queue is free, but the only unfinished slot is already in the first one.
    expect(slotUpgradeCanStart([job(1, 500, "CHEST")], two, tiers({ HAND: MAX_SLOT_UPGRADE_TIER, HEAD: MAX_SLOT_UPGRADE_TIER }))).toBe(false);
    expect(slotUpgradeCanStart([job(1, 500, "CHEST")], two, tiers({ HAND: MAX_SLOT_UPGRADE_TIER }))).toBe(true);
  });

  it("drops the red dot when the last tier finishes and every slot is maxed", () => {
    const names = ["inventory", "queueOne", "queueTwo", "queueThree", "action", "speedUp", "back", "closePicker"];
    const others = ["panel", "prompt", "statGain", "timer", "picker", "pickerItems"];
    const { document } = parseHTML(`<html><body>${names.map((name) => `<button id="${name}"></button>`).join("")}${others.map((name) => `<div id="${name}"></div>`).join("")}</body></html>`);
    vi.stubGlobal("document", document);
    const values = new Map<string, string>([["wildstat-upgrade-finished:player", JSON.stringify({ waiting: true, jobs: [] })]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const tier: Record<string, number> = { HAND: MAX_SLOT_UPGRADE_TIER, HEAD: MAX_SLOT_UPGRADE_TIER, CHEST: MAX_SLOT_UPGRADE_TIER - 1 };
    const finished = vi.fn();
    const controller = createSlotUpgradesController(Object.fromEntries([...names, ...others].map((name) => [name, document.getElementById(name)!])) as never, {
      activeUpgrades: () => [], slotTier: (slot: string) => tier[slot], nowMs: () => 100, localIdentity: () => "player", storage,
      secondQueueUnlocked: () => true, thirdQueueUnlocked: () => true, onUpgradeFinished: finished,
    } as never);
    // A remembered finish with CHEST still one tier short: the dot stays.
    expect(controller.finishedUpgradeWaiting()).toBe(true);
    // CHEST reaches its last tier: the toast still fires, but there is nothing left to start.
    tier.CHEST = MAX_SLOT_UPGRADE_TIER;
    controller.observeUpgradeTier("CHEST", MAX_SLOT_UPGRADE_TIER);
    expect(finished).toHaveBeenCalledWith(expect.objectContaining({ itemId: "CHEST", targetLevel: MAX_SLOT_UPGRADE_TIER }));
    expect(controller.finishedUpgradeWaiting()).toBe(false);
    expect(JSON.parse(values.get("wildstat-upgrade-finished:player")!).waiting).toBe(false);
    // Disconnected, the cleared state is what is remembered.
    expect(controller.finishedUpgradeWaiting(false)).toBe(false);
  });
});

describe("Slot Upgrades inside a host window", () => {
  it("opens and closes through the host, and leaves Back to it", () => {
    const names = ["queueOne", "queueTwo", "queueThree", "action", "speedUp", "back", "closePicker"];
    const others = ["panel", "prompt", "statGain", "timer", "picker", "pickerItems"];
    const { document } = parseHTML(`<html><body>${names.map((name) => `<button id="${name}"></button>`).join("")}${others.map((name) => `<div id="${name}" ${name === "panel" ? "hidden" : ""}></div>`).join("")}</body></html>`);
    vi.stubGlobal("document", document);
    const element = (name: string) => document.getElementById(name)!;
    const host = { open: vi.fn(), close: vi.fn() };
    const controller = createSlotUpgradesController({
      panel: element("panel"), prompt: element("prompt"), queueOne: element("queueOne") as HTMLButtonElement,
      queueTwo: element("queueTwo") as HTMLButtonElement, queueThree: element("queueThree") as HTMLButtonElement,
      statGain: element("statGain"), timer: element("timer"), action: element("action") as HTMLButtonElement,
      speedUp: element("speedUp") as HTMLButtonElement, back: element("back") as HTMLButtonElement,
      picker: element("picker"), pickerItems: element("pickerItems"), closePicker: element("closePicker") as HTMLButtonElement,
    }, {
      playerPosition: () => ({ x: 0, y: 0 }), currentMapId: () => "town", stationMapId: "town", stationPosition: { x: 0, y: 0 },
      activeUpgrades: () => [], secondQueueUnlocked: () => false, thirdQueueUnlocked: () => false, gemBalance: () => 0n,
      upgradeLevel: () => 0, slotTier: () => 0, equippedIn: () => "",
      startUpgrade: vi.fn(), cancelUpgrade: vi.fn(), speedUpUpgrade: vi.fn(), unlockSecondQueue: vi.fn(), unlockThirdQueue: vi.fn(),
      beforeOpen: vi.fn(), clearPlayerInput: vi.fn(), setPaused: vi.fn(), onInventoryChanged: vi.fn(), showMessage: vi.fn(), host,
    });
    // The station asks the host; the view shows once the host puts it on screen.
    controller.open();
    expect(host.open).toHaveBeenCalledTimes(1);
    expect(controller.isOpen()).toBe(false);
    controller.setShown(true);
    expect(controller.isOpen()).toBe(true);
    expect(element("prompt").textContent).toBe("Pick A Queue");
    expect(element("back").hidden).toBe(true);
    expect(element("queueTwo").getAttribute("aria-label")).toBe("Unlock A Second Queue For 150 Gems");
    controller.close();
    expect(host.close).toHaveBeenCalledTimes(1);
    expect(controller.isOpen()).toBe(false);
  });
});
