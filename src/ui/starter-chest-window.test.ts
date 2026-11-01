import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createStarterChestRuntime, createStarterChestWindow } from "./starter-chest-window";
import { STARTER_CHEST_POSITION, type StarterWeaponKind } from "../../shared/starter-chest";
import { TUTORIAL_FOREST_MAP_ID } from "../../shared/rules";
import { GRADE_ITEM_DEFINITIONS } from "../../shared/grade-equipment";
import { createStarterChestRenderer, starterChestScene, withStarterChest } from "../game/runtime/render/starter-chest-renderer";
afterEach(() => { vi.unstubAllGlobals(); starterChestScene.waiting = false; });

function page() {
  const { document, window } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("document", document); vi.stubGlobal("HTMLElement", window.HTMLElement);
  return document;
}
/** linkedom has no modal dialogs: open is the attribute. */
function modal(document: Document) {
  const dialog = document.querySelector("dialog") as unknown as HTMLDialogElement;
  Object.assign(dialog, { showModal() { dialog.setAttribute("open", ""); }, close() { dialog.removeAttribute("open"); } });
  Object.defineProperty(dialog, "open", { get: () => dialog.hasAttribute("open") });
  return dialog;
}
const cards = (dialog: HTMLDialogElement) => [...dialog.querySelectorAll<HTMLElement>(".starter-chest-card")];

it("shows three cards, a Crude Bow, Sword and Staff, each with art, school and what it does", () => {
  const document = page();
  const chest = createStarterChestWindow({ choose: vi.fn(), showMessage: vi.fn() });
  const dialog = modal(document);
  chest.open();
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector(".window-banner")!.textContent).toBe("Choose Your Weapon");
  expect(cards(dialog).map(card => [card.querySelector("strong")!.textContent, card.querySelector(".smith-shop-grade")!.textContent])).toEqual([
    ["Crude Bow", "Archery"], ["Crude Sword", "Swordplay"], ["Crude Staff", "Sorcery"],
  ]);
  // The sword's card gives the bonus the Crude Sword really has, not its 1.5x over the bow.
  const swordBonus = Number((1 + GRADE_ITEM_DEFINITIONS.crude_sword.weapon!.damageMultiplierBonus!).toFixed(2));
  expect(cards(dialog)[1].querySelector(".smith-shop-stat")!.textContent).toContain(`×${swordBonus}`);
  for (const card of cards(dialog)) expect(card.querySelector(".smith-shop-art .inventory-item-art"), card.dataset.kind).toBeTruthy();
});

it("sends the pick and closes once the server takes it; a refusal keeps the window open and says why", async () => {
  const document = page();
  let answer = { ok: false, error: "Walk up to the Starter Chest first." };
  const choose = vi.fn(async (_kind: StarterWeaponKind) => answer), showMessage = vi.fn();
  const chest = createStarterChestWindow({ choose, showMessage });
  const dialog = modal(document);
  chest.open();
  const pick = (index: number) => cards(dialog)[index].querySelector<HTMLButtonElement>(".starter-chest-pick")!;
  pick(1).click();
  await vi.waitFor(() => expect(showMessage).toHaveBeenCalledWith("Walk up to the Starter Chest first.", "#ffbc91"));
  expect(choose).toHaveBeenCalledWith("sword");
  expect(dialog.open).toBe(true);
  expect(pick(1).disabled).toBe(false);
  answer = { ok: true, error: "" };
  pick(2).click();
  await vi.waitFor(() => expect(dialog.open).toBe(false));
  expect(choose).toHaveBeenLastCalledWith("staff");
  expect(showMessage).toHaveBeenLastCalledWith("The Crude Staff is yours. Every kill trains Sorcery.", "#ffffff");
});

it("opens as the player's feet reach the waiting chest, once per visit, with a hint on the first visit", () => {
  const document = page();
  let waiting = true, inForest = true;
  const player = { x: STARTER_CHEST_POSITION.x + 300, y: STARTER_CHEST_POSITION.y - 29 };
  const showMessage = vi.fn();
  const runtime = createStarterChestRuntime({ coop: () => ({ starterChestWaiting: () => waiting }), player, inForest: () => inForest, showMessage });
  const dialog = modal(document);
  runtime.update();
  expect(starterChestScene.waiting).toBe(true);
  expect(showMessage).toHaveBeenCalledOnce();
  expect(dialog.open).toBe(false);
  player.x = STARTER_CHEST_POSITION.x;
  runtime.update();
  expect(dialog.open).toBe(true);
  runtime.close();
  runtime.update();
  // Standing still at it after Back does not reopen it; walking away and back does.
  expect(dialog.open).toBe(false);
  player.x += 300; runtime.update();
  player.x -= 300; runtime.update();
  expect(dialog.open).toBe(true);
  expect(showMessage).toHaveBeenCalledOnce();
  // Opened: the chest goes, and so does the window.
  waiting = false;
  runtime.update();
  expect(dialog.open).toBe(false);
  expect(starterChestScene.waiting).toBe(false);
  player.x += 300; runtime.update(); player.x -= 300; runtime.update();
  expect(dialog.open).toBe(false);
  // Out of the forest nothing opens, even standing on the same spot.
  waiting = true; inForest = false; player.x += 300; runtime.update(); player.x -= 300; runtime.update();
  expect(dialog.open).toBe(false);
});

it("stands in the forest only, and is drawn with its name only while it waits", () => {
  expect(withStarterChest([], TUTORIAL_FOREST_MAP_ID)).toEqual([{ type: "starterChest", ...STARTER_CHEST_POSITION, s: 1 }]);
  expect(withStarterChest([], "town")).toEqual([]);
  expect(withStarterChest([], "soul_dimension")).toEqual([]);
  vi.stubGlobal("Image", class { complete = true; naturalWidth = 62; decoding = ""; src = ""; });
  const ctx = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), textAlign: "", textBaseline: "", font: "" };
  const outlinedText = vi.fn();
  const draw = createStarterChestRenderer({ ctx: ctx as never, camera: { x: 0, y: 0, zoom: 1 } as never, devicePixelRatio: () => 1, time: () => 0, outlinedText });
  const item = { type: "starterChest" as const, ...STARTER_CHEST_POSITION, s: 1 };
  draw(item);
  expect(ctx.drawImage).not.toHaveBeenCalled();
  expect(outlinedText).not.toHaveBeenCalled();
  starterChestScene.waiting = true;
  draw(item);
  expect(ctx.drawImage).toHaveBeenCalledOnce();
  expect(outlinedText.mock.calls.map(([text]) => text)).toEqual(["Starter Chest", "Pick Your Weapon"]);
});
