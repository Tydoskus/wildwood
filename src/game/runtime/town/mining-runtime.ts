import {
  MINING_NODES, MINING_NODE_KINDS, MINING_REACH, MINING_VEINS, canMineRock, miningBreakSeconds, miningGain, miningRockHint, miningYield, type MiningNode,
} from "../../../../shared/mining";
import { REFINE_ORES, type OreId } from "../../../../shared/refine";
import { gatherRespawnMs } from "../../../../shared/gather-respawn";
import { inTownHills, TOWN_FEET_OFFSET } from "../../../../shared/town";
import { ATTACK_ANIMATION_SECONDS, ATTACK_WINDUP_SECONDS } from "../../attack-timeline";
import type { PlayerState } from "../types";
import { miningScene, resetMiningScene } from "./mining-scene";
import { ORE_COLORS } from "./ore-rock-renderer";
import { bagFullForOres, rockOreKinds, roomForOres, type BagSpace } from "../../../../shared/ore-bag";
import type { ToolId } from "../../../../shared/tools";
import { boostedYield } from "../../../../shared/server-boost";

/** What mining needs from the session (mining-service.ts on the coop API). */
export type MiningSource = {
  localIdentity?: () => string | undefined;
  sessionGeneration?: () => number;
  mining?: () => number;
  /** What the active cards add to mining speed (card-effects.ts), a fraction. */
  activeCardStats?: () => { miningSpeed: number };
  /** A tool's upgrades (shared/tools.ts): the pickaxe's speed, which the server's rate check uses too. */
  toolLevel?: (tool: ToolId) => number;
  /** When the rock last broke, here or on the server, while the session has it. */
  minedNodeAt?: (nodeId: number) => number | null;
  /** Queues a break for the next report (mining-service.ts), and sends the queue now. */
  queueMiningBreak?: (nodeId: number, atMs: number) => void;
  flushMining?: () => void;
  setOnMiningRejected?: (callback: ((text: string) => void) | null) => void;
  /** Told what a report gave beyond what its breaks showed (the server's rolls). */
  setOnMiningExtra?: (callback: ((ores: Partial<Record<OreId, number>>) => void) | null) => void;
  serverNowMs?: () => number;
  /** A running Server Boost's 2x, which doubles what a break gives. */
  serverBoostMultiplier?: () => number;
  /** The player's research: Resource Respawn shortens how long rocks and trees take to grow back (shared/gather-respawn.ts). */
  research?: () => { resourceRespawn?: number };
};

/** "+2 More Starshards": what a report gave beyond what the breaks showed. */
export function moreGatheredText(oreId: OreId, count: number) {
  const name = REFINE_ORES[oreId].name;
  return `+${count} More ${count > 1 && !name.endsWith("Ore") ? `${name}s` : name}`;
}
const STARSHARD_COLOR = "#f6dcff";

/** A pickaxe swing this often while mining. */
const SWING_SECONDS = .7;
/** How long a broken rock's full bar stays up, so the hit that breaks it is seen to fill it. */
const BROKEN_SHOW_SECONDS = .35;

/** How many hits break a rock that takes `seconds`: its time in swings, rounded up. */
export function miningHits(seconds: number) {
  return Math.max(1, Math.ceil(seconds / SWING_SECONDS - 1e-9));
}
/**
 * When hit `index` (from 0) lands, in seconds of mining the rock: a swing apart, the last just as the break is due
 * (the timing the server checks), and none before the first swing's windup.
 */
export function miningHitAt(seconds: number, index: number) {
  return Math.max(ATTACK_WINDUP_SECONDS, seconds - (miningHits(seconds) - 1 - index) * SWING_SECONDS);
}
/** A break the server did not take is told in plain grey: the rock is simply back to mine. */
export const REJECTED_COLOR = "#c7ced3";
/** A hint (Mining short of a rock, a full bag) says itself again only after this long, or for another rock. */
const HINT_SECONDS = 6;
/** How often the bare rocks are looked over: they only change as rocks grow back and break. */
const BARE_REFRESH_SECONDS = .5;

/**
 * Mining in play. Standing within reach of a rock with their pickaxe, the player swings at the nearest one
 * that is not bare until it breaks (shared/mining.ts times it by Mining; its bar steps once per hit). The rock is
 * bare and its ore shows at once; the break is queued for the server's next report, which goes out as the player
 * leaves the Copper Hills too, and a break the server does not take comes back with a message. Walking pauses the
 * swing; walking away, or to another rock, starts the next one afresh. At a rock whose Mining mark is not reached
 * yet (canMineRock), or with no bag slot for a kind of ore not held yet, it says why instead.
 */
