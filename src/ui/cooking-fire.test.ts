import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createCookingFire } from "./cooking-fire";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture(stock: Record<string, number>, xp = 0n, burn = false) {
  vi.useFakeTimers();
  const { document } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("document", document);
  let curXp = xp;
  const cook = vi.fn(async (fish: string, recipe: string, begin: boolean) => {
    if (!begin) {
      const cost = recipe === "cakes" ? 2 : 1;
      stock[fish] = Math.max(0, (stock[fish] ?? 0) - cost);
      if (!burn) {
        const portions = recipe === "cakes" ? 3 : 1;
        stock[`cooked_${fish}`] = (stock[`cooked_${fish}`] ?? 0) + portions;
        curXp += 5n;
      }
    }
    return { ok: true };
  });
  const fire = createCookingFire({ ores: () => stock, xp: () => curXp, skillet: () => 2, cook });
  const dialog = document.querySelector("dialog")!;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  const click = (selector: string) => dialog.querySelector<HTMLButtonElement>(selector)!.click();
  return { dialog, click, stock, fire, cook };
}

it("dismisses the empty fire and picks up newly caught fish", () => {
  const f = fixture({ minnow: 0 });
  expect(f.fire.hasFish()).toBe(false);
  f.fire.open();
  f.click(".cook-back");
  expect(f.fire.isOpen()).toBe(false);
  f.fire.open();
  f.stock.minnow = 1;
  f.fire.refresh();
  expect(f.dialog.querySelector(".cook-recipe")).toBeTruthy();
});

it("roasts individual fish one-by-one in Cook All mode and cancels cleanly when leaving", async () => {
  const f = fixture({ minnow: 3 });
  f.fire.open();
  f.click('[data-mode="all"]');
  f.click(".cook-recipe");
  await vi.advanceTimersByTimeAsync(2999);
  expect(f.stock.minnow).toBe(3);
  await vi.advanceTimersByTimeAsync(1);
  expect(f.stock.minnow).toBe(2);
  expect(f.cook.mock.calls.map(call => [call[0], call[1], call[2]])).toEqual([
    ["minnow", "skewer", true],
    ["minnow", "skewer", false],
    ["minnow", "skewer", true],
  ]);
  f.click(".cook-back");
  await vi.advanceTimersByTimeAsync(4000);
  expect(f.stock.minnow).toBe(2);
});

it("cooks across multiple fish kinds via Cook All Fish and supports optional special recipes", async () => {
  const f = fixture({ minnow: 1, perch: 2 }, 5_000n);
  f.fire.open();
  const bagBtn = f.dialog.querySelector<HTMLButtonElement>(".cook-bag-btn")!;
  expect(bagBtn.hidden).toBe(false);
  bagBtn.click();
  await vi.advanceTimersByTimeAsync(3000);
  expect(f.stock.minnow).toBe(0);
  await vi.advanceTimersByTimeAsync(3000);
  expect(f.stock.perch).toBe(1);
  await vi.advanceTimersByTimeAsync(3000);
  expect(f.stock.perch).toBe(0);
  expect(f.stock.cooked_minnow).toBe(1);
  expect(f.stock.cooked_perch).toBe(2);
  expect(f.fire.isOpen()).toBe(false);
});

it("renders fish images, locks high-level fish, opens secondary windows, and reports burns", async () => {
  const f = fixture({ minnow: 1, shark: 2 }, 0n, true);
  f.fire.open();
  const cards = [...f.dialog.querySelectorAll<HTMLButtonElement>(".cook-fish-tile")];
  expect(cards).toHaveLength(2);
  expect(cards[0].querySelector("img")?.getAttribute("src")).toContain("assets/wildstat/fish/minnow.webp");
  expect(cards[0].disabled).toBe(false);
  expect(cards[1].disabled).toBe(true);
  expect(cards[1].textContent).toContain("Cook Lv 74");

  // Secondary windows open cleanly from the top strip.
  f.click(".cook-open-recipes");
  const recipesDialog = document.querySelector<HTMLDialogElement>(".cook-recipes-sheet")!;
  expect(recipesDialog.open).toBe(true);
  recipesDialog.querySelector<HTMLButtonElement>(".cook-sub-back")!.click();
  expect(recipesDialog.open).toBe(false);

  // Burn reporting when raw fish is consumed with no cooked output.
  cards[0].click();
  await vi.advanceTimersByTimeAsync(3000);
  expect(f.stock.minnow).toBe(0);
  expect(f.stock.cooked_minnow ?? 0).toBe(0);
});
