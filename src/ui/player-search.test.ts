import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createPlayerSearch } from "./player-search";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function setup() {
  vi.useFakeTimers();
  const { window, document } = parseHTML("<html><body></body></html>");
  // linkedom keeps no focus, so the test says which element has it.
  let focused: Element | null = null;
  Object.defineProperty(document, "activeElement", { get: () => focused, configurable: true });
  vi.stubGlobal("window", Object.assign(window, { setTimeout: globalThis.setTimeout }));
  vi.stubGlobal("document", document);
  const onPick = vi.fn();
  const players = [{ identity: "a", name: "Nibbles5844", key: "nibbles5844" }, { identity: "b", name: "Nibs", key: "nibs" }];
  const search = createPlayerSearch({ load: () => Promise.resolve(players), onPick, label: "Search players" });
  document.body.append(search.root);
  const event = (target: EventTarget, type: string, props: Record<string, unknown> = {}) =>
    target.dispatchEvent(Object.assign(new window.Event(type, { bubbles: true, cancelable: true }), props));
  focused = search.input;
  event(search.input, "focus");
  await vi.runAllTimersAsync();
  search.input.value = "nib";
  event(search.input, "input");
  const option = () => document.querySelector<HTMLElement>(".player-search-option")!;
  const results = () => document.querySelector<HTMLElement>(".player-search-results")!;
  return { search, onPick, event, option, results, blur: () => { focused = null; event(search.input, "blur"); } };
}

it("picks a name on a phone, where the tap moves focus off the field before its click", async () => {
  const s = await setup();
  expect(s.results().hidden).toBe(false);
  const tapped = s.option();
  s.event(tapped, "pointerdown", { pointerType: "touch", clientX: 50, clientY: 20 });
  // The phone blurs the field first; the list waits a beat rather than vanishing under the finger.
  s.blur();
  expect(s.results().hidden).toBe(false);
  s.event(tapped, "pointerup", { pointerType: "touch", clientX: 52, clientY: 21 });
  expect(s.onPick).toHaveBeenCalledWith({ identity: "a", name: "Nibbles5844" });
  // The click that follows the release does not pick again.
  s.event(tapped, "click");
  expect(s.onPick).toHaveBeenCalledTimes(1);
});

it("does not pick when the finger moved to scroll the list, and closes the list after the beat", async () => {
  const s = await setup();
  const tapped = s.option();
  s.event(tapped, "pointerdown", { pointerType: "touch", clientX: 50, clientY: 20 });
  s.event(tapped, "pointerup", { pointerType: "touch", clientX: 50, clientY: 80 });
  expect(s.onPick).not.toHaveBeenCalled();
  s.blur();
  await vi.advanceTimersByTimeAsync(250);
  expect(s.results().hidden).toBe(true);
});

it("still picks with a mouse click", async () => {
  const s = await setup();
  const clicked = s.option();
  s.event(clicked, "pointerdown", { pointerType: "mouse", clientX: 50, clientY: 20 });
  s.event(clicked, "pointerup", { pointerType: "mouse", clientX: 50, clientY: 20 });
  expect(s.onPick).not.toHaveBeenCalled();
  s.event(clicked, "click");
  expect(s.onPick).toHaveBeenCalledTimes(1);
});
