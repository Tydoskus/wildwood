import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createProfileIconPicker } from "./profile-icon-picker";
import { applyProfileIcon, createProfileIconCanvasPainter } from "../app/profile-icons";
import { PROFILE_ICON_BLACK_BACKGROUND, isValidProfileIcon, profileIconLocation } from "../../shared/profile-icons";
import { OBJECT_ATLAS_SIZE, OBJECT_ICON_CROPS, containedIconRect, objectIconCrop } from "../app/profile-icon-crops";

beforeEach(() => {
  const { document, window } = parseHTML('<html><body><div><div id="choices"></div></div></body></html>');
  vi.stubGlobal("document", document); vi.stubGlobal("window", window);
});
afterEach(() => vi.unstubAllGlobals());

function fixture(selected = 0, setIcon = vi.fn(async (_icon: number) => ({ ok: true }))) {
  const choices = document.getElementById("choices")!;
  const onSaved = vi.fn(), onBackgroundSaved = vi.fn(), onError = vi.fn();
  const state = { selected };
  // Like the profile directory, a successful save becomes the selected icon.
  const save = vi.fn(async (icon: number) => {
    const result = await setIcon(icon);
    if (result?.ok) state.selected = icon;
    return result;
  });
  const picker = createProfileIconPicker(choices, { selectedIcon: () => state.selected, paintIcon: applyProfileIcon, setIcon: save, onSaved, onBackgroundSaved, onError });
  picker.open();
  const background = (key: "white" | "black") => document.querySelector<HTMLButtonElement>(`.profile-icon-background-choice [data-background="${key}"]`)!;
  return { choices, picker, setIcon, onSaved, onBackgroundSaved, onError, state, background };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

it("preserves old portraits and maps every new sheet boundary consistently", () => {
  for (const [index, sheet, cell] of [[0,0,0], [63,0,63], [64,1,0], [127,1,63], [128,2,0], [191,2,63], [192,3,0], [255,3,63]]) {
    const location = profileIconLocation(index);
    expect(location.sheetIndex).toBe(sheet); expect(location.cell).toBe(cell);
    const element = document.createElement("span"); applyProfileIcon(element, index);
    expect((element.querySelector<HTMLElement>(".profile-icon-art") ?? element).style.backgroundImage).toContain(location.path);
    expect(element.dataset.profileIcon).toBe(String(index));
    expect(isValidProfileIcon(index)).toBe(true);
  }
  for (const invalid of [-1, 256, NaN, Infinity, 1.5]) expect(isValidProfileIcon(invalid)).toBe(false);
});

it("offers all people and objects separately and opens the selected category", () => {
  const f = fixture(191);
  // Both object sheets, the newer first.
  expect(f.choices.children).toHaveLength(128);
  expect(f.choices.firstElementChild?.getAttribute("data-profile-icon")).toBe("192");
  expect(f.choices.querySelector('[aria-pressed="true"]')?.getAttribute("data-profile-icon")).toBe("191");
  document.getElementById("profile-icon-tab-people")!.click();
  expect(f.choices.children).toHaveLength(128);
  expect(f.choices.firstElementChild?.getAttribute("data-profile-icon")).toBe("64");
  expect(f.choices.querySelector('[data-profile-icon="63"]')).not.toBeNull();
});

it("contains the full tent and book without exposing them in neighboring avatars", () => {
  const tent = OBJECT_ICON_CROPS[46], book = OBJECT_ICON_CROPS[62];
  expect(tent.x).toBeLessThan(923); expect(tent.x + tent.width).toBeGreaterThan(1103);
  expect(book.x).toBeLessThan(932); expect(book.x + book.width).toBeGreaterThan(1093);
  expect(OBJECT_ICON_CROPS).toHaveLength(64);
  for (const crop of OBJECT_ICON_CROPS) {
    expect(crop.x).toBeGreaterThanOrEqual(0); expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(OBJECT_ATLAS_SIZE);
    expect(crop.y + crop.height).toBeLessThanOrEqual(OBJECT_ATLAS_SIZE);
    const fitted = containedIconRect(crop);
    expect(fitted.x).toBeGreaterThan(0); expect(fitted.y).toBeGreaterThan(0);
    expect(fitted.x + fitted.width).toBeLessThan(1); expect(fitted.y + fitted.height).toBeLessThan(1);
    expect(fitted.width / fitted.height).toBeCloseTo(crop.width / crop.height);
  }
  // Adjacent selections must sample their own artwork, not the tent/book overhang.
  expect(OBJECT_ICON_CROPS[45].x + OBJECT_ICON_CROPS[45].width).toBeLessThan(tent.x);
  expect(OBJECT_ICON_CROPS[47].x).toBeGreaterThan(tent.x + tent.width);
  expect(OBJECT_ICON_CROPS[61].x + OBJECT_ICON_CROPS[61].width).toBeLessThan(book.x);
  const element = document.createElement("span");
  applyProfileIcon(element, 174);
  expect(element.style.backgroundImage).toBe("none");
  expect(element.querySelectorAll(".profile-icon-art")).toHaveLength(1);
  applyProfileIcon(element, 190);
  expect(element.querySelectorAll(".profile-icon-art")).toHaveLength(1);
  applyProfileIcon(element, 2);
  expect(element.querySelector(".profile-icon-art")).toBeNull();
  expect(element.classList.contains("profile-icon-cropped")).toBe(false);
});

it("crops every object on the second sheet inside the atlas without taking in a neighbour", () => {
  const crops = Array.from({ length: 64 }, (_, cell) => objectIconCrop("assets/wildstat/profile-objects-grid-v2-alpha.webp", cell)!);
  for (const [cell, crop] of crops.entries()) {
    expect(crop, String(cell)).toBeDefined();
    expect(crop.x).toBeGreaterThanOrEqual(0); expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(OBJECT_ATLAS_SIZE); expect(crop.y + crop.height).toBeLessThanOrEqual(OBJECT_ATLAS_SIZE);
    if (cell % 8) expect(crops[cell - 1].x + crops[cell - 1].width, String(cell)).toBeLessThanOrEqual(crop.x);
    if (cell >= 8) expect(crops[cell - 8].y + crops[cell - 8].height, String(cell)).toBeLessThanOrEqual(crop.y);
  }
  const element = document.createElement("span");
  applyProfileIcon(element, 192);
  expect(element.querySelector<HTMLElement>(".profile-icon-art")?.style.backgroundImage).toContain("profile-objects-grid-v2");
});

it("keeps the picker available after a failed save and prevents duplicate requests", async () => {
  let finish!: (result: { ok: boolean }) => void;
  const setIcon = vi.fn(() => new Promise<{ ok: boolean }>(resolve => { finish = resolve; }));
  const f = fixture(0, setIcon);
  const button = f.choices.firstElementChild as HTMLButtonElement;
  button.click(); button.click();
  expect(setIcon).toHaveBeenCalledTimes(1); expect(button.disabled).toBe(true);
  finish({ ok: false }); await flush();
  expect(f.onError).toHaveBeenCalledOnce(); expect(button.disabled).toBe(false);
  button.click(); finish({ ok: true }); await flush();
  expect(f.onSaved).toHaveBeenCalledOnce();
});

it("ignores a save completion after the picker was closed and reopened", async () => {
  let finish!: (result: { ok: boolean }) => void;
  const f = fixture(0, vi.fn(() => new Promise<{ ok: boolean }>(resolve => { finish = resolve; })));
  (f.choices.firstElementChild as HTMLButtonElement).click();
  f.picker.close(); f.picker.open(); finish({ ok: true }); await flush();
  expect(f.onSaved).not.toHaveBeenCalled();
  expect(f.choices.hasAttribute("aria-busy")).toBe(false);
});

it("loads canvas sheets once on demand and paints the correct cell after loading", () => {
  const images: any[] = [];
  class FakeImage {
    complete = false; naturalWidth = 1254; naturalHeight = 1254; src = "";
    loaded?: () => void;
    constructor() { images.push(this); }
    addEventListener(_event: string, listener: () => void) { this.loaded = listener; }
  }
  vi.stubGlobal("Image", FakeImage);
  const context = { fillRect: vi.fn(), fillStyle: "", drawImage: vi.fn(), imageSmoothingEnabled: false };
  const canvas = { width: 40, height: 40, getContext: () => context } as unknown as HTMLCanvasElement;
  const loaded = vi.fn(), paint = createProfileIconCanvasPainter(loaded);
  paint(canvas, 128); paint(canvas, 191);
  expect(images).toHaveLength(1); expect(images[0].src).toContain("profile-objects-grid");
  expect(context.drawImage).not.toHaveBeenCalled();
  images[0].complete = true; images[0].loaded(); paint(canvas, 191);
  expect(loaded).toHaveBeenCalledOnce();
  expect(context.drawImage.mock.calls[0][1]).toBeGreaterThan(7 * 1254 / 8);
  paint(canvas, 174);
  const tentDraw = context.drawImage.mock.calls.at(-1)!;
  expect(tentDraw.slice(1, 5)).toEqual([921, 801, 184, 129]);
  expect(tentDraw[7]).toBeCloseTo(37.6);
  expect(tentDraw[8]).toBeLessThan(37.6);
  paint(canvas, 64); paint(canvas, 0);
  expect(images).toHaveLength(3);
});

it("shows the backdrop as a White / Black choice that saves the current picture on it", async () => {
  const f = fixture(42);
  const segment = document.querySelector(".profile-icon-background-choice")!;
  expect(segment.getAttribute("role")).toBe("radiogroup");
  expect(document.getElementById(segment.getAttribute("aria-labelledby")!)?.textContent).toBe("Background");
  expect([...segment.querySelectorAll("button")].map(button => button.textContent)).toEqual(["White", "Black"]);
  // It sits above the picture tabs, which sit above the pictures.
  expect(segment.parentElement?.nextElementSibling?.className).toBe("profile-icon-tabs");
  expect(f.background("white").getAttribute("aria-checked")).toBe("true");
  expect(f.background("black").getAttribute("aria-checked")).toBe("false");
  expect(f.choices.querySelector<HTMLElement>('[data-profile-icon="42"]')?.dataset.profileBackground).toBe("white");

  f.background("black").click(); await flush();
  expect(f.setIcon).toHaveBeenCalledExactlyOnceWith(42 | PROFILE_ICON_BLACK_BACKGROUND);
  expect(f.onBackgroundSaved).toHaveBeenCalledOnce();
  expect(f.onSaved).not.toHaveBeenCalled();
  expect(f.background("black").getAttribute("aria-checked")).toBe("true");
  // Every choice previews the new backdrop, and the same picture stays selected.
  expect([...f.choices.querySelectorAll<HTMLElement>(".profile-icon-choice")].every(choice => choice.dataset.profileBackground === "black")).toBe(true);
  expect(f.choices.querySelector('[aria-pressed="true"]')?.getAttribute("data-profile-icon")).toBe("42");

  f.background("black").click(); await flush();
  expect(f.setIcon).toHaveBeenCalledOnce();
});

it("keeps the chosen backdrop when another picture is picked", async () => {
  const f = fixture(7 | PROFILE_ICON_BLACK_BACKGROUND);
  expect(f.background("black").getAttribute("aria-checked")).toBe("true");
  expect(f.choices.querySelector('[aria-pressed="true"]')?.getAttribute("data-profile-icon")).toBe("7");
  f.choices.querySelector<HTMLButtonElement>('[data-profile-icon="9"]')!.click(); await flush();
  expect(f.setIcon).toHaveBeenCalledExactlyOnceWith(9 | PROFILE_ICON_BLACK_BACKGROUND);
  expect(f.onSaved).toHaveBeenCalledOnce();
  f.background("white").click(); await flush();
  expect(f.setIcon).toHaveBeenLastCalledWith(9);
});

it("locks the backdrop choice while a save is pending and keeps it after a failure", async () => {
  let finish!: (result: { ok: boolean }) => void;
  const f = fixture(3, vi.fn(() => new Promise<{ ok: boolean }>(resolve => { finish = resolve; })));
  f.background("black").click();
  expect(f.background("white").disabled).toBe(true);
  expect((f.choices.firstElementChild as HTMLButtonElement).disabled).toBe(true);
  f.background("black").click(); (f.choices.firstElementChild as HTMLButtonElement).click();
  expect(f.setIcon).toHaveBeenCalledOnce();
  finish({ ok: false }); await flush();
  expect(f.onError).toHaveBeenCalledOnce(); expect(f.onBackgroundSaved).not.toHaveBeenCalled();
  expect(f.background("white").disabled).toBe(false);
  expect(f.background("white").getAttribute("aria-checked")).toBe("true");
});

it("moves between the backdrops with the arrow keys", async () => {
  const f = fixture(5);
  const event = Object.assign(new window.Event("keydown", { bubbles: true, cancelable: true }), { key: "ArrowRight" });
  f.background("white").dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await flush();
  expect(f.setIcon).toHaveBeenCalledExactlyOnceWith(5 | PROFILE_ICON_BLACK_BACKGROUND);
  // Roving focus: only the checked backdrop is in the tab order (linkedom reads tabIndex back as -1, so read the attribute).
  expect([f.background("white").getAttribute("tabindex"), f.background("black").getAttribute("tabindex")]).toEqual(["-1", "0"]);
});

it("draws each portrait on its own backdrop", () => {
  const element = document.createElement("span");
  applyProfileIcon(element, 174 | PROFILE_ICON_BLACK_BACKGROUND);
  expect(element.dataset.profileIcon).toBe("174");
  expect(element.dataset.profileBackground).toBe("black");
  expect(element.style.backgroundColor).toBe("#000000");
  expect(element.querySelector<HTMLElement>(".profile-icon-art")?.style.backgroundImage).toContain("profile-objects-grid-v1-alpha.webp");
  applyProfileIcon(element, 12);
  expect(element.dataset.profileBackground).toBe("white");
  expect(element.style.backgroundColor).toBe("#ffffff");
  expect(element.style.backgroundImage).toContain("profile-portraits-grid-v2-alpha.webp");
  // An unknown flag is no backdrop: the default silhouette on White.
  applyProfileIcon(element, 12 | 0x20000);
  expect([element.dataset.profileIcon, element.dataset.profileBackground]).toEqual(["0", "white"]);
});

it("paints a canvas portrait's backdrop before its picture, loaded or not", () => {
  const images: any[] = [];
  class FakeImage {
    complete = false; naturalWidth = 1254; naturalHeight = 1254; src = "";
    constructor() { images.push(this); }
    addEventListener() {}
  }
  vi.stubGlobal("Image", FakeImage);
  const fills: string[] = [];
  const context = {
    fillStyle: "", imageSmoothingEnabled: false, drawImage: vi.fn(),
    fillRect: vi.fn(function (this: { fillStyle: string }) { fills.push(this.fillStyle); }),
  };
  const canvas = { width: 25, height: 25, getContext: () => context } as unknown as HTMLCanvasElement;
  const paint = createProfileIconCanvasPainter(() => {});
  paint(canvas, 3 | PROFILE_ICON_BLACK_BACKGROUND);
  expect(fills).toEqual(["#000000"]); expect(context.fillRect).toHaveBeenCalledWith(0, 0, 25, 25);
  expect(context.drawImage).not.toHaveBeenCalled();
  images[0].complete = true;
  paint(canvas, 3);
  expect(fills).toEqual(["#000000", "#ffffff"]);
  expect(context.fillRect.mock.invocationCallOrder[1]).toBeLessThan(context.drawImage.mock.invocationCallOrder[0]);
});
