export type ProfileIconCategory = "people" | "objects";
export const PROFILE_ICON_GRID = 8;
export const PROFILE_ICONS_PER_SHEET = PROFILE_ICON_GRID ** 2;
// Append sheets so every previously saved icon keeps its original appearance.
// The sheets are transparent (scripts/art/profile-icon-alpha.mjs) so the chosen
// backdrop shows behind each picture. The flattened sheets they were made from
// stay in public/ under the old names for clients that predate the backdrop.
export const PROFILE_ICON_SHEETS = [
  { path: "assets/wildstat/profile-portraits-grid-v2-alpha.webp", category: "people" },
  { path: "assets/wildstat/profile-portraits-varied-v1-alpha.webp", category: "people" },
  { path: "assets/wildstat/profile-objects-grid-v1-alpha.webp", category: "objects" },
  { path: "assets/wildstat/profile-objects-grid-v2-alpha.webp", category: "objects" },
  { path: "assets/wildstat/profile-objects-grid-v3-alpha.webp", category: "objects" },
] as const;
export const PROFILE_ICON_COUNT = PROFILE_ICON_SHEETS.length * PROFILE_ICONS_PER_SHEET;

/**
 * A saved profile icon is one u32: the picture's index in its low 16 bits and,
 * in bit 16, the Black backdrop. Every icon saved before the choice existed
 * has the bit clear, so it stays on White, and no column or client binding
 * changed. A client from before the choice does not know the bit: it reads a
 * Black icon as invalid and draws picture 0, the default silhouette.
 */
export type ProfileIconBackground = "white" | "black";
export const PROFILE_ICON_BACKGROUNDS: readonly ProfileIconBackground[] = ["white", "black"];
export const PROFILE_ICON_BLACK_BACKGROUND = 0x10000;
const PROFILE_ICON_INDEX_MASK = 0xffff;
/** The colour drawn behind a picture for each backdrop. */
export const PROFILE_ICON_BACKGROUND_COLORS: Readonly<Record<ProfileIconBackground, string>> = { white: "#ffffff", black: "#000000" };

/**
 * The reserved picture "my character, as I snapshotted it". The server keeps
 * the look in player_profile_snapshot, never pixels; a client draws it. It sits
 * at the top of the index range, far past any sheet, and takes a backdrop like
 * any picture. A client from before it reads the index as invalid and draws
 * picture 0, the default silhouette, on White.
 */
export const PROFILE_ICON_SNAPSHOT = PROFILE_ICON_INDEX_MASK;

export const isValidProfileIcon = (value: number) => Number.isInteger(value) && value >= 0
  && value <= (PROFILE_ICON_BLACK_BACKGROUND | PROFILE_ICON_INDEX_MASK)
  && ((value & PROFILE_ICON_INDEX_MASK) < PROFILE_ICON_COUNT || (value & PROFILE_ICON_INDEX_MASK) === PROFILE_ICON_SNAPSHOT);
/** A saved icon that shows the player's snapshotted character. */
export const isSnapshotProfileIcon = (value: number) => Number.isFinite(value) && isValidProfileIcon(Math.floor(value))
  && (Math.floor(value) & PROFILE_ICON_INDEX_MASK) === PROFILE_ICON_SNAPSHOT;
export function normalizeProfileIcon(value: number) {
  return Number.isFinite(value) && isValidProfileIcon(Math.floor(value)) ? Math.floor(value) : 0;
}
export function encodeProfileIcon(index: number, background: ProfileIconBackground) {
  const picture = normalizeProfileIcon(index) & PROFILE_ICON_INDEX_MASK;
  return background === "black" ? picture | PROFILE_ICON_BLACK_BACKGROUND : picture;
}
export const profileIconIndex = (value: number) => normalizeProfileIcon(value) & PROFILE_ICON_INDEX_MASK;
export const profileIconBackground = (value: number): ProfileIconBackground =>
  normalizeProfileIcon(value) & PROFILE_ICON_BLACK_BACKGROUND ? "black" : "white";
/** The same picture on another backdrop. */
export const withProfileIconBackground = (value: number, background: ProfileIconBackground) => encodeProfileIcon(profileIconIndex(value), background);
/**
 * Where a picture sits in its sheet. A snapshot has no cell of its own: it
 * reports the default silhouette's, which is what is drawn until the
 * character is, and `snapshot` says which it is.
 */
export function profileIconLocation(value: number) {
  const index = profileIconIndex(value), snapshot = index === PROFILE_ICON_SNAPSHOT;
  const picture = snapshot ? 0 : index, sheetIndex = Math.floor(picture / PROFILE_ICONS_PER_SHEET);
  const cell = picture % PROFILE_ICONS_PER_SHEET;
  return {
    index, snapshot, sheetIndex, cell, column: cell % PROFILE_ICON_GRID, row: Math.floor(cell / PROFILE_ICON_GRID),
    background: profileIconBackground(value), ...PROFILE_ICON_SHEETS[sheetIndex],
  };
}
export function profileIconsInCategory(category: ProfileIconCategory) {
  // Feature the newest sheet first while preserving the original IDs and choices.
  return (category === "people" ? [1, 0] : [4, 3, 2]).flatMap(sheet =>
    Array.from({ length: PROFILE_ICONS_PER_SHEET }, (_, cell) => sheet * PROFILE_ICONS_PER_SHEET + cell));
}
