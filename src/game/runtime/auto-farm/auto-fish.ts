import { FISHING_REACH, FISHING_SPOTS, FISHING_SPOT_NAMES, fishingSpotsAt } from '../../../../shared/fishing';
import { MINING_REACH } from '../../../../shared/mining';
import { inTownGrove, inTownHills, townRoomAt } from '../../../../shared/town';
import { WOODCUTTING_REACH } from '../../../../shared/woodcutting';
import { fishingScene } from '../town/fishing-scene';
import { townFeetClear, type TownPoint } from '../town/town-path';
import { createAutoGather, type AutoGatherOptions } from './auto-gather';

/** Which river stretches Auto Fish visits, per device, as Auto Mine's ores and Auto Chop's trees are. */
export const AUTO_FISH_SPOTS_KEY = 'wildstat:autofish-spots:v1';
/** Whose Auto Fish was on, so an update's reload carries on fishing. */
export const AUTO_FISH_RESUME_KEY = 'wildstat:autofish-resume:v1';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

export type AutoFishSource = {
  serverNowMs?: () => number;
};

type FishTarget = { spot: number; site: number; x: number; y: number };

const ALL_SPOT_IDS = FISHING_SPOTS.map((_, index) => String(index));
const ALL_SITES = FISHING_SPOTS.flatMap(spot => spot.sites);
/** How close to a river/pond fishing site the player stands for Auto Fish's button to show. */
const FISHING_AREA_RADIUS = 260;

/** Anywhere outdoors in Town outside the Copper Hills, Timberwood, and interiors: valid while walking between spots. */
export function inFishingTownGround(x: number, y: number) {
  return !townRoomAt(x, y) && !inTownHills(x, y, MINING_REACH * 2) && !inTownGrove(x, y, WOODCUTTING_REACH * 2);
}

/** Anywhere along the Town's river and pond outside the Hills, Timberwood and interiors. */
export function inFishingArea(x: number, y: number) {
  if (!inFishingTownGround(x, y)) return false;
  if (fishingScene.rodOut) return true;
  return ALL_SITES.some(site => Math.hypot(site.x - x, site.y - y) <= FISHING_AREA_RADIUS);
}

const standCache = new Map<string, TownPoint | null>();
const RADII = [44, 60, 76, 92, 108, 118];
const ANGLES = 24;

/** Where feet stand on the bank to fish this water site: the nearest clear point within FISHING_REACH (null if none). */
export function fishingStandSpot(site: TownPoint): TownPoint | null {
  const key = `${site.x}:${site.y}`;
  if (!standCache.has(key)) {
    let best: TownPoint | null = null;
    for (const r of RADII) {
      for (let i = 0; i < ANGLES; i++) {
        const angle = (i / ANGLES) * Math.PI * 2;
        const x = Math.round(site.x + Math.cos(angle) * r), y = Math.round(site.y + Math.sin(angle) * r);
        if (Math.hypot(x - site.x, y - site.y) < FISHING_REACH - 8 && townFeetClear(x, y)) { best = { x, y }; break; }
      }
      if (best) break;
    }
    standCache.set(key, best);
  }
  return standCache.get(key)!;
}

function readSpots(storage: () => Store | undefined): string[] {
  try {
    const saved = storage()?.getItem(AUTO_FISH_SPOTS_KEY);
    if (saved == null) return [...ALL_SPOT_IDS];
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? ALL_SPOT_IDS.filter(id => parsed.includes(id)) : [...ALL_SPOT_IDS];
  } catch { return [...ALL_SPOT_IDS]; }
}

/**
 * Auto Fish: along the Town's river and pond, walks to the nearest picked fishing spot, casts out and fishes until
 * the spot moves on, then walks to the next spot automatically. Stops when the bag is full.
 */
export function createAutoFish(options: AutoGatherOptions & {
  source: () => AutoFishSource | null | undefined;
  storage?: () => Store | undefined;
}) {
  const storage = options.storage ?? (() => { try { return window.localStorage; } catch { return undefined; } });
  let picked = new Set<string>(readSpots(storage));
  const serverNow = () => options.source()?.serverNowMs?.() ?? Date.now();
  const currentSpots = () => fishingScene.spots.length ? fishingScene.spots : fishingSpotsAt(serverNow());

  function chooseSpot(feet: TownPoint): { node: FishTarget; readyAt: number | null } | null {
    const spots = currentSpots();
    let best: FishTarget | null = null, bestDistance = Infinity;
    for (const spot of spots) {
      if (!picked.has(String(spot.spot))) continue;
      const bank = fishingStandSpot(spot);
      if (!bank) continue;
      const distance = Math.hypot(bank.x - feet.x, bank.y - feet.y);
      if (distance < bestDistance) { best = spot; bestDistance = distance; }
    }
    return best ? { node: best, readyAt: null } : null;
  }

  const gather = createAutoGather<FishTarget>(options, {
    name: 'Auto Fish', area: 'the Town River', resumeKey: AUTO_FISH_RESUME_KEY, inArea: inFishingArea, stayInArea: inFishingTownGround,
    needs() {
      if (!picked.size) return 'Pick a Fishing Spot';
      return null;
    },
    started: () => { fishingScene.blocked = null; },
    choose: feet => chooseSpot(feet),
    stale: target => {
      if (!picked.has(String(target.node.spot))) return true;
      const live = currentSpots()[target.node.spot];
      return !live || live.site !== target.node.site;
    },
    spot: node => fishingStandSpot(node)!,
    arrived(target) {
      if (fishingScene.blocked === 'bag') return { status: 'Auto Fish Stopped: Bag Full', stop: true };
      if (fishingScene.fishing !== target.node.spot) fishingScene.wantSpot = target.node.spot;
      return { status: `Fishing ${FISHING_SPOT_NAMES[target.node.spot] ?? 'River'}` };
    },
    walking: target => `Walking to ${FISHING_SPOT_NAMES[target.node.spot] ?? 'Fishing Spot'}`,
    noTarget: 'No Picked Fishing Spots',
  });

  return {
    ...gather,
    picked: (id: string) => picked.has(id),
    setPicked(id: string, on: boolean) {
      const next = new Set(picked);
      if (on) next.add(id); else next.delete(id);
      picked = new Set(ALL_SPOT_IDS.filter(each => next.has(each)));
      try { storage()?.setItem(AUTO_FISH_SPOTS_KEY, JSON.stringify([...picked])); } catch { /* Session-only fallback. */ }
      const target = gather.state().target;
      if (target && !picked.has(String(target.spot))) gather.forget();
    },
    spots: () => FISHING_SPOTS.map((spot, index) => ({
      id: String(index),
      name: FISHING_SPOT_NAMES[index] ?? `Spot ${index + 1}`,
      open: true,
      locked: '',
      picked: picked.has(String(index)),
      sites: spot.sites.length,
    })),
  };
}
export type AutoFish = ReturnType<typeof createAutoFish>;
