import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createGameActionsController } from "./game-actions-controller";
import { BASIC_PAPER_HAT, STARTER_STONE } from "../game/inventory";

type Dependencies = Parameters<typeof createGameActionsController>[0];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function setup() {
  const { document } = parseHTML("<html><body></body></html>");
  const elements = Object.fromEntries([
    "settingsButton", "settingsPanel", "closeSettingsButton", "inventoryButton", "inventoryPanel", "closeInventoryButton", "shopButton", "resetProgressButton", "bootUpgrade", "bootUpgradeClose", "closeDuelResultButton", "closeDuelReplayButton",
  ].map(name => [name, document.createElement("button")])) as unknown as Dependencies["elements"];
  const events: string[] = [];
  const deps = {
    elements,
    inventory: { itemIds: ["old-sword"], equippedHead: "old-hat", equippedChest: "", equippedFeet: "", equippedRightHand: "old-sword", equippedLeftHand: "", cosmeticHead: "", cosmeticChest: "", cosmeticFeet: "", cosmeticRightHand: "", cosmeticLeftHand: "", selectedItemId: "" },
    closeCompetingWindows: vi.fn(), minimizeChat: vi.fn(), prepareInventoryOpen: vi.fn(), closeItemInspection: vi.fn(), renderInventory: vi.fn(), logPickup: vi.fn(), showMessage: vi.fn(), leaveDuelResult: vi.fn(), closeDuelReplay: vi.fn(), closeBootUpgrade: vi.fn(),
    resetServerProgress: vi.fn(async () => { events.push("server"); return { ok: true } as { ok: boolean; error?: string; restartError?: string }; }),
    setResetPending: vi.fn(), clearProgressState: vi.fn(() => { events.push("clear"); }), setTotalKills: vi.fn(), setBootsCollected: vi.fn(), clearPlayerInput: vi.fn(),
    resetGame: vi.fn(async () => { events.push("tutorial"); }), stopGame: vi.fn(() => { events.push("stop"); }), restartStartup: vi.fn(() => { events.push("startup"); }), hideGameOver: vi.fn(), refreshFrameClock: vi.fn(),
    escapeWindows: {} as Dependencies["escapeWindows"],
  } satisfies Dependencies;
  vi.stubGlobal("confirm", vi.fn(() => true));
  createGameActionsController(deps);
  return { deps, events, click: () => elements.resetProgressButton.dispatchEvent(new document.defaultView!.Event("click")) };
}
async function settled() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
afterEach(() => vi.unstubAllGlobals());

describe("character reset actions", () => {
  it("keeps local progress and equipment when the server rejects the reset", async () => {
    const h = setup(); h.deps.resetServerProgress.mockResolvedValue({ ok: false, error: "Offline. Reconnect and try again." });
    h.click(); await settled();
    expect(h.deps.clearProgressState).not.toHaveBeenCalled();
    expect(h.deps.inventory.itemIds).toEqual(["old-sword"]);
    expect(h.deps.stopGame).not.toHaveBeenCalled();
    expect(h.deps.restartStartup).not.toHaveBeenCalled();
    expect(h.deps.showMessage).toHaveBeenCalledWith(expect.stringContaining("Reconnect and try again"), expect.any(String));
    expect(h.deps.setResetPending).toHaveBeenLastCalledWith(false);
    expect(h.deps.elements.resetProgressButton.hasAttribute("disabled")).toBe(false);
  });
  it("blocks duplicate clicks and input while waiting for server acknowledgement", async () => {
    const h = setup(); const response = deferred<{ ok: boolean }>(); h.deps.resetServerProgress.mockReturnValue(response.promise);
    h.click(); h.click(); await settled();
    expect(h.deps.resetServerProgress).toHaveBeenCalledTimes(1);
    expect(h.deps.clearProgressState).not.toHaveBeenCalled();
    expect(h.deps.clearPlayerInput).toHaveBeenCalled();
    expect(h.deps.setResetPending).toHaveBeenLastCalledWith(true);
    response.resolve({ ok: true }); await settled();
    expect(h.deps.inventory.itemIds).toEqual([BASIC_PAPER_HAT, STARTER_STONE]);
  });
  it("loads the tutorial after success and waits for it before restarting", async () => {
    const h = setup(); const assets = deferred<void>();
    h.deps.resetGame.mockImplementation(async () => { h.events.push("tutorial"); await assets.promise; });
    h.click(); await settled();
    expect(h.events).toEqual(["server", "stop", "clear", "tutorial"]);
    expect(h.deps.restartStartup).not.toHaveBeenCalled();
    assets.resolve(); await settled();
    expect(h.events).toEqual(["server", "stop", "clear", "tutorial", "startup"]);
  });
  it("reports a restart failure after commit without pretending the old progress remains", async () => {
    const h = setup(); h.deps.resetGame.mockRejectedValue(new Error("Map art unavailable"));
    h.click(); await settled();
    expect(h.deps.showMessage).toHaveBeenCalledWith(expect.stringContaining("Progress reset, but the restart could not finish. Reload"), expect.any(String));
    expect(h.deps.restartStartup).not.toHaveBeenCalled();
  });
  it("keeps gameplay stopped when reset committed but the fresh tutorial route failed", async () => {
    const h = setup(); h.deps.resetServerProgress.mockResolvedValue({ ok: true, restartError: "Tutorial connection timed out" });
    h.click(); await settled();
    expect(h.deps.clearProgressState).toHaveBeenCalledOnce();
    expect(h.deps.resetGame).toHaveBeenCalledOnce();
    expect(h.deps.stopGame).toHaveBeenCalledOnce();
    expect(h.deps.restartStartup).not.toHaveBeenCalled();
    expect(h.deps.showMessage).toHaveBeenCalledWith(expect.stringContaining("Reload the game"), expect.any(String));
  });

});
