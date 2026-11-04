import { townRandom } from "./town";

/**
 * Fishing in the Town's river: tap a fishing spot from the bank and you fish it until you walk off or it moves.
 * Fish stack in the bag as logs do and are only for collecting. Fishing is a level from 1 to 99, each level taking
 * about a tenth more experience than the last: the last fish opens at 90, and 99 takes some 300 hours of fishing.
 * Every catch earns experience; a higher level also catches faster. Prestige never resets it.
 *
 * The spots are the same for everyone, worked out from the server's clock alone: each roams its own stretch of the
 * river, staying a few minutes at a site before it moves on.
 */

export type FishId = "minnow" | "perch" | "bluegill" | "eel" | "trout" | "carp" | "salmon" | "tuna" | "lobster" | "catfish" | "swordfish"
  | "pike" | "jellyfish" | "shark" | "anglerfish" | "golden_koi";
export type Fish = {
  id: FishId;
  name: string;
  /** The Fishing level it takes before this fish bites. */
  level: number;
  /** How often it bites against the others open: the rarer, the smaller. */
  weight: number;
  /** The experience a catch earns. */
  experience: number;
};
export const FISH: readonly Fish[] = Object.freeze([
  { id: "minnow", name: "Minnow", level: 1, weight: 100, experience: 9 },
  { id: "perch", name: "Perch", level: 4, weight: 90, experience: 18 },
  { id: "bluegill", name: "Bluegill", level: 9, weight: 80, experience: 27 },
  { id: "eel", name: "Eel", level: 16, weight: 70, experience: 36 },
  { id: "trout", name: "Trout", level: 21, weight: 64, experience: 45 },
  { id: "carp", name: "Carp", level: 26, weight: 58, experience: 54 },
  { id: "salmon", name: "Salmon", level: 31, weight: 52, experience: 63 },
  { id: "tuna", name: "Tuna", level: 37, weight: 46, experience: 72 },
  { id: "lobster", name: "Lobster", level: 42, weight: 40, experience: 81 },
  { id: "catfish", name: "Catfish", level: 47, weight: 35, experience: 90 },
  { id: "swordfish", name: "Swordfish", level: 52, weight: 30, experience: 100 },
  { id: "pike", name: "Pike", level: 61, weight: 25, experience: 108 },
  { id: "jellyfish", name: "Jellyfish", level: 69, weight: 20, experience: 118 },
  { id: "shark", name: "Shark", level: 74, weight: 15, experience: 127 },
  { id: "anglerfish", name: "Anglerfish", level: 81, weight: 10, experience: 145 },
  // The last to open and the rarest bite: about one in 736 catches.
  { id: "golden_koi", name: "Golden Koi", level: 90, weight: 1, experience: 270 },
] as const);
export const FISH_IDS: readonly FishId[] = Object.freeze(FISH.map(fish => fish.id));
const FISH_BY_ID = new Map<string, Fish>(FISH.map(fish => [fish.id, fish]));
export const fishById = (id: unknown): Fish | null => typeof id === "string" ? FISH_BY_ID.get(id) ?? null : null;
export const isFishId = (id: unknown): id is FishId => fishById(id) !== null;

export const FISHING_MAX_LEVEL = 99;
/** The total experience to reach each level, by level: about a tenth more a level, 11,800,568 at 99. */
const LEVEL_EXPERIENCE: readonly number[] = Object.freeze([0, ...Array.from({ length: FISHING_MAX_LEVEL },
  (_, index) => Math.round(759 * (1.1035 ** index - 1)))]);

/** How long a level 1 angler waits for a bite; each level shortens it, to half at 99. */
export const FISHING_CATCH_SECONDS = 9;
/** How close a player's feet come to a spot to fish it, and the server's allowance on top for lag. */
export const FISHING_REACH = 130;
export const FISHING_SERVER_REACH = 190;
/** The server takes a catch this soon at the earliest, as a share of the wait: clocks and packets wander. */
export const FISHING_RATE_SLACK = .75;
/** A catch that lands just after its spot moved still counts, as the client's clock may run a little behind. */
export const FISHING_MOVE_GRACE_MS = 3_000;

