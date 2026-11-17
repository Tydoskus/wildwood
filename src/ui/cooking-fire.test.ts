import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createCookingFire } from "./cooking-fire";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture(count: number) {
  vi.useFakeTimers();
  const { document } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("document", document);
  const stock = { minnow: count };
  const cook = vi.fn(async (_fish: string, _recipe: string, begin: boolean) => {
    if (!begin) stock.minnow--;
    return { ok: true };
  });
  const fire = createCookingFire({ ores: () => stock, xp: () => 0n, cook });
  const dialog = document.querySelector("dialog")!;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  const click = (selector: string) => dialog.querySelector<HTMLButtonElement>(selector)!.click();
  return { dialog, click, stock, fire, cook };
}

it("dismisses the empty fire and picks up a newly received ingredient", () => {
  const f = fixture(0);
  expect(f.fire.hasFish()).toBe(false);
  f.fire.open();
  f.click(".cook-back");
  expect(f.fire.isOpen()).toBe(false);
  f.fire.open();
  f.stock.minnow = 1;
  f.fire.refresh();
  expect(f.dialog.querySelector(".cook-recipe")).toBeTruthy();
});

it("serves each portion on its own timer and cancels the next when leaving", async () => {
  const f = fixture(3);
  f.fire.open();
  f.dialog.querySelector("input")!.checked = true;
  f.click(".cook-recipe");
  await vi.advanceTimersByTimeAsync(2999);
  expect(f.stock.minnow).toBe(3);
  await vi.advanceTimersByTimeAsync(1);
  expect(f.stock.minnow).toBe(2);
  expect(f.cook.mock.calls.map(call => call[2])).toEqual([true, false, true]);
  f.click(".cook-back");
  await vi.advanceTimersByTimeAsync(4000);
  expect(f.stock.minnow).toBe(2);
});

it("returns to the world after serving the last fish", async () => {
  const f = fixture(1);
  f.fire.open();
  f.click(".cook-recipe");
  await vi.advanceTimersByTimeAsync(3000);
  expect(f.stock.minnow).toBe(0);
  expect(f.fire.isOpen()).toBe(false);
});
