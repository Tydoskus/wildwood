import { describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createPrestigeUnlockPopup, prestigeLevelToAnnounce, prestigeUnlockStorageKey, screenIsBusy } from "./prestige-unlock-popup";

const IDENTITY = "c200abc";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function setup(options: {
  level?: number; campaign?: boolean; endless?: number; ready?: boolean; blocked?: boolean;
  storage?: ReturnType<typeof memoryStorage>; run?: () => Promise<any>; html?: string;
} = {}) {
  const { document } = parseHTML(`<html><body>${options.html ?? ""}</body></html>`);
  const state = {
    level: options.level ?? 0, campaign: options.campaign ?? true, endless: options.endless ?? 0,
    ready: options.ready ?? true, blocked: options.blocked ?? false, time: 10_000,
  };
  const storage = options.storage ?? memoryStorage();
  const runPrestige = vi.fn(options.run ?? (async () => { state.level += 1; state.campaign = false; return { ok: true }; }));
  const showMessage = vi.fn();
  const pause = vi.fn();
  const popup = createPrestigeUnlockPopup({
    root: document as unknown as Document, storage, now: () => state.time, settleMs: 1_000,
    identity: () => IDENTITY, ready: () => state.ready, blocked: () => state.blocked,
    level: () => state.level, campaignComplete: () => state.campaign, completedEndless: () => state.endless,
    runPrestige, showMessage, pause,
  });
  const overlay = document.getElementById("prestigeUnlock") as any;
  const pick = (selector: string) => overlay.querySelector(selector) as any;
  /** One HUD tick after `ms` have passed. */
  const tick = (ms = 0) => { state.time += ms; popup.poll(); };
  /** Polls until the settle delay has passed, the way the HUD tick would. */
  const settle = () => { tick(); tick(1_000); };
  return { document, popup, overlay, pick, state, storage, runPrestige, showMessage, pause, tick, settle };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("which prestige level is due", () => {
  it("asks for the campaign first and one Endless stage more for each level after", () => {
    expect(prestigeLevelToAnnounce({ level: 0, campaignComplete: false, completedEndless: 0, announced: 0 })).toBe(0);
    expect(prestigeLevelToAnnounce({ level: 0, campaignComplete: true, completedEndless: 0, announced: 0 })).toBe(1);
    expect(prestigeLevelToAnnounce({ level: 1, campaignComplete: true, completedEndless: 0, announced: 1 })).toBe(0);
    expect(prestigeLevelToAnnounce({ level: 1, campaignComplete: true, completedEndless: 1, announced: 1 })).toBe(2);
    expect(prestigeLevelToAnnounce({ level: 3, campaignComplete: true, completedEndless: 3, announced: 3 })).toBe(4);
  });

  it("never names a level already announced", () => {
    expect(prestigeLevelToAnnounce({ level: 1, campaignComplete: true, completedEndless: 1, announced: 2 })).toBe(0);
  });
});

describe("prestige unlock popup", () => {
  it("opens when the boss's unlock arrives, after the kill has had its moment", () => {
    const s = setup({ campaign: false });
    s.settle();
    expect(s.overlay.hidden).toBe(true);
    // Aegis Prime falls: the campaign row updates and the next tick sees it.
    s.state.campaign = true;
    s.tick();
    expect(s.overlay.hidden).toBe(true);
    s.tick(999);
    expect(s.overlay.hidden).toBe(true);
    s.tick(1);
    expect(s.overlay.hidden).toBe(false);
    expect(s.pick("#prestigeUnlockTitle").textContent).toBe("Prestige 1");
    expect(s.pick("#prestigeUnlockKicker").textContent).toBe("UNLOCKED");
    expect(s.pick(".prestige-unlock-badge").textContent).toBe("1");
    expect(s.pick(".prestige-unlock-reward").textContent).toBe("You would earn +10% stat gain and 1 perk point.");
    expect(s.pick(".prestige-cost").textContent).toContain("resets your stats and map unlocks");
    expect(s.pause).toHaveBeenLastCalledWith(true);
  });

  it("announces each level once per identity", () => {
    const s = setup();
    s.settle();
    expect(s.popup.isOpen()).toBe(true);
    expect(s.storage.values.get(prestigeUnlockStorageKey(IDENTITY))).toBe("1");
    s.tick(1_000);
    s.pick(".prestige-unlock-later-button").click();
    expect(s.popup.isOpen()).toBe(false);
    expect(s.pause).toHaveBeenLastCalledWith(false);
    for (let i = 0; i < 5; i++) s.tick(1_000);
    expect(s.popup.isOpen()).toBe(false);
  });

  it("does not show again after a reload or reconnect", () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    first.settle();
    expect(first.popup.isOpen()).toBe(true);
    const reloaded = setup({ storage });
    reloaded.settle();
    reloaded.tick(5_000);
    expect(reloaded.popup.isOpen()).toBe(false);
  });

  it("shows on startup for an eligible account that was never told about this level", () => {
    const s = setup({ level: 2, endless: 2, storage: memoryStorage({ [prestigeUnlockStorageKey(IDENTITY)]: "2" }) });
    s.settle();
    expect(s.pick("#prestigeUnlockTitle").textContent).toBe("Prestige 3");
  });

  it("stays shut when the level was already announced", () => {
    const s = setup({ storage: memoryStorage({ [prestigeUnlockStorageKey(IDENTITY)]: "1" }) });
    s.settle();
    s.tick(5_000);
    expect(s.popup.isOpen()).toBe(false);
  });

  it("keeps each identity's record apart", () => {
    const s = setup({ storage: memoryStorage({ [prestigeUnlockStorageKey("someone-else")]: "5" }) });
    s.settle();
    expect(s.popup.isOpen()).toBe(true);
  });

  it("waits for the account's rows before judging anything", () => {
    const s = setup({ ready: false });
    s.settle();
    expect(s.popup.isOpen()).toBe(false);
    expect(s.storage.values.size).toBe(0);
    s.state.ready = true;
    s.settle();
    expect(s.popup.isOpen()).toBe(true);
  });

  it("does not mistake a reconnect's missing prestige row for level 0", () => {
    const storage = memoryStorage();
    // A prestige-3 account with the campaign done but not yet Endless 3.
    const s = setup({ level: 3, endless: 1, storage });
    s.settle();
    expect(s.popup.isOpen()).toBe(false);
    // Reconnecting: the prestige row is gone for a moment, the campaign row is not.
    s.state.level = 0;
    s.settle();
    s.tick(5_000);
    expect(s.popup.isOpen()).toBe(false);
    expect(storage.values.get(prestigeUnlockStorageKey(IDENTITY))).toBe("3");
  });

  it("queues behind a paused game, another window, a cutscene, a duel and the death screen", () => {
    const s = setup({ blocked: true, html: `
      <div id="gameOver" hidden></div>
      <div id="guild" hidden><section role="dialog" aria-modal="true"></section></div>
      <dialog id="mail"></dialog>` });
    s.settle();
    s.tick(5_000);
    expect(s.popup.isOpen()).toBe(false);
    // Queued, not spent: a reload while it waits must still show it.
    expect(s.storage.values.get(prestigeUnlockStorageKey(IDENTITY))).toBeUndefined();

    s.state.blocked = false;
    const blockers: [string, () => void, () => void][] = [
      ["window", () => { s.document.getElementById("guild")!.hidden = false; }, () => { s.document.getElementById("guild")!.hidden = true; }],
      ["mailbox", () => { s.document.getElementById("mail")!.setAttribute("open", ""); }, () => { s.document.getElementById("mail")!.removeAttribute("open"); }],
      ["cutscene", () => { s.document.body.classList.add("is-cutscene"); }, () => { s.document.body.classList.remove("is-cutscene"); }],
      ["duel", () => { s.document.body.classList.add("is-dueling"); }, () => { s.document.body.classList.remove("is-dueling"); }],
      ["game over", () => { s.document.getElementById("gameOver")!.hidden = false; }, () => { s.document.getElementById("gameOver")!.hidden = true; }],
    ];
    for (const [name, on, off] of blockers) {
      on();
      s.tick(1_000);
      expect(s.popup.isOpen(), name).toBe(false);
      off();
    }
    s.tick();
    expect(s.popup.isOpen()).toBe(true);
  });

  it("does not count its own window as something in the way", () => {
    const { document } = parseHTML(`<html><body><div hidden><section role="dialog"></section></div></body></html>`);
    expect(screenIsBusy(document as unknown as Document)).toBe(false);
    document.body.classList.add("is-replaying");
    expect(screenIsBusy(document as unknown as Document)).toBe(true);
  });

  it("announces the next level once its Endless stage is cleared", () => {
    const s = setup({ level: 1, endless: 0, storage: memoryStorage({ [prestigeUnlockStorageKey(IDENTITY)]: "1" }) });
    s.settle();
    expect(s.popup.isOpen()).toBe(false);
    s.state.endless = 1;
    s.settle();
    expect(s.pick("#prestigeUnlockTitle").textContent).toBe("Prestige 2");
    expect(s.pick(".prestige-unlock-reward").textContent).toBe("You would earn +10% stat gain (+20% total) and 1 perk point.");
  });
});

