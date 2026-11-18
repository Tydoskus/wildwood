import {
  WOOD_STANDS, WOOD_TREE_NODES, WOODCUTTING_REACH, WOODCUTTING_RESPAWN_SECONDS, canChopTree, woodcuttingChopSeconds, woodcuttingGain, woodcuttingYield, woodStandHint,
  type WoodTree,
} from "../../../../shared/woodcutting";
import { REFINE_ORES, type OreId } from "../../../../shared/refine";
import { gatherRespawnMs } from "../../../../shared/gather-respawn";
import { inTownGrove, TOWN_FEET_OFFSET } from "../../../../shared/town";
import { bagFullForOres, roomForOres, type BagSpace } from "../../../../shared/ore-bag";
import type { ToolId } from "../../../../shared/tools";
import { boostedYield } from "../../../../shared/server-boost";
import { ATTACK_ANIMATION_SECONDS, ATTACK_WINDUP_SECONDS } from "../../attack-timeline";
import type { PlayerState } from "../types";
import { REJECTED_COLOR, miningHitAt, miningHits, moreGatheredText } from "./mining-runtime";
import { resetWoodcuttingScene, woodcuttingScene } from "./woodcutting-scene";
import { LOG_COLORS } from "./wood-tree-renderer";

/** What woodcutting needs from the session (woodcutting-service.ts on the coop API). */
export type WoodcuttingSource = {
  localIdentity?: () => string | undefined;
  sessionGeneration?: () => number;
  woodcutting?: () => number;
  /** A running Server Boost's 2x, which doubles what a fall gives. */
  serverBoostMultiplier?: () => number;
  /** What the active cards add to chop speed (card-effects.ts), a fraction. */
  activeCardStats?: () => { woodcuttingSpeed: number };
  /** A tool's upgrades (shared/tools.ts): the hatchet's speed, which the server's rate check uses too. */
  toolLevel?: (tool: ToolId) => number;
  /** When the tree last fell, here or on the server, while the session has it. */
  choppedTreeAt?: (treeId: number) => number | null;
  /** Queues a fall for the next report (woodcutting-service.ts), and sends the queue now. */
  queueTreeChop?: (treeId: number, atMs: number) => void;
  flushWoodcutting?: () => void;
  setOnWoodcuttingRejected?: (callback: ((text: string) => void) | null) => void;
  /** Told what a report gave beyond what its falls showed (the hatchet's bonus logs). */
  setOnWoodcuttingExtra?: (callback: ((ores: Partial<Record<OreId, number>>) => void) | null) => void;
  serverNowMs?: () => number;
  /** The player's research: Resource Respawn shortens how long rocks and trees take to grow back (shared/gather-respawn.ts). */
  research?: () => { resourceRespawn?: number };
};

/** How long a felled tree's full bar stays up, so the hit that fells it is seen to fill it. */
const FELLED_SHOW_SECONDS = .35;
/** A hint (Woodcutting short of a stand, a full bag) says itself again only after this long, or for another tree. */
const HINT_SECONDS = 6;
/** How often the stumps are looked over: they only change as trees grow back and fall. */
const STUMP_REFRESH_SECONDS = .5;
const CHIPS = "#d9b98a";

/**
 * Woodcutting in play, as mining is (mining-runtime.ts): standing within reach of a tree with their hatchet,
 * the player swings at the nearest one still standing until it falls (shared/woodcutting.ts times it by Woodcutting,
 * its bar stepping once per hit, a swing apart as the pickaxe's). The tree is a stump and its logs show at once; the
 * fall is queued for the server's next report, sent too as the player leaves Timberwood, and one the server does not
 * take stands again. Walking pauses the swing; at a stand whose Woodcutting mark is not reached yet, or with no bag
 * slot for a new kind of log, it says why.
 */
