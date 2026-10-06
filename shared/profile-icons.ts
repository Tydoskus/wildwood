export type ProfileIconCategory = "people" | "objects";
export const PROFILE_ICON_GRID = 8;
export const PROFILE_ICONS_PER_SHEET = PROFILE_ICON_GRID ** 2;
// Append sheets so every previously saved icon keeps its original appearance.
export const PROFILE_ICON_SHEETS = [
  { path: "assets/wildstat/profile-portraits-grid-v2.webp", category: "people" },
  { path: "assets/wildstat/profile-portraits-varied-v1.webp", category: "people" },
  { path: "assets/wildstat/profile-objects-grid-v1.webp", category: "objects" },
  { path: "assets/wildstat/profile-objects-grid-v2.webp", category: "objects" },
] as const;
export const PROFILE_ICON_COUNT = PROFILE_ICON_SHEETS.length * PROFILE_ICONS_PER_SHEET;
export const isValidProfileIcon = (value: number) => Number.isInteger(value) && value >= 0 && value < PROFILE_ICON_COUNT;
export function normalizeProfileIcon(value: number) {
  return Number.isFinite(value) && isValidProfileIcon(Math.floor(value)) ? Math.floor(value) : 0;
}
export function profileIconLocation(value: number) {
  const index = normalizeProfileIcon(value), sheetIndex = Math.floor(index / PROFILE_ICONS_PER_SHEET);
  const cell = index % PROFILE_ICONS_PER_SHEET;
  return { index, sheetIndex, cell, column: cell % PROFILE_ICON_GRID, row: Math.floor(cell / PROFILE_ICON_GRID), ...PROFILE_ICON_SHEETS[sheetIndex] };
}
export function profileIconsInCategory(category: ProfileIconCategory) {
  // Feature the newest sheet first while preserving the original IDs and choices.
  return (category === "people" ? [1, 0] : [3, 2]).flatMap(sheet =>
    Array.from({ length: PROFILE_ICONS_PER_SHEET }, (_, cell) => sheet * PROFILE_ICONS_PER_SHEET + cell));
}
