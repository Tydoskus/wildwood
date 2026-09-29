import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createPlayerVisibilityToggle } from "./player-visibility-toggle";
import { createFullscreenMovementGate } from "./fullscreen-movement";

afterEach(() => vi.useRealTimers());
function setup(saved: string | null = null) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
  const { document } = parseHTML('<button></button>');
  const button = document.querySelector("button") as unknown as HTMLButtonElement;
  const setVisible = vi.fn();
  const storage = { getItem: () => saved, setItem: vi.fn() };
  const toggle = createPlayerVisibilityToggle({ button, setVisible, storage });
  return { button, setVisible, storage, toggle };
}

it("restores always-off and blocks rapid toggles for five seconds", () => {
  const state = setup("false");
  expect(state.button.disabled).toBe(false);
  expect(state.setVisible.mock.calls).toEqual([[false]]);
  state.button.click();
  expect(state.setVisible).toHaveBeenLastCalledWith(true);
  expect(state.storage.setItem).toHaveBeenLastCalledWith("wildstat-show-other-players", "true");
  expect(state.button.disabled).toBe(true);
  expect(state.button.textContent).toBe("5");
  state.button.click();
  vi.advanceTimersByTime(4_999);
  state.button.click();
  expect(state.setVisible).toHaveBeenCalledTimes(2);
  expect(state.button.disabled).toBe(true);
  vi.advanceTimersByTime(1);
  expect(state.button.disabled).toBe(false);
  expect(state.button.textContent).toBe("");
  state.button.click();
  expect(state.setVisible).toHaveBeenLastCalledWith(false);
  expect(state.button.disabled).toBe(true);
  state.toggle.dispose();
});

it("comes back on for a player who left it on, and stays off for one who turned it off", () => {
  // Every reload and update used to start the eye off, so a whole map that
  // had it on came back unable to see each other.
  const on = setup("true");
  expect(on.setVisible.mock.calls).toEqual([[true]]);
  expect(on.button.getAttribute("aria-pressed")).toBe("true");
  expect(on.storage.setItem).not.toHaveBeenCalled();
  on.toggle.dispose();
  const off = setup("false");
  expect(off.setVisible.mock.calls).toEqual([[false]]);
  expect(off.button.getAttribute("aria-pressed")).toBe("false");
  off.toggle.dispose();
});

it("turns itself on once when the tutorial is finished", () => {
  // The one automatic switch-on there is: a new player should leave their
  // first fight and see the others around them.
  const state = setup();
  expect(state.setVisible.mock.calls).toEqual([[false]]);
  state.toggle.enableForTutorial();
  expect(state.setVisible).toHaveBeenLastCalledWith(true);
  expect(state.button.getAttribute("aria-pressed")).toBe("true");
  // Only once: it never overrides a later choice to switch off.
  state.button.click();
  state.toggle.enableForTutorial();
  expect(state.setVisible).toHaveBeenLastCalledWith(false);
  state.toggle.dispose();
});

it("idle-hides a session the player switched on, without changing their chosen mode", () => {
  const state = setup();
  state.toggle.enableForTutorial();
  state.storage.setItem.mockClear();
  state.setVisible.mockClear();
  vi.advanceTimersByTime(300_000);
  expect(state.setVisible).toHaveBeenLastCalledWith(false);
  expect(state.storage.setItem).not.toHaveBeenCalled();
  expect(state.button.getAttribute("aria-pressed")).toBe("true");
  expect(state.button.dataset.state).toBe("idle");
  expect(state.button.querySelector(".player-visibility-idle")?.textContent).toBe("idle");
  state.toggle.noteManualMovement();
  expect(state.setVisible).toHaveBeenLastCalledWith(true);
  expect(state.button.dataset.state).toBe("on");
  expect(state.button.querySelector(".player-visibility-idle")?.textContent).toBe("");
  for (let i = 0; i < 1000; i++) state.toggle.noteManualMovement();
  expect(state.setVisible).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(300_000);
  expect(state.button.dataset.state).toBe("idle");
  state.toggle.dispose();
});

it("clicking an idle eye chooses always-off rather than waking it", () => {
  const state = setup("true");
  state.toggle.enableForTutorial();
  vi.advanceTimersByTime(300_000);
  state.button.click();
  expect(state.button.dataset.state).toBe("off");
  expect(state.button.getAttribute("aria-pressed")).toBe("false");
  expect(state.storage.setItem).toHaveBeenLastCalledWith("wildstat-show-other-players", "false");
  vi.advanceTimersByTime(300_000);
  state.toggle.noteManualMovement();
  expect(state.setVisible).toHaveBeenLastCalledWith(false);
  state.toggle.dispose();
});

it("expires while chatting, stays off when chat closes, and wakes on manual movement", () => {
  vi.useFakeTimers();
  const { document, window } = parseHTML('<button></button>');
  const button = document.querySelector("button") as unknown as HTMLButtonElement;
  const apply = vi.fn(), gate = createFullscreenMovementGate(apply);
  const toggle = createPlayerVisibilityToggle({ button, setVisible: gate.setWanted, storage: { getItem: () => "true", setItem: vi.fn() } });
  toggle.enableForTutorial();
  gate.setFullscreen(true);
  for (let i = 0; i < 5; i++) {
    vi.advanceTimersByTime(60_000);
    document.dispatchEvent(new window.Event("input"));
    document.dispatchEvent(new window.Event("wheel"));
  }
  expect(button.dataset.state).toBe("idle");
  gate.setFullscreen(false);
  // It starts on (the player left it on), idles out while chatting, and stays out once chat closes.
  expect(apply.mock.calls).toEqual([[true], [false]]);
  toggle.noteManualMovement();
  expect(button.getAttribute("aria-pressed")).toBe("true");
  expect(apply.mock.calls).toEqual([[true], [false], [true]]);
  toggle.dispose(); gate.dispose();
});

it("manual movement never overrides always-off, even after cooldown or reload", () => {
  const state = setup("false");
  state.toggle.noteManualMovement();
  vi.advanceTimersByTime(600_000);
  state.toggle.noteManualMovement();
  expect(state.setVisible.mock.calls).toEqual([[false]]);
  expect(state.button.dataset.state).toBe("off");
  state.button.click();
  expect(state.setVisible).toHaveBeenLastCalledWith(true);
  vi.advanceTimersByTime(5_000);
  state.button.click();
  vi.advanceTimersByTime(600_000);
  state.toggle.noteManualMovement();
  expect(state.setVisible.mock.calls).toEqual([[false], [true], [false]]);
  expect(state.storage.setItem).toHaveBeenLastCalledWith("wildstat-show-other-players", "false");
  state.toggle.dispose();
});

it("stays on through an update, and comes back on after it", () => {
  const state = setup(null);
  state.toggle.enableForTutorial();
  state.storage.setItem.mockClear(); state.setVisible.mockClear();
  state.toggle.suspend();
  expect(state.setVisible).not.toHaveBeenCalled();
  expect(state.storage.setItem).not.toHaveBeenCalled();
  expect(state.button.getAttribute("aria-pressed")).toBe("true");
  // Moving must not wake an idle eye for a client on its way out.
  state.toggle.noteManualMovement();
  expect(state.setVisible).not.toHaveBeenCalled();
  // The next page reads what this one kept.
  const next = setup("true");
  expect(next.setVisible.mock.calls).toEqual([[true]]);
  expect(next.button.dataset.state).toBe("on");
});
