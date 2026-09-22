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

it("restores the saved preference without a map restriction or startup cooldown", () => {
  const state = setup("true");
  expect(state.setVisible).toHaveBeenLastCalledWith(true);
  expect(state.button.disabled).toBe(false);
  expect(state.button.getAttribute("aria-pressed")).toBe("true");
  state.button.click();
  expect(state.setVisible).toHaveBeenLastCalledWith(false);
  state.toggle.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it("starts new players on and idle-hides without changing their chosen mode", () => {
  const state = setup();
  expect(state.setVisible.mock.calls).toEqual([[true]]);
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
  expect(state.setVisible).toHaveBeenCalledTimes(3);
  vi.advanceTimersByTime(300_000);
  expect(state.button.dataset.state).toBe("idle");
  state.toggle.dispose();
});

it("clicking an idle eye chooses always-off rather than waking it", () => {
  const state = setup("true");
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
  gate.setFullscreen(true);
  for (let i = 0; i < 5; i++) {
    vi.advanceTimersByTime(60_000);
    document.dispatchEvent(new window.Event("input"));
    document.dispatchEvent(new window.Event("wheel"));
  }
  expect(button.dataset.state).toBe("idle");
  gate.setFullscreen(false);
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

it("hides for an update without recording a choice, and stays hidden until the reload", () => {
  const state = setup(null);
  expect(state.setVisible.mock.calls).toEqual([[true]]);
  state.storage.setItem.mockClear();

  state.toggle.suspend();
  expect(state.setVisible).toHaveBeenLastCalledWith(false);
  // An update reconnects everyone at once, so the next start comes back off.
  expect(state.storage.setItem).toHaveBeenCalledWith("wildstat-show-other-players", "false");

  // Moving must not bring presence back for a client on its way out.
  state.setVisible.mockClear();
  state.toggle.noteManualMovement();
  expect(state.setVisible).not.toHaveBeenCalled();
});

it("starts the session after an update with multiplayer off", () => {
  const first = setup(null);
  first.toggle.suspend();
  expect(first.setVisible).toHaveBeenLastCalledWith(false);
  expect(first.storage.setItem).toHaveBeenCalledWith("wildstat-show-other-players", "false");
  // The next start reads what the update wrote, so the reconnecting crowd does
  // not all arrive visible at once. One tap puts it back.
  const next = setup("false");
  expect(next.setVisible.mock.calls).toEqual([[false]]);
  expect(next.button.dataset.state).toBe("off");
});
