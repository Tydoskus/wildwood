import {
  isTownMap, townChunkOf, townRoomAt, townWalkClamp, TOWN_ARRIVAL, TOWN_DOORS, TOWN_FEET_OFFSET, type TownDoor,
} from "../../../../shared/town";
import { SOUL_DOORS_OPEN, SOUL_INTERIOR_SOLIDS, TOWN_VILLAGE_PITS, TOWN_VILLAGE_SOLIDS, type SoulSolid } from "../../town-village";
import { furnishedInteriorSolids, townWindowDecor } from "../../town-world";
import { TOWN_EXCHANGE_SOLIDS } from "../../town-exchange";
import type { MapId, WorldDecor } from "../../world";
import { soulWellFall } from "../soul/soul-well-fall";
import type { PlayerState } from "../types";
import { createMiningRuntime, type MiningSource } from "./mining-runtime";
import { createWoodcuttingRuntime, type WoodcuttingSource } from "./woodcutting-runtime";
import { createFishingRuntime, type FishingSource } from "./fishing-runtime";
import type { InventoryState } from "../../inventory";
import type { OreCounts } from "../../../../shared/ore-bag";
import { bagSlotCapacity } from "../../../../shared/gems";

export type TownSource = Omit<MiningSource & WoodcuttingSource & FishingSource, "research"> & {
  /** What the bag holds besides its items: kept copies, ore stacks, and how many slots are bought. */
  equipmentCopies?: () => readonly unknown[];
  ores?: () => OreCounts;
  inventorySlotsUnlocked?: () => number;
  /** Bag slots, and Resource Respawn for the rocks and trees. */
  research?: () => { inventorySlots?: number; resourceRespawn?: number };
  fallIntoWell?: () => Promise<boolean>;
  useTownDoor?: (door: number) => Promise<boolean>;
  /** A movement packet; forced, it is sent whatever the sparse-movement rules would hold back. */
  syncMovementState?: (x: number, y: number, vx: number, vy: number, inputKind?: "keyboard", force?: boolean) => void;
};

/**
 * Takes a player through a door on the server once the client has them through it. The server judges a door from
 * where it last heard of them, and movement packets are sparse (with multiplayer off a walk sends nothing for up to
 * half a minute), so it first hears where they stand at the door: a halt, forced. A refused door (the server still
 * has them on this side) puts them back where the trip started, so client and server never disagree about which
 * side of a wall they are on.
 */
export function goThroughDoor(options: {
  source: { syncMovementState?: TownSource["syncMovementState"] } | null | undefined;
  player: PlayerState;
  /** Where the trip started, and where it lands. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  use: () => Promise<boolean> | undefined;
  /** Whether a refusal arriving now still belongs to this trip (no later trip, still on the map). */
  current: () => boolean;
  moved: () => void;
}) {
  const { player, to, from } = options;
  options.source?.syncMovementState?.(player.x, player.y, 0, 0, "keyboard", true);
  player.x = to.x;
  player.y = to.y;
  player.moving = false;
  options.moved();
  void (options.use() ?? Promise.resolve(false)).catch(() => {
    if (!options.current()) return;
    player.x = from.x;
    player.y = from.y;
    player.moving = false;
    options.moved();
  });
}

/** The village's water and building footprints, the market square's stalls and goods, and the rooms' walls and furniture: a player cannot walk through them. */
export const TOWN_SOLIDS: readonly SoulSolid[] = [...TOWN_VILLAGE_SOLIDS, ...TOWN_EXCHANGE_SOLIDS, ...furnishedInteriorSolids(SOUL_INTERIOR_SOLIDS)];
/** Where the feet are below the player's position (depth-world-renderer sorts the player there too), and how wide. */
const FEET_OFFSET = TOWN_FEET_OFFSET;
export const TOWN_FEET_RADIUS = 12;
/** A door swings open only once the player walks into it: feet between its posts, in front of its sill and this close. */
const DOOR_PUSH_REACH = 20;
/** How far past the sill feet may be and still count as at the door; anything further is behind the building. */
const DOOR_SILL_DEPTH = 16;
/** Going through: a few steps into the doorway while the screen goes dark. */
const DOORWAY_STEP = 22, DOORWAY_MS = 240;
/** How far into a well's outline the feet must reach to fall: its opening, not its rim. */
const WELL_OPENING = .6;
/** A fall: a stumble to the middle, then the drop, the screen going dark from partway down. */
const FALL_STUMBLE = .18, FALL_SECONDS = 1, FALL_DEPTH = 110, FALL_DARK_AT = .3, FALL_DARK_MS = 600;

