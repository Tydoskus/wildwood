import { FISH, FISHING_REACH, fishOpenAt, fishingCatchSeconds, fishingLevel, fishingSpotsAt, type Fish, type FishId } from "../../../../shared/fishing";
import { TOWN_FEET_OFFSET } from "../../../../shared/town";
import { bagSlotsWithOres, type BagSpace } from "../../../../shared/ore-bag";
import type { PlayerState } from "../types";
import { REJECTED_COLOR } from "./mining-runtime";
import { fishingScene, resetFishingScene } from "./fishing-scene";

/** What fishing needs from the session (fishing-service.ts on the coop API). */
export type FishingSource = {
  localIdentity?: () => string | undefined;
  sessionGeneration?: () => number;
  fishingExperience?: () => number;
  catchFish?: (spot: number, site: number) => Promise<{ ok: boolean; error?: string }>;
  setOnFishCaught?: (callback: ((fish: Fish) => void) | null) => void;
  serverNowMs?: () => number;
  syncMovementState?: (x: number, y: number, vx: number, vy: number, inputKind?: "keyboard", force?: boolean) => void;
};

/** Each fish's colour, for its catch's line. */
export const FISH_COLORS: Readonly<Record<FishId, string>> = {
  minnow: "#c9d6df", perch: "#e6c84a", bluegill: "#7fc4e0", trout: "#f0a0a6", carp: "#e3a640", eel: "#a8a46a",
  salmon: "#f49c7c", catfish: "#b3aca2", pike: "#9ccc62", lobster: "#ff6b4f", jellyfish: "#e3a0f0", tuna: "#8fb0e0",
  swordfish: "#a9c0d6", anglerfish: "#d8f070", shark: "#c3cbd2", golden_koi: "#ffd34d",
};
const WATER = "#bfe8ff", LEVEL_UP = "#ffd34d";
/** How near a tap comes to a spot's middle to pick it. */
const TAP_RADIUS = 90;
/** A spot tapped from afar is fished on arrival within this long; after that the tap is forgotten. */
const HEADING_SECONDS = 20;
/** A hint says itself again only after this long, or with other words. */
const HINT_SECONDS = 6;

/**
 * Fishing in play: tap a spot and, standing on the bank within reach, the player fishes it, a catch every
 * fishingCatchSeconds, the server rolling each fish. Tapped from afar, the spot is fished once the player has walked
 * up and stopped. Walking off, or the spot moving on, ends it.
 */