export function createMiningRuntime(deps: {
  source: () => MiningSource | null | undefined;
  player: PlayerState;
  message?: (text: string, color: string) => void;
  logPickup?: (label: string, color: string) => void;
  burst?: (x: number, y: number, color: string, count: number, speed: number) => void;
  /** The bag as the server counts it: a kind of ore not held yet needs a free slot (shared/ore-bag.ts). */
  bag?: () => BagSpace | null | undefined;
}) {
  let target: MiningNode | null = null;
  /** Seconds spent mining the target, its swings started and hits landed, and how long a broken rock's full bar has left. */
  let elapsed = 0, swung = 0, landed = 0, bareCheck = 0, clock = 0, brokenShown = 0;
  /** Whether the player was mining ground last frame: leaving it sends the queued breaks. */
  let inHills = false;
  let hint = { text: "", at: -Infinity, rock: -1 };
  let listeningTo: MiningSource | null = null;
  /** Bare rocks belong to the account and connection that made them. */
  let session: { source: MiningSource; identity: string; generation: number } | null = null;

  const now = () => deps.source()?.serverNowMs?.() ?? Date.now();

  function sameSession(source: MiningSource | null | undefined) {
    return Boolean(source && session?.source === source
      && session.identity === (source.localIdentity?.() ?? "")
      && session.generation === (source.sessionGeneration?.() ?? 0));
  }

  /** Whether a rock is bare: broken less than its regrowth ago, shortened by the player's Resource Respawn rank. */
  function isBare(node: MiningNode, at: number, source: MiningSource | null | undefined, rank: number) {
    const brokenAt = source?.minedNodeAt?.(node.id) ?? null;
    return brokenAt !== null && at - brokenAt < gatherRespawnMs(MINING_NODE_KINDS[node.kind].respawnSeconds, rank);
  }

  function refreshBare(at: number) {
    miningScene.bare.clear();
    const source = deps.source(), rank = source?.research?.().resourceRespawn ?? 0;
    for (const node of MINING_NODES) if (isBare(node, at, source, rank)) miningScene.bare.add(node.id);
  }

  /** The nearest rock in reach of the player's feet that is not bare. */
  function rockInReach() {
    const feetX = deps.player.x, feetY = deps.player.y + TOWN_FEET_OFFSET;
    let best: MiningNode | null = null, bestDistance = MINING_REACH;
    for (const node of MINING_NODES) {
      if (miningScene.bare.has(node.id) || Math.abs(node.x - feetX) > MINING_REACH || Math.abs(node.y - feetY) > MINING_REACH) continue;
      const distance = Math.hypot(node.x - feetX, node.y - feetY);
      if (distance <= bestDistance) { best = node; bestDistance = distance; }
    }
    return best;
  }

  function stop() {
    target = null; elapsed = 0; swung = 0; landed = 0; brokenShown = 0; miningScene.blocked = null;
    miningScene.target = null; miningScene.progress = 0; miningScene.pickaxeOut = false; miningScene.swingClock = 0;
  }

  function reset() {
    stop(); resetMiningScene(); inHills = false;
    listeningTo?.setOnMiningRejected?.(null);
    listeningTo?.setOnMiningExtra?.(null);
    listeningTo = null; session = null; bareCheck = 0;
    hint = { text: "", at: -Infinity, rock: -1 };
  }

  function say(text: string, color: string, rock: number) {
    if (text === hint.text && rock === hint.rock && clock - hint.at < HINT_SECONDS) return;
    hint = { text, at: clock, rock };
    deps.message?.(text, color);
  }

  /** Breaks the server did not take: their rocks stand again at the next look, and the player is told. */
  function listen(source: MiningSource) {
    if (listeningTo === source || !source.setOnMiningRejected) return;
    listeningTo = source;
    const started = session;
    source.setOnMiningRejected(text => {
      if (session !== started || !sameSession(deps.source())) return;
      bareCheck = 0;
      deps.message?.(text, REJECTED_COLOR);
    });
    source.setOnMiningExtra?.(ores => {
      if (session !== started || !sameSession(deps.source())) return;
      for (const [oreId, count] of Object.entries(ores)) {
        const color = oreId === "starshard" ? STARSHARD_COLOR : ORE_COLORS[oreId as keyof typeof ORE_COLORS]?.light ?? STARSHARD_COLOR;
        if (count) deps.logPickup?.(moreGatheredText(oreId as OreId, count), color);
      }
    });
  }

  function breakRock(source: MiningSource, rock: MiningNode, at: number) {
    const id = rock.id;
    source.queueMiningBreak?.(id, at);
    // A Mysterious rock reports at once, so the Starshards the server rolls follow the break within a moment.
    if (rock.kind === "mysterious") source.flushMining?.();
    miningScene.bare.add(id);
    stop();
    const gain = miningGain(rock);
    const before = miningScene.level;
    miningScene.level = Math.max(before + gain, source.mining?.() ?? 0);
    miningScene.gain = gain;
    miningScene.gainLeft = 1;
    miningScene.badgeLeft = 2.6;
    const unlocked = MINING_VEINS.find(vein => vein.mining > before && vein.mining <= miningScene.level);
    if (unlocked) deps.message?.(`Mining ${unlocked.mining}: ${REFINE_ORES[unlocked.ore].name} veins open now.`, "#ffd34d");
    // The breaking hit fills the bar: it stays up a moment over the broken rock.
    Object.assign(miningScene, { target: id, progress: 1, pickaxeOut: true, swingClock: ATTACK_ANIMATION_SECONDS - ATTACK_WINDUP_SECONDS });
    brokenShown = BROKEN_SHOW_SECONDS;
    deps.burst?.(rock.x, rock.y - 18, "#c7ced3", 14, 120);
    // What it gives before the server's rolls (cards, the pickaxe's bonus): the same rule the bag counts.
    const color = ORE_COLORS[rock.ore].light, gives = boostedYield(miningYield(rock, 1), source.serverBoostMultiplier?.() ?? 1);
    deps.logPickup?.(`+${gives[rock.ore] ?? 0} ${REFINE_ORES[rock.ore].name}`, color);
    if (gives.starshard) deps.logPickup?.(`+${gives.starshard} Starshard`, STARSHARD_COLOR);
    deps.burst?.(rock.x, rock.y - 24, color, 12, 95);
  }

  /** `active`: in the Town and free to act (not through a door, not falling down a well). */
  function update(dt: number, active: boolean) {
    clock += dt;
    const source = deps.source();
    if (!sameSession(source)) {
      reset();
      if (!source) return;
      session = { source, identity: source.localIdentity?.() ?? "", generation: source.sessionGeneration?.() ?? 0 };
    }
    const at = now();
    miningScene.gainLeft = Math.max(0, miningScene.gainLeft - dt / 1.4);
    miningScene.badgeLeft = Math.max(0, miningScene.badgeLeft - dt);
    if ((bareCheck -= dt) <= 0) { bareCheck = BARE_REFRESH_SECONDS; refreshBare(at); }
    const here = Boolean(active && source && deps.player.hp > 0 && inTownHills(deps.player.x, deps.player.y, MINING_REACH * 2));
    // Leaving the hills (walking out, a door, a trip) sends what was broken there while the server still has the player in reach.
    if (inHills && !here) source?.flushMining?.();
    inHills = here;
    if (!here || !source) { stop(); miningScene.badgeLeft = 0; return; }
    miningScene.level = Math.max(miningScene.level, source.mining?.() ?? 0);
    listen(source);
    // The broken rock's full bar, while it lasts; walking on ends it.
    if (brokenShown > 0) {
      brokenShown -= dt;
      miningScene.swingClock = Math.max(0, miningScene.swingClock - dt);
      if (brokenShown > 0 && !deps.player.moving) return;
      stop();
    }
    const rock = rockInReach();
    if (!rock) { stop(); return; }
    if (rock.id !== target?.id) { target = rock; elapsed = 0; swung = 0; landed = 0; }
    // Deeper veins and crystal rocks ask for some Mining first.
    if (!canMineRock(rock, source.mining?.() ?? 0)) { stop(); miningScene.blocked = "vein"; say(miningRockHint(rock), "#ff9b91", rock.id); return; }
    // A full bag: told before the swing, not after the rock is broken.
    const space = deps.bag?.();
    if (space) {
      const { needed, room } = roomForOres(space, rockOreKinds(rock));
      if (!room) { stop(); miningScene.blocked = "bag"; say(bagFullForOres(needed), "#ff9b91", rock.id); return; }
    }
    const pickaxe = source.toolLevel?.("pickaxe") ?? 0;
    const seconds = miningBreakSeconds(rock, source.mining?.() ?? 0, source.activeCardStats?.().miningSpeed ?? 0, pickaxe), hits = miningHits(seconds);
    miningScene.target = rock.id;
    miningScene.toolLevel = pickaxe;
    miningScene.pickaxeOut = true;
    miningScene.swingClock = Math.max(0, miningScene.swingClock - dt);
    // Walking pauses the swing; the hits made on this rock stay.
    if (!deps.player.moving) {
      elapsed += dt;
      // Each swing starts a windup before its hit lands, so the bar steps as the pick meets the rock.
      if (swung < hits && elapsed >= miningHitAt(seconds, swung) - ATTACK_WINDUP_SECONDS) {
        swung++;
        miningScene.swingClock = ATTACK_ANIMATION_SECONDS;
      }
      while (landed < swung && elapsed >= miningHitAt(seconds, landed)) {
        landed++;
        deps.burst?.(rock.x, rock.y - 26, "#c7ced3", 3, 55);
      }
    }
    miningScene.progress = Math.min(1, landed / hits);
    if (elapsed >= seconds) breakRock(source, rock, at);
  }

  return {
    update,
    /** Clears this session's local mining and stops listening for its refusals. */
    reset,
  };
}