function inside(x: number, y: number, solid: SoulSolid) {
  let hit = false;
  for (let i = 0, j = solid.xs.length - 1; i < solid.xs.length; j = i++) {
    if ((solid.ys[i] > y) !== (solid.ys[j] > y) && x < (solid.xs[j] - solid.xs[i]) * (y - solid.ys[i]) / (solid.ys[j] - solid.ys[i]) + solid.xs[i]) hit = !hit;
  }
  return hit;
}
/** Whether a point is in a well's opening: inside its outline shrunk towards its middle. */
function inWell(x: number, y: number, well: SoulSolid) {
  if (x < well.left || x > well.right || y < well.top || y > well.bottom) return false;
  const cx = well.xs.reduce((sum, v) => sum + v, 0) / well.xs.length, cy = well.ys.reduce((sum, v) => sum + v, 0) / well.ys.length;
  return inside(cx + (x - cx) / WELL_OPENING, cy + (y - cy) / WELL_OPENING, well);
}

/** Moves a circle out of a polygon: to the nearest point of its outline, plus the circle's radius. */
export function pushOutOf(circle: { x: number; y: number; r: number }, solid: SoulSolid) {
  const { xs, ys } = solid;
  let inside = false, nearestX = circle.x, nearestY = circle.y, nearest = Infinity;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    if ((ys[i] > circle.y) !== (ys[j] > circle.y) && circle.x < (xs[j] - xs[i]) * (circle.y - ys[i]) / (ys[j] - ys[i]) + xs[i]) inside = !inside;
    const dx = xs[i] - xs[j], dy = ys[i] - ys[j], length = dx * dx + dy * dy;
    const t = length > 0 ? Math.max(0, Math.min(1, ((circle.x - xs[j]) * dx + (circle.y - ys[j]) * dy) / length)) : 0;
    const px = xs[j] + dx * t, py = ys[j] + dy * t, distance = Math.hypot(circle.x - px, circle.y - py);
    if (distance < nearest) { nearest = distance; nearestX = px; nearestY = py; }
  }
  if (!inside && nearest >= circle.r) return;
  // Away from the outline: outward when outside, through it when the centre is already inside.
  let nx = circle.x - nearestX, ny = circle.y - nearestY;
  const length = Math.hypot(nx, ny) || 1;
  nx /= length; ny /= length;
  if (inside) { nx = -nx; ny = -ny; }
  circle.x = nearestX + nx * circle.r;
  circle.y = nearestY + ny * circle.r;
}

/**
 * Runs the Town on the client: streams the countryside's props in and out as
 * the player walks, keeps them out of its houses and water and inside its
 * walls, swings its doors open and takes them through, and drops them down a
 * well that they walk into.
 */