export function createWoodcuttingRuntime(deps: {
  source: () => WoodcuttingSource | null | undefined;
  player: PlayerState;
  message?: (text: string, color: string) => void;
  logPickup?: (label: string, color: string) => void;
  burst?: (x: number, y: number, color: string, count: number, speed: number) => void;
  /** The bag as the server counts it: a kind of log not held yet needs a free slot (shared/ore-bag.ts). */
  bag?: () => BagSpace | null | undefined;
}) {
  let target: WoodTree | null = null;
  let elapsed = 0, swung = 0, landed = 0, stumpCheck = 0, clock = 0, felledShown = 0;
  /** Whether the player was in the grove last frame: leaving it sends the queued falls. */
  let inGrove = false;
  let hint = { text: "", at: -Infinity, tree: -1 };
  let listeningTo: WoodcuttingSource | null = null;
  /** Stumps belong to the account and connection that made them. */
  let session: { source: WoodcuttingSource; identity: string; generation: number } | null = null;

  const now = () => deps.source()?.serverNowMs?.() ?? Date.now();

  function sameSession(source: WoodcuttingSource | null | undefined) {
    return Boolean(source && session?.source === source
      && session.identity === (source.localIdentity?.() ?? "")
      && session.generation === (source.sessionGeneration?.() ?? 0));
  }

  /** Whether a tree is a stump: felled less than its regrowth ago, shortened by the player's Resource Respawn rank. */
  function isFelled(tree: WoodTree, at: number, source: WoodcuttingSource | null | undefined, respawnMs: number) {
    const choppedAt = source?.choppedTreeAt?.(tree.id) ?? null;
    return choppedAt !== null && at - choppedAt < respawnMs;
  }

  function refreshStumps(at: number) {
    woodcuttingScene.felled.clear();
    const source = deps.source(), respawnMs = gatherRespawnMs(WOODCUTTING_RESPAWN_SECONDS, source?.research?.().resourceRespawn ?? 0);
    for (const tree of WOOD_TREE_NODES) if (isFelled(tree, at, source, respawnMs)) woodcuttingScene.felled.add(tree.id);
  }

  /** The nearest standing tree in reach of the player's feet. */
  function treeInReach() {
    const feetX = deps.player.x, feetY = deps.player.y + TOWN_FEET_OFFSET;
    let best: WoodTree | null = null, bestDistance = WOODCUTTING_REACH;
    for (const tree of WOOD_TREE_NODES) {
      if (woodcuttingScene.felled.has(tree.id) || Math.abs(tree.x - feetX) > WOODCUTTING_REACH || Math.abs(tree.y - feetY) > WOODCUTTING_REACH) continue;
      const distance = Math.hypot(tree.x - feetX, tree.y - feetY);
      if (distance <= bestDistance) { best = tree; bestDistance = distance; }
    }
    return best;
  }

  function stop() {
    target = null; elapsed = 0; swung = 0; landed = 0; felledShown = 0; woodcuttingScene.blocked = null;
    woodcuttingScene.target = null; woodcuttingScene.progress = 0; woodcuttingScene.hatchetOut = false; woodcuttingScene.swingClock = 0;
  }

  function reset() {
    stop(); resetWoodcuttingScene(); inGrove = false;
    listeningTo?.setOnWoodcuttingRejected?.(null);
    listeningTo?.setOnWoodcuttingExtra?.(null);
    listeningTo = null; session = null; stumpCheck = 0;
    hint = { text: "", at: -Infinity, tree: -1 };
  }

  function say(text: string, color: string, tree: number) {
    if (text === hint.text && tree === hint.tree && clock - hint.at < HINT_SECONDS) return;
    hint = { text, at: clock, tree };
    deps.message?.(text, color);
  }

  /** Falls the server did not take: their trees stand again at the next look, and the player is told. */
  function listen(source: WoodcuttingSource) {
    if (listeningTo === source || !source.setOnWoodcuttingRejected) return;
    listeningTo = source;
    const started = session;
    source.setOnWoodcuttingRejected(text => {
      if (session !== started || !sameSession(deps.source())) return;
      stumpCheck = 0;
      deps.message?.(text, REJECTED_COLOR);
    });
    source.setOnWoodcuttingExtra?.(ores => {
      if (session !== started || !sameSession(deps.source())) return;
      for (const [logId, count] of Object.entries(ores)) {
        if (count) deps.logPickup?.(moreGatheredText(logId as OreId, count), LOG_COLORS[logId as keyof typeof LOG_COLORS]?.face ?? CHIPS);
      }
    });
  }

  function fell(source: WoodcuttingSource, tree: WoodTree, at: number) {
    const id = tree.id;
    source.queueTreeChop?.(id, at);
    woodcuttingScene.felled.add(id);
    stop();
    const gain = woodcuttingGain(tree);
    const before = woodcuttingScene.level;
    woodcuttingScene.level = Math.max(before + gain, source.woodcutting?.() ?? 0);
    woodcuttingScene.gain = gain;
    woodcuttingScene.gainLeft = 1;
    woodcuttingScene.badgeLeft = 2.6;
    const unlocked = WOOD_STANDS.find(stand => stand.woodcutting > before && stand.woodcutting <= woodcuttingScene.level);
    if (unlocked) deps.message?.(`Woodcutting ${unlocked.woodcutting}: ${unlocked.name}s open now.`, "#ffd34d");
    // The felling hit fills the bar: it stays up a moment over the stump.
    Object.assign(woodcuttingScene, { target: id, progress: 1, hatchetOut: true, swingClock: ATTACK_ANIMATION_SECONDS - ATTACK_WINDUP_SECONDS });
    felledShown = FELLED_SHOW_SECONDS;
    deps.burst?.(tree.x, tree.y - 40, "#7fae5a", 16, 130);
    // What it gives before the hatchet's bonus, which the server rolls.
    const color = LOG_COLORS[tree.log].face;
    const gives = boostedYield(woodcuttingYield(tree), source.serverBoostMultiplier?.() ?? 1);
    deps.logPickup?.(`+${gives[tree.log] ?? 0} ${REFINE_ORES[tree.log].name}`, color);
    deps.burst?.(tree.x, tree.y - 30, color, 12, 95);
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
    woodcuttingScene.gainLeft = Math.max(0, woodcuttingScene.gainLeft - dt / 1.4);
    woodcuttingScene.badgeLeft = Math.max(0, woodcuttingScene.badgeLeft - dt);
    if ((stumpCheck -= dt) <= 0) { stumpCheck = STUMP_REFRESH_SECONDS; refreshStumps(at); }
    const here = Boolean(active && source && deps.player.hp > 0 && inTownGrove(deps.player.x, deps.player.y, WOODCUTTING_REACH * 2));
    // Leaving the grove sends what was felled there while the server still has the player in reach.
    if (inGrove && !here) source?.flushWoodcutting?.();
    inGrove = here;
    if (!here || !source) { stop(); woodcuttingScene.badgeLeft = 0; return; }
    woodcuttingScene.level = Math.max(woodcuttingScene.level, source.woodcutting?.() ?? 0);
    listen(source);
    if (felledShown > 0) {
      felledShown -= dt;
      woodcuttingScene.swingClock = Math.max(0, woodcuttingScene.swingClock - dt);
      if (felledShown > 0 && !deps.player.moving) return;
      stop();
    }
    const tree = treeInReach();
    if (!tree) { stop(); return; }
    if (tree.id !== target?.id) { target = tree; elapsed = 0; swung = 0; landed = 0; }
    if (!canChopTree(tree, source.woodcutting?.() ?? 0)) { stop(); woodcuttingScene.blocked = "stand"; say(woodStandHint(WOOD_STANDS[tree.stand]), "#ff9b91", tree.id); return; }
    // A full bag: told before the swing, not after the tree falls.
    const space = deps.bag?.();
    if (space) {
      const { needed, room } = roomForOres(space, [tree.log]);
      if (!room) { stop(); woodcuttingScene.blocked = "bag"; say(bagFullForOres(needed), "#ff9b91", tree.id); return; }
    }
    const hatchet = source.toolLevel?.("hatchet") ?? 0;
    const seconds = woodcuttingChopSeconds(tree, source.woodcutting?.() ?? 0, hatchet, source.activeCardStats?.().woodcuttingSpeed ?? 0);
    const hits = miningHits(seconds);
    woodcuttingScene.target = tree.id;
    woodcuttingScene.toolLevel = hatchet;
    woodcuttingScene.hatchetOut = true;
    woodcuttingScene.swingClock = Math.max(0, woodcuttingScene.swingClock - dt);
    // Walking pauses the swing; the hits made on this tree stay.
    if (!deps.player.moving) {
      elapsed += dt;
      if (swung < hits && elapsed >= miningHitAt(seconds, swung) - ATTACK_WINDUP_SECONDS) {
        swung++;
        woodcuttingScene.swingClock = ATTACK_ANIMATION_SECONDS;
      }
      while (landed < swung && elapsed >= miningHitAt(seconds, landed)) {
        landed++;
        deps.burst?.(tree.x, tree.y - 22, CHIPS, 4, 60);
      }
    }
    woodcuttingScene.progress = Math.min(1, landed / hits);
    if (elapsed >= seconds) fell(source, tree, at);
  }

  return {
    update,
    /** Clears this session's local woodcutting and stops listening for its refusals. */
    reset,
  };
}