/** Fishing experience as stored: a whole number, never below 0. */
export function normalizeFishingExperience(experience: unknown) {
  const value = Number(experience);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Total experience to reach a level. */
export const fishingExperienceForLevel = (level: number) =>
  LEVEL_EXPERIENCE[Math.max(1, Math.min(FISHING_MAX_LEVEL, Math.floor(Number.isFinite(level) ? level : 1)))];

export function fishingLevel(experience: unknown) {
  const value = normalizeFishingExperience(experience);
  let level = 1;
  while (level < FISHING_MAX_LEVEL && value >= LEVEL_EXPERIENCE[level + 1]) level++;
  return level;
}

/** Seconds to a bite at this experience: 9 at level 1, half that at 99. */
export const fishingCatchSeconds = (experience: unknown) => FISHING_CATCH_SECONDS / (1 + (fishingLevel(experience) - 1) / (FISHING_MAX_LEVEL - 1));

export const canCatchFish = (fish: Pick<Fish, "level">, experience: unknown) => fishingLevel(experience) >= fish.level;

/** The fish this experience can catch, rarest last. */
export const fishOpenAt = (experience: unknown) => FISH.filter(fish => canCatchFish(fish, experience));

/** Which fish bites, for a roll in [0, 1): weighted among the fish open and `allowed` (all of them by default), or null. */
export function rollFish(experience: unknown, roll: number, allowed: (fish: Fish) => boolean = () => true): Fish | null {
  const pool = fishOpenAt(experience).filter(allowed);
  const total = pool.reduce((sum, fish) => sum + fish.weight, 0);
  let left = Math.max(0, Math.min(1, roll)) * total;
  for (const fish of pool) {
    if (left < fish.weight) return fish;
    left -= fish.weight;
  }
  return pool[pool.length - 1] ?? null;
}

// ---- The spots ----

type Point = { readonly x: number; readonly y: number };
export type FishingSpot = {
  /** The stretch of river it roams: the sites it stays at, in the water a step off a standable bank. */
  sites: readonly Point[];
  /** About how long it stays at a site; each stay runs up to a third longer. */
  staySeconds: number;
};
const sites = (...points: readonly (readonly [number, number])[]) => Object.freeze(points.map(([x, y]) => Object.freeze({ x, y })));
/** Picked off the river's water mask (scripts/art/pick-fishing-sites.mts): open water, a bank in reach, nothing drawn over either. */
export const FISHING_SPOTS: readonly FishingSpot[] = Object.freeze([
  // West of the village, either side of its west bridge.
  { sites: sites([4112, 4972], [4672, 5612], [4512, 5932]), staySeconds: 300 },
  // The bend south-west, along to the south bridge.
  { sites: sites([4672, 6252], [5072, 6292], [5712, 6292]), staySeconds: 270 },
  // South-east, below the village.
  { sites: sites([6272, 6572], [6352, 6132], [6712, 5892]), staySeconds: 330 },
  // East, up past the east bridge.
  { sites: sites([7392, 5412], [7512, 5052], [7792, 4372]), staySeconds: 240 },
  // The pond north-east of the village.
  { sites: sites([7032, 3932], [6272, 3772]), staySeconds: 360 },
].map(spot => Object.freeze(spot)));

/** When a spot's `stay`-th stay begins: on its stay's own beat, a seeded part of a third of a stay late. */
function stayStart(spot: number, stay: number) {
  const ms = FISHING_SPOTS[spot].staySeconds * 1_000;
  return stay * ms + Math.floor(townRandom(spot, stay, 7)() * ms / 3);
}
/** The site a spot is at during a stay: seeded, never the last stay's seeded site again. */
function staySite(spot: number, stay: number) {
  const count = FISHING_SPOTS[spot].sites.length;
  const seeded = (index: number) => Math.floor(townRandom(spot, index, 11)() * count) % count;
  const site = seeded(stay);
  return site === seeded(stay - 1) ? (site + 1) % count : site;
}

/** Where a spot is at a server time (epoch ms): its site, as an index into its sites and a point, and when it next moves. */
export function fishingSpotAt(spot: number, atMs: number) {
  const ms = FISHING_SPOTS[spot].staySeconds * 1_000;
  let stay = Math.floor(atMs / ms);
  if (atMs < stayStart(spot, stay)) stay--;
  const site = staySite(spot, stay), point = FISHING_SPOTS[spot].sites[site];
  return { spot, site, x: point.x, y: point.y, movesAtMs: stayStart(spot, stay + 1) };
}

/** Every spot where it is now. */
export const fishingSpotsAt = (atMs: number) => FISHING_SPOTS.map((_spot, index) => fishingSpotAt(index, atMs));

/** "Reach Fishing Lv 20 to catch Trout." */
export const fishHint = (fish: Fish) => `Reach Fishing Lv ${fish.level} to catch ${fish.name}.`;
