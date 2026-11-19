import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { CROSSING_MAX_POINTS, CROSSING_STEPS, type GuildCrossingSnapshot } from "../../shared/guild-crossing";
import { createGuildCrossingView } from "./guild-crossing";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function makeSnap(overrides: Partial<GuildCrossingSnapshot> = {}): GuildCrossingSnapshot {
  return {
    week: 2928,
    day: 20500,
    resetsAtMs: Date.now() + 86_400_000 * 3,
    nextDayAtMs: Date.now() + 3_600_000 * 6,
    guildId: "7",
    guildName: "OAKS",
    guildEmblem: 2,
    memberCount: 20,
    steps: CROSSING_STEPS,
    revealed: 2,
    completed: false,
    pointsAwarded: 0,
    maxPoints: CROSSING_MAX_POINTS,
    fallsCount: 1,
    dailyLimit: 1,
    usedToday: 0,
    remainingToday: 1,
    winnerName: null,
    revealedSides: ["left", "right"],
    falls: [{ step: 0, side: "right", name: "Rymel", identity: "0xrymel", profileIcon: 1, atMs: 1_000 }],
    pioneers: [{ step: 1, side: "right", name: "Aria", identity: "0xaria", profileIcon: 3 }],
    winner: null,
    currentStreak: 0,
    bestStreak: 2,
    ...overrides,
  };
}

describe("Glass Crossing UI", () => {
  it("renders fallen memorials on shattered tiles and advances frontier when stepping safely or shattering", async () => {
    vi.useFakeTimers();
    const { document } = parseHTML("<html><body><section id='dlg'></section></body></html>");
    const dialog = document.getElementById("dlg")! as unknown as HTMLElement;
    let current = makeSnap();
    const loadCrossing = vi.fn(async () => current);
    const stepCrossing = vi.fn(async (expectedStep: number, side: "left" | "right" | "finish") => {
      expect(expectedStep).toBe(2);
      expect(side).toBe("left");
      current = makeSnap({
        revealed: 3,
        revealedSides: ["left", "right", "left"],
        pioneers: [...current.pioneers, { step: 2, side: "left", name: "Mossheart", identity: "0xmoss", profileIcon: 0 }],
        currentStreak: 1,
      });
      return current;
    });
    const onBack = vi.fn();

    createGuildCrossingView(dialog, {
      doc: document as unknown as Document,
      api: () => ({ loadCrossing, stepCrossing }),
      applyPortrait: () => {},
      onBack,
    });
    await vi.runAllTimersAsync();

    // Fallen guildmate Rymel is displayed on shattered Step 1 (index 0) and in the Fallen Heroes strip.
    expect(dialog.textContent).toContain("Rymel");
    expect(dialog.querySelectorAll(".crossing-tile--frontier")).toHaveLength(2);

    // Tap Left on Step 3 (index 2).
    const leftBtn = dialog.querySelector<HTMLButtonElement>('[data-step="2"][data-side="left"]')!;
    leftBtn.click();
    await vi.advanceTimersByTimeAsync(500);

    expect(stepCrossing).toHaveBeenCalledWith(2, "left");
    expect(dialog.querySelector('[data-step="3"][data-side="left"]')).toBeTruthy();
    expect(dialog.textContent).toContain("Streak ×1");

    // Back button reports `changed = true`.
    dialog.querySelector<HTMLButtonElement>(".window-back-button")!.click();
    expect(onBack).toHaveBeenCalledWith(true);
  });
});