export function createTownRuntime(deps: {
  source: () => TownSource | null | undefined;
  player: PlayerState;
  decor: WorldDecor[];
  currentMapId: () => MapId;
  invalidateDepthOrder: () => void;
  logPickup?: (label: string, color: string) => void;
  /** The game's message line and its particle bursts, for mining in the Copper Hills and chopping in Timberwood. */
  message?: (text: string, color: string) => void;
  /** The bag, for the room a new kind of ore or log needs. */
  inventory?: Pick<InventoryState, "itemIds" | "equippedHead" | "equippedChest" | "equippedFeet" | "equippedRightHand" | "equippedLeftHand">;
  burst?: (x: number, y: number, color: string, count: number, speed: number) => void;
  /** Darkens the screen, runs the action once it is black, and brings the world back around the player. */
  fadeToWorld?: (onBlack: () => void, durationMs?: number) => void;
  clearInput?: () => void;
  /** Where the view is, for a tap on a fishing spot. */
  camera?: { x: number; y: number; zoom: number };
}) {
  let windowKey = "";
  const source = () => deps.source();
  // The bag as the server counts it: its items, kept copies, ore stacks and capacity.
  const bag = () => {
    const inventory = deps.inventory, current = source();
    if (!inventory || !current) return null;
    return {
      owned: inventory.itemIds, ores: current.ores?.() ?? {}, extraCopies: current.equipmentCopies?.().length ?? 0,
      equipped: [inventory.equippedHead, inventory.equippedChest, inventory.equippedFeet, inventory.equippedRightHand, inventory.equippedLeftHand],
      capacity: bagSlotCapacity(current.inventorySlotsUnlocked?.() ?? 0, current.research?.().inventorySlots ?? 0),
    };
  };
  const mining = createMiningRuntime({ source, player: deps.player, message: deps.message, logPickup: deps.logPickup, burst: deps.burst, bag });
  const woodcutting = createWoodcuttingRuntime({ source, player: deps.player, message: deps.message, logPickup: deps.logPickup, burst: deps.burst, bag });
  const fishing = createFishingRuntime({ source, player: deps.player, message: deps.message, logPickup: deps.logPickup, burst: deps.burst, bag });

  /** Brings the props around the player up to date. */
  function refreshWindow(force = false) {
    const { player } = deps;
    const key = `${townChunkOf(player.x)}:${townChunkOf(player.y)}`;
    if (!force && key === windowKey && deps.decor.length) return;
    windowKey = key;
    deps.decor.splice(0, deps.decor.length, ...townWindowDecor(player.x, player.y));
    deps.invalidateDepthOrder();
  }

  /**
   * Collision is at the player's feet, as the pack's colliders sit at the foot of each wall, tree and well:
   * a small circle where the body stands (the same point the world sorts the player by), not its middle.
   * Outside the rooms, the countryside's walls hold the feet in too.
   */
  function resolveCollision() {
    const { player } = deps;
    const feet = { x: player.x, y: player.y + FEET_OFFSET, r: TOWN_FEET_RADIUS };
    for (const solid of TOWN_SOLIDS) {
      if (feet.x <= solid.left - feet.r || feet.x >= solid.right + feet.r || feet.y <= solid.top - feet.r || feet.y >= solid.bottom + feet.r) continue;
      pushOutOf(feet, solid);
    }
    if (!townRoomAt(player.x, player.y, 400)) Object.assign(feet, townWalkClamp(feet.x, feet.y));
    player.x = feet.x;
    player.y = feet.y - FEET_OFFSET;
  }

  /** A fall under way: the stumble to the well's middle, the drop (the camera with it), the dark, the square. */
  let fall: { x: number; y: number; cx: number; cy: number; elapsed: number; dark: boolean } | null = null;
  /** Feet in a well's opening: in they go. */
  function checkWells() {
    const { player } = deps;
    if (fall || player.hp <= 0) return;
    const feetY = player.y + FEET_OFFSET;
    const well = TOWN_VILLAGE_PITS.find(pit => inWell(player.x, feetY, pit));
    if (!well) return;
    const cx = well.xs.reduce((sum, v) => sum + v, 0) / well.xs.length, cy = well.ys.reduce((sum, v) => sum + v, 0) / well.ys.length;
    fall = { x: player.x, y: player.y, cx, cy, elapsed: 0, dark: false };
    Object.assign(soulWellFall, { active: true, lip: cy + (well.bottom - cy) * WELL_OPENING, progress: 0 });
    deps.clearInput?.();
  }
  function updateFall(dt: number) {
    if (!fall) return;
    const { player } = deps;
    fall.elapsed += dt;
    const t = fall.elapsed;
    if (t < FALL_STUMBLE) {
      const k = t / FALL_STUMBLE;
      player.x = fall.x + (fall.cx - fall.x) * k;
      player.y = fall.y + (fall.cy - FEET_OFFSET - fall.y) * k;
    } else {
      // Gravity: slow at the lip, then gone.
      const k = Math.min(1, (t - FALL_STUMBLE) / (FALL_SECONDS - FALL_STUMBLE));
      player.x = fall.cx;
      player.y = fall.cy - FEET_OFFSET + FALL_DEPTH * k * k;
      soulWellFall.progress = k;
    }
    player.moving = false;
    if (!fall.dark && t >= FALL_DARK_AT) {
      fall.dark = true;
      if (deps.fadeToWorld) deps.fadeToWorld(landFall, FALL_DARK_MS);
      else landFall();
    }
    // A fade that never came (one was already running) must not leave the player in the well.
    if (fall && t > FALL_DARK_AT + FALL_DARK_MS / 1_000 + 1.5) landFall();
  }
  /** On the dark: back on the square, and the server is told so it agrees where the player is. */
  function landFall() {
    if (!fall) return;
    fall = null;
    soulWellFall.active = false;
    const { player } = deps;
    player.x = TOWN_ARRIVAL.x;
    player.y = TOWN_ARRIVAL.y;
    player.moving = false;
    lastY = player.y;
    deps.logPickup?.("Splash! You fell into the well", "#7fd4ff");
    void (source()?.fallIntoWell?.() ?? Promise.resolve(false)).catch(() => false);
  }

  /** A trip through a door under way: the doorway's walk, then the move on the dark. */
  let doorway: { door: TownDoor; inward: boolean; x: number; y: number; elapsed: number; done: boolean } | null = null;
  /** Where collision last left the player: whether they are walking into a door is how they moved since. */
  let lastY = Number.NaN;

  /** Counts trips through doors, so a refusal for an old one is not applied to a newer one. */
  let trips = 0;
  function finishDoorway() {
    const trip = doorway;
    if (!trip || trip.done) return;
    trip.done = true;
    doorway = null;
    const serial = ++trips, current = source();
    goThroughDoor({
      source: current, player: deps.player, from: trip, to: trip.inward ? trip.door.inside : trip.door.outside,
      use: () => current?.useTownDoor?.(trip.door.index),
      current: () => serial === trips && !fall && isTownMap(deps.currentMapId()),
      moved: () => { lastY = deps.player.y; },
    });
  }
  function startDoorway(door: TownDoor, inward: boolean) {
    const { player } = deps;
    doorway = { door, inward, x: player.x, y: player.y, elapsed: 0, done: false };
    deps.clearInput?.();
    if (deps.fadeToWorld) deps.fadeToWorld(finishDoorway, DOORWAY_MS);
    else finishDoorway();
  }
  /** The few steps in: the player walks on into the doorway, through the wall, as the dark comes down. */
  function walkDoorway(dt: number) {
    if (!doorway) return;
    const { player } = deps;
    doorway.elapsed += dt;
    const t = Math.min(1, doorway.elapsed * 1_000 / DOORWAY_MS);
    player.x = doorway.x + (doorway.door.x - doorway.x) * t * (doorway.inward ? 1 : 0);
    player.y = doorway.y + (doorway.inward ? -1 : 1) * DOORWAY_STEP * t;
    player.moving = true;
    // A fade that never came (one was already running) must not leave the player stuck in a doorway.
    if (doorway.elapsed > 1.5) finishDoorway();
  }
  /**
   * A door opens when the player pushes into it (feet at its sill, between its posts); walking on into the open
   * door, or out of a room's doorway, goes through.
   */
  function checkDoors() {
    const { player } = deps;
    SOUL_DOORS_OPEN.clear();
    if (player.hp <= 0) return;
    const feetX = player.x, feetY = player.y + FEET_OFFSET;
    const heading = Number.isFinite(lastY) ? player.y - lastY : 0;
    const atSill = (door: { x: number; half: number; enter: number }, reach: number) => Math.abs(feetX - door.x) < door.half
      && feetY > door.enter - DOOR_SILL_DEPTH && feetY < door.enter + TOWN_FEET_RADIUS + reach;
    for (const door of TOWN_DOORS) if (atSill(door, DOOR_PUSH_REACH)) SOUL_DOORS_OPEN.add(door.index);
    const into = TOWN_DOORS.find(door => SOUL_DOORS_OPEN.has(door.index) && atSill(door, 8));
    if (into && heading < 0) { startDoorway(into, true); return; }
    const room = townRoomAt(player.x, player.y);
    if (room && heading > 0 && Math.abs(feetX - room.exit.x) < room.exit.half && feetY > room.exit.y + 4) startDoorway(room, false);
  }

  /** One frame of the Town's own rules; whether the player is left free to act (not at a door, not falling). */
  function step(dt: number) {
    if (!isTownMap(deps.currentMapId())) { windowKey = ""; return false; }
    refreshWindow();
    if (fall) { updateFall(dt); return false; }
    if (doorway) { walkDoorway(dt); return false; }
    checkDoors();
    if (doorway) return false;
    checkWells();
    resolveCollision();
    lastY = deps.player.y;
    return true;
  }

  return {
    update(dt: number) {
      const free = step(dt);
      mining.update(dt, free);
      woodcutting.update(dt, free);
      fishing.update(dt, free);
    },
    /** A tap or click on the screen: true when it picked a fishing spot in reach, so the click does not walk. */
    tap: (clientX: number, clientY: number) => Boolean(deps.camera)
      && fishing.tap(deps.camera!.x + clientX / deps.camera!.zoom, deps.camera!.y + clientY / deps.camera!.zoom),
    /** Forces the window to rebuild, as after the map loads. */
    refresh: () => refreshWindow(true),
  };
}
