import {
  isTownMap, townChunkOf, townRoomAt, TOWN_ARRIVAL, TOWN_DOORS, TOWN_FEET_OFFSET, TOWN_WALK_AREA, type TownDoor,
} from "../../../shared/town";
import { SOUL_DOORS_OPEN, SOUL_INTERIOR_SOLIDS, SOUL_VILLAGE_PITS, SOUL_VILLAGE_SOLIDS, type SoulSolid } from "../soul-village";
import { townWindowDecor } from "../town-world";
import type { MapId, WorldDecor } from "../world";
import { soulWellFall } from "./soul-well-fall";
import type { PlayerState } from "./types";

export type TownSource = {
  fallIntoWell?: () => Promise<boolean>;
  useTownDoor?: (door: number) => Promise<boolean>;
};

/** The village's water and building footprints, and the rooms' walls and furniture: a player cannot walk through them. */
const SOLIDS = [...SOUL_VILLAGE_SOLIDS, ...SOUL_INTERIOR_SOLIDS];
/** Where the feet are below the player's position (depth-world-renderer sorts the player there too), and how wide. */
const FEET_OFFSET = TOWN_FEET_OFFSET;
const FEET_RADIUS = 12;
/** A door swings open while feet are this near its sill. */
const DOOR_OPEN_RANGE = 120;
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
  /** Darkens the screen, runs the action once it is black, and brings the world back around the player. */
  fadeToWorld?: (onBlack: () => void, durationMs?: number) => void;
  clearInput?: () => void;
}) {
  let windowKey = "";
  const source = () => deps.source();

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
    const feet = { x: player.x, y: player.y + FEET_OFFSET, r: FEET_RADIUS };
    for (const solid of SOLIDS) {
      if (feet.x <= solid.left - feet.r || feet.x >= solid.right + feet.r || feet.y <= solid.top - feet.r || feet.y >= solid.bottom + feet.r) continue;
      pushOutOf(feet, solid);
    }
    if (!townRoomAt(player.x, player.y, 400)) {
      feet.x = Math.max(TOWN_WALK_AREA.left, Math.min(TOWN_WALK_AREA.right, feet.x));
      feet.y = Math.max(TOWN_WALK_AREA.top, Math.min(TOWN_WALK_AREA.bottom, feet.y));
    }
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
    const well = SOUL_VILLAGE_PITS.find(pit => inWell(player.x, feetY, pit));
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

  function finishDoorway() {
    const trip = doorway;
    if (!trip || trip.done) return;
    trip.done = true;
    const { player } = deps;
    const to = trip.inward ? trip.door.inside : trip.door.outside;
    player.x = to.x;
    player.y = to.y;
    player.moving = false;
    lastY = player.y;
    doorway = null;
    void (source()?.useTownDoor?.(trip.door.index) ?? Promise.resolve(false)).catch(() => false);
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
   * Doors near the player stand open; walking on into an open one (feet at its sill, between its posts, still
   * heading in) or out of a room's doorway goes through.
   */
  function checkDoors() {
    const { player } = deps;
    SOUL_DOORS_OPEN.clear();
    if (player.hp <= 0) return;
    const feetX = player.x, feetY = player.y + FEET_OFFSET;
    const heading = Number.isFinite(lastY) ? player.y - lastY : 0;
    for (const door of TOWN_DOORS) if (Math.hypot(feetX - door.x, feetY - door.y) < DOOR_OPEN_RANGE) SOUL_DOORS_OPEN.add(door.index);
    const into = TOWN_DOORS.find(door => SOUL_DOORS_OPEN.has(door.index) && Math.abs(feetX - door.x) < door.half && feetY < door.enter + FEET_RADIUS + 8);
    if (into && heading < 0) { startDoorway(into, true); return; }
    const room = townRoomAt(player.x, player.y);
    if (room && heading > 0 && Math.abs(feetX - room.exit.x) < room.exit.half && feetY > room.exit.y + 4) startDoorway(room, false);
  }

  return {
    update(dt: number) {
      if (!isTownMap(deps.currentMapId())) { windowKey = ""; return; }
      refreshWindow();
      if (fall) { updateFall(dt); return; }
      if (doorway) { walkDoorway(dt); return; }
      checkDoors();
      if (doorway) return;
      checkWells();
      resolveCollision();
      lastY = deps.player.y;
    },
    /** Forces the window to rebuild, as after the map loads. */
    refresh: () => refreshWindow(true),
  };
}
export type TownRuntime = ReturnType<typeof createTownRuntime>;