export function createFishingRuntime(deps: {
  source: () => FishingSource | null | undefined;
  player: PlayerState;
  message?: (text: string, color: string) => void;
  logPickup?: (label: string, color: string) => void;
  burst?: (x: number, y: number, color: string, count: number, speed: number) => void;
  /** The bag as the server counts it: a new kind of fish needs a free slot (shared/ore-bag.ts). */
  bag?: () => BagSpace | null | undefined;
}) {
  let fishingAt: { spot: number; site: number } | null = null;
  let heading: { spot: number; site: number; left: number } | null = null;
  let elapsed = 0, waiting = false, clock = 0, active = false, movesAtMs = -Infinity, workedOutAt = Infinity;
  /** The Fishing level last shown, so a catch that raises it says so. */
  let shownLevel = 1;
  let hint = { text: "", at: -Infinity };
  let listeningTo: FishingSource | null = null;
  /** Catches belong to the account and connection that cast for them. */
  let session: { source: FishingSource; identity: string; generation: number } | null = null;

  const now = () => deps.source()?.serverNowMs?.() ?? Date.now();
  const feet = () => ({ x: deps.player.x, y: deps.player.y + TOWN_FEET_OFFSET });
  const inReach = (spot: { x: number; y: number }) => {
    const at = feet();
    return Math.hypot(spot.x - at.x, spot.y - at.y) <= FISHING_REACH;
  };

  function sameSession(source: FishingSource | null | undefined) {
    return Boolean(source && session?.source === source
      && session.identity === (source.localIdentity?.() ?? "")
      && session.generation === (source.sessionGeneration?.() ?? 0));
  }

  function say(text: string, color: string) {
    if (text === hint.text && clock - hint.at < HINT_SECONDS) return;
    hint = { text, at: clock };
    deps.message?.(text, color);
  }

  function stop() {
    fishingAt = null; elapsed = 0; waiting = false;
    fishingScene.fishing = null; fishingScene.rodOut = false;
  }

  function reset() {
    stop(); resetFishingScene();
    listeningTo?.setOnFishCaught?.(null);
    listeningTo = null; session = null; heading = null; movesAtMs = -Infinity; workedOutAt = Infinity;
    hint = { text: "", at: -Infinity };
  }

  /** Where every spot is: worked out again only as one moves on, or when the clock was set back. */
  function refreshSpots(at: number) {
    if (at < movesAtMs && at >= workedOutAt && fishingScene.spots.length) return;
    const spots = fishingSpotsAt(at);
    fishingScene.spots = spots;
    movesAtMs = Math.min(...spots.map(spot => spot.movesAtMs));
    workedOutAt = at;
  }

  /** A full bag holding none of the fish open: nothing can come in. */
  function bagFull(source: FishingSource) {
    const bag = deps.bag?.();
    if (!bag || bagSlotsWithOres(bag) < bag.capacity) return false;
    return !fishOpenAt(source.fishingExperience?.() ?? 0).some(fish => (bag.ores[fish.id] ?? 0) > 0);
  }

  function listen(source: FishingSource) {
    if (listeningTo === source || !source.setOnFishCaught) return;
    listeningTo = source;
    const started = session;
    source.setOnFishCaught(fish => {
      if (session !== started || !sameSession(deps.source())) return;
      const color = FISH_COLORS[fish.id];
      deps.logPickup?.(`+1 ${fish.name}`, color);
      const spot = fishingScene.spots.find(each => each.spot === fishingAt?.spot);
      if (spot) { deps.burst?.(spot.x, spot.y - 6, WATER, 14, 110); deps.burst?.(spot.x, spot.y - 10, color, 6, 70); }
      fishingScene.splash = 1;
      const level = fishingLevel(source.fishingExperience?.() ?? 0), opened = FISH.find(each => each.level === level);
      if (level > shownLevel) deps.message?.(opened ? `Fishing Lv ${level}: ${opened.name} can bite now.` : `Fishing Lv ${level}`, LEVEL_UP);
      shownLevel = level;
    });
  }

  function start(source: FishingSource, spot: { spot: number; site: number; x: number; y: number }) {
    heading = null;
    if (bagFull(source)) { say("Your bag is full. Free a slot for your fish.", "#ff9b91"); return; }
    fishingAt = { spot: spot.spot, site: spot.site };
    elapsed = 0; waiting = false;
    shownLevel = fishingLevel(source.fishingExperience?.() ?? 0);
    // The server judges reach from where it last heard the player stood: it hears it now.
    source.syncMovementState?.(deps.player.x, deps.player.y, 0, 0, "keyboard", true);
    const at = feet();
    deps.player.facing = Math.atan2(spot.y - at.y, spot.x - at.x);
    fishingScene.fishing = spot.spot;
    fishingScene.rodOut = true;
    say("You cast out your line.", WATER);
  }

  function cast(source: FishingSource, spot: { spot: number; site: number }) {
    waiting = true;
    elapsed = 0;
    const started = session;
    void (source.catchFish?.(spot.spot, spot.site) ?? Promise.resolve({ ok: false, error: "NOT CONNECTED" })).then(result => {
      if (session !== started || !fishingAt) return;
      waiting = false;
      if (result.ok) return;
      stop();
      say(result.error ?? "NOT CONNECTED", REJECTED_COLOR);
    });
  }

  /** `here`: in the Town and free to act (not through a door, not falling down a well). */
  function update(dt: number, here: boolean) {
    clock += dt;
    const source = deps.source();
    if (!sameSession(source)) {
      reset();
      if (!source) { active = false; return; }
      session = { source, identity: source.localIdentity?.() ?? "", generation: source.sessionGeneration?.() ?? 0 };
    }
    refreshSpots(now());
    fishingScene.splash = Math.max(0, fishingScene.splash - dt * 1.5);
    active = Boolean(here && source && deps.player.hp > 0);
    if (!active || !source) { stop(); heading = null; return; }
    listen(source);
    if (fishingAt) {
      const spot = fishingScene.spots[fishingAt.spot];
      if (!spot || spot.site !== fishingAt.site) { stop(); say("The fishing spot moved.", WATER); return; }
      if (deps.player.moving || !inReach(spot)) { stop(); return; }
      if (!waiting && (elapsed += dt) >= fishingCatchSeconds(source.fishingExperience?.() ?? 0)) cast(source, spot);
      return;
    }
    if (!heading) return;
    const spot = fishingScene.spots[heading.spot];
    if ((heading.left -= dt) <= 0 || !spot || spot.site !== heading.site) { heading = null; return; }
    if (!deps.player.moving && inReach(spot)) start(source, spot);
  }

  /**
   * A tap or click on the world, in world units: true when it picked a spot in reach (fishing starts there, and the
   * click does not walk). A spot out of reach is fished on arrival, and the click walks there as any click does.
   */
  function tap(x: number, y: number) {
    const source = deps.source();
    if (!active || !source?.catchFish) return false;
    let picked: (typeof fishingScene.spots)[number] | null = null, best = TAP_RADIUS;
    for (const spot of fishingScene.spots) {
      const distance = Math.hypot(spot.x - x, spot.y - y);
      if (distance <= best) { picked = spot; best = distance; }
    }
    if (!picked) return false;
    if (fishingAt?.spot === picked.spot) return true;
    if (inReach(picked)) { stop(); start(source, picked); return true; }
    stop();
    heading = { spot: picked.spot, site: picked.site, left: HEADING_SECONDS };
    say("Walk up to the fishing spot to fish it.", WATER);
    return false;
  }

  return {
    update,
    tap,
    /** Clears this session's local fishing and stops listening for its catches. */
    reset,
  };
}