describe("prestiging from the unlock popup", () => {
  it("arms on the first press and prestiges through the same call on the second", async () => {
    const s = setup();
    s.settle();
    const confirm = s.pick(".prestige-unlock-confirm");
    // The tail of whatever tapping was going on when it opened does nothing.
    confirm.click();
    expect(confirm.textContent).toBe("Prestige now");
    s.tick(1_000);

    confirm.click();
    expect(s.runPrestige).not.toHaveBeenCalled();
    expect(confirm.textContent).toBe("Yes, prestige");
    expect(confirm.classList.contains("is-armed")).toBe(true);
    expect(s.pick(".prestige-status").textContent).toBe("This cannot be undone.");

    // The second half of a double tap is not a confirmation.
    confirm.click();
    expect(s.runPrestige).not.toHaveBeenCalled();

    s.state.time += 500;
    confirm.click();
    await flush();
    expect(s.runPrestige).toHaveBeenCalledTimes(1);
    expect(s.popup.isOpen()).toBe(false);
    expect(s.showMessage).toHaveBeenCalledWith("Prestige 1 complete.");
    expect(s.pause).toHaveBeenLastCalledWith(false);
  });

  it("keeps the window open and says why when the server refuses", async () => {
    const s = setup({ run: async () => ({ ok: false, error: "Clear the Endless 1 boss to prestige." }) });
    s.settle();
    s.tick(1_000);
    const confirm = s.pick(".prestige-unlock-confirm");
    confirm.click();
    s.state.time += 500;
    confirm.click();
    await flush();
    expect(s.popup.isOpen()).toBe(true);
    expect(s.pick(".prestige-status").textContent).toBe("Clear the Endless 1 boss to prestige.");
    expect(confirm.textContent).toBe("Prestige now");
    expect(confirm.disabled).toBe(false);
  });

  it("reports a thrown call the way the panel does", async () => {
    const s = setup({ run: async () => { throw new Error("socket"); } });
    s.settle();
    s.tick(1_000);
    const confirm = s.pick(".prestige-unlock-confirm");
    confirm.click();
    s.state.time += 500;
    confirm.click();
    await flush();
    expect(s.pick(".prestige-status").textContent).toBe("Couldn't prestige. Please try again.");
  });

  it("Later closes it and disarms without prestiging", () => {
    const s = setup();
    s.settle();
    s.tick(1_000);
    s.pick(".prestige-unlock-confirm").click();
    s.pick(".prestige-unlock-later-button").click();
    expect(s.popup.isOpen()).toBe(false);
    expect(s.runPrestige).not.toHaveBeenCalled();
    expect(s.pick(".prestige-unlock-confirm").textContent).toBe("Prestige now");
  });

  it("previews without recording anything or resetting anything", async () => {
    const s = setup({ campaign: false, level: 4 });
    s.popup.preview();
    expect(s.popup.isOpen()).toBe(true);
    expect(s.pick("#prestigeUnlockTitle").textContent).toBe("Prestige 5");
    s.tick(1_000);
    const confirm = s.pick(".prestige-unlock-confirm");
    confirm.click();
    s.state.time += 500;
    confirm.click();
    await flush();
    expect(s.runPrestige).not.toHaveBeenCalled();
    expect(s.pick(".prestige-status").textContent).toContain("Preview only");
    expect(s.storage.values.size).toBe(0);
  });
});

it("is not held back by the loading class, which the page never removes", () => {
  const { document } = parseHTML('<html><body class="is-loading-game-assets has-webgl-world"></body></html>');
  expect(screenIsBusy(document as unknown as Document)).toBe(false);
});
