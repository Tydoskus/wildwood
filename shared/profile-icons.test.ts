import { expect, it } from "vitest";
import {
  PROFILE_ICON_BLACK_BACKGROUND, PROFILE_ICON_COUNT, encodeProfileIcon, isValidProfileIcon, normalizeProfileIcon,
  profileIconBackground, profileIconIndex, profileIconLocation, withProfileIconBackground,
} from "./profile-icons";

it("keeps every icon saved before the backdrop choice on White, unchanged", () => {
  for (const icon of [0, 1, 63, 64, 191, 192, PROFILE_ICON_COUNT - 1]) {
    expect(isValidProfileIcon(icon)).toBe(true);
    expect(normalizeProfileIcon(icon)).toBe(icon);
    expect([profileIconIndex(icon), profileIconBackground(icon)]).toEqual([icon, "white"]);
    expect(encodeProfileIcon(icon, "white")).toBe(icon);
  }
});

it("stores the Black backdrop in bit 16 of the same number, beside the picture", () => {
  expect(PROFILE_ICON_BLACK_BACKGROUND).toBe(65536);
  for (const index of [0, 42, 192, PROFILE_ICON_COUNT - 1]) {
    const black = encodeProfileIcon(index, "black");
    expect(black).toBe(index + 65536);
    expect(isValidProfileIcon(black)).toBe(true);
    expect(normalizeProfileIcon(black)).toBe(black);
    expect([profileIconIndex(black), profileIconBackground(black)]).toEqual([index, "black"]);
    expect(withProfileIconBackground(black, "white")).toBe(index);
    expect(withProfileIconBackground(index, "black")).toBe(black);
    const location = profileIconLocation(black);
    expect([location.index, location.background, location.path]).toEqual([index, "black", profileIconLocation(index).path]);
  }
  // Fits the u32 column with room for 65,536 pictures.
  expect(encodeProfileIcon(PROFILE_ICON_COUNT - 1, "black")).toBeLessThan(2 ** 32);
});

it("rejects pictures outside the catalogue and any other bit, flagged or not", () => {
  for (const invalid of [-1, PROFILE_ICON_COUNT, 65536 + PROFILE_ICON_COUNT, 0x20000, 0x20000 + 5, 0x30000, 2 ** 31, 2 ** 32 - 1, NaN, Infinity]) {
    expect(isValidProfileIcon(invalid), String(invalid)).toBe(false);
    expect(normalizeProfileIcon(invalid), String(invalid)).toBe(0);
  }
  // Fractions are never valid to save, and are read rounded down, as before.
  for (const fraction of [1.5, 65536.5]) expect(isValidProfileIcon(fraction)).toBe(false);
  expect([normalizeProfileIcon(1.5), normalizeProfileIcon(65536.5)]).toEqual([1, 65536]);
  // A garbled value falls back to the default silhouette on White, never to Black.
  expect(profileIconBackground(0x30000 + 5)).toBe("white");
  expect(encodeProfileIcon(PROFILE_ICON_COUNT, "black")).toBe(PROFILE_ICON_BLACK_BACKGROUND);
});

it("reads as the default silhouette, not another picture, in a client from before the choice", () => {
  // normalizeProfileIcon as 0.901.9 shipped it: the backdrop bit makes the value invalid there.
  const shippedCount = 256;
  const shippedNormalize = (value: number) => Number.isFinite(value) && Number.isInteger(Math.floor(value))
    && Math.floor(value) >= 0 && Math.floor(value) < shippedCount ? Math.floor(value) : 0;
  for (const index of [0, 42, 255]) expect(shippedNormalize(encodeProfileIcon(index, "black"))).toBe(0);
  expect(shippedNormalize(encodeProfileIcon(42, "white"))).toBe(42);
});
