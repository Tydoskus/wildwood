export type ProfileIconCrop = { x: number; y: number; width: number; height: number };
export const OBJECT_ATLAS_SIZE = 1254;
export const OBJECT_ICON_FILL = .94;

// Measured artwork bounds, including detached details such as steam and stars.
// Generated artwork does not reliably stay inside equal 8×8 grid cells.
// These rectangles include a two-pixel gutter; saved avatar IDs stay unchanged.
const OBJECT_BOUNDS = [
  [14,31,154,140], [172,19,301,155], [326,13,451,154], [484,13,604,155], [639,20,763,146], [791,29,922,149], [946,20,1090,152], [1105,15,1236,156],
  [12,197,158,287], [187,169,294,314], [324,177,462,291], [480,188,615,295], [635,168,769,304], [795,182,918,295], [948,170,1082,306], [1111,167,1219,313],
  [12,329,158,459], [185,325,285,469], [315,314,463,463], [482,324,608,465], [629,318,763,467], [784,334,929,456], [957,326,1069,466], [1107,325,1236,464],
  [16,473,146,621], [171,486,297,619], [326,481,450,621], [490,484,597,621], [636,481,753,628], [793,489,916,617], [944,490,1087,621], [1100,479,1236,628],
  [14,642,148,779], [179,634,290,783], [320,635,461,785], [491,637,598,784], [638,633,759,785], [800,640,908,781], [937,651,1080,766], [1106,638,1236,780],
  [23,793,141,933], [163,808,305,931], [329,791,447,935], [465,816,618,918], [631,801,759,929], [808,787,894,940], [923,803,1103,928], [1132,791,1216,940],
  [14,971,150,1066], [170,947,301,1087], [311,945,461,1084], [479,947,609,1089], [640,944,761,1085], [796,950,910,1085], [950,943,1073,1092], [1110,959,1228,1076],
  [25,1092,145,1232], [175,1116,297,1230], [345,1102,431,1239], [472,1101,607,1232], [647,1098,746,1238], [782,1102,920,1234], [932,1120,1093,1234], [1111,1102,1226,1239],
] as const;

/** The second object sheet, fitted by scripts/art/fit-profile-object-sheet.mjs, which printed these bounds. */
const OBJECT_BOUNDS_V2 = [
  [8,20,147,135], [165,17,304,139], [330,8,453,147], [479,12,618,144], [635,13,774,142], [792,14,931,141], [957,8,1080,147], [1106,12,1245,143],
  [8,166,147,303], [165,169,304,301], [324,165,458,304], [481,165,616,304], [647,165,763,304], [799,165,924,304], [961,165,1075,304], [1110,165,1241,304],
  [19,322,136,461], [176,322,294,461], [322,330,461,452], [503,322,594,461], [640,322,770,461], [797,322,927,461], [949,336,1088,446], [1106,327,1245,455],
  [25,479,130,618], [165,492,304,604], [322,485,461,612], [479,489,618,607], [635,486,774,610], [800,479,923,618], [960,479,1076,618], [1106,496,1245,601],
  [20,635,136,774], [180,635,290,774], [329,635,454,774], [479,645,618,764], [635,641,774,768], [792,645,931,765], [952,635,1085,774], [1106,658,1245,752],
  [11,792,145,931], [169,792,301,931], [345,792,438,931], [496,792,601,931], [635,800,774,923], [800,792,923,931], [949,794,1088,929], [1121,792,1229,931],
  [14,949,141,1088], [165,958,304,1079], [333,949,449,1088], [479,950,618,1087], [635,958,774,1079], [818,949,906,1088], [949,960,1088,1076], [1106,962,1245,1075],
  [8,1114,147,1237], [166,1106,303,1245], [322,1123,461,1227], [479,1108,618,1243], [641,1106,769,1245], [792,1122,931,1229], [949,1121,1088,1230], [1106,1118,1245,1232],
] as const;

const crops = (bounds: readonly (readonly [number, number, number, number])[]): readonly ProfileIconCrop[] => bounds.map(([left, top, right, bottom]) => ({
  x: left - 2, y: top - 2, width: right - left + 4, height: bottom - top + 4,
}));
export const OBJECT_ICON_CROPS: readonly ProfileIconCrop[] = crops(OBJECT_BOUNDS);
/** Each object sheet's crops, by its path in PROFILE_ICON_SHEETS. */
const OBJECT_SHEET_CROPS: Readonly<Record<string, readonly ProfileIconCrop[]>> = {
  "assets/wildstat/profile-objects-grid-v1.webp": OBJECT_ICON_CROPS,
  "assets/wildstat/profile-objects-grid-v2.webp": crops(OBJECT_BOUNDS_V2),
};
export const objectIconCrop = (path: string, cell: number) => OBJECT_SHEET_CROPS[path]?.[cell];

/** Normalized destination rectangle shared by CSS and canvas, with no stretching. */
export function containedIconRect(crop: ProfileIconCrop) {
  const scale = OBJECT_ICON_FILL / Math.max(crop.width, crop.height);
  const width = crop.width * scale, height = crop.height * scale;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}
