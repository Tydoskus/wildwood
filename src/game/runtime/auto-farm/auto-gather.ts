import { isTownMap, TOWN_FEET_OFFSET } from '../../../../shared/town';
import { monotonicNowMs } from '../../../app/trusted-clock';
import { isNativePreview } from '../../../app/native-preview';
import type { Movement } from '../player-input-controller';
import { planTownPath, type TownPoint } from '../town/town-path';
import type { PlayerState } from '../types';

type ResumeStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** What Auto Mine and Auto Chop take from the game: the player, the map, the session and the clock. */
export type AutoGatherOptions = {
  player: PlayerState;
  mapId: () => string;
  /** Tab-local on the web, as Auto Farm's resume is; kept across an app upgrade on native. */
  resumeStorage?: () => ResumeStore | undefined;
  identity?: () => string | undefined;
  unavailable?: () => string | null;
  connection?: () => 'ready' | 'recovering' | 'ended';
  paused?: () => boolean;
  speed?: () => number;
  now?: () => number;
  plan?: (from: TownPoint, to: TownPoint) => TownPoint[] | null;
};

/** A rock or tree to go to, and when it grows back for the player (null while it stands). */
export type GatherTarget<Node> = { node: Node; readyAt: number | null };

/** What makes it Auto Mine or Auto Chop: its area, what it needs, and how it picks and works a node. */
export type GatherRules<Node> = {
  /** "Auto Mine". */
  name: string;
  /** "the Copper Hills": it starts only there, and leaving it stops it. */
  area: string;
  resumeKey: string;
  /** Whether the player (not their feet) is in the area to start (and show the button when off). */
  inArea: (x: number, y: number) => boolean;
  /** Optional wider area allowed while already running (e.g. walking across Town between fishing spots). */
  stayInArea?: (x: number, y: number) => boolean;
  /** What else it needs to work (the tool, a pick), or null. */
  needs: () => string | null;
  choose: (feet: TownPoint) => GatherTarget<Node> | null;
  /** Whether the target is no longer one to go to: unpicked, shut, or felled. */
  stale: (target: GatherTarget<Node>) => boolean;
  spot: (node: Node) => TownPoint;
  /** Standing at the spot: what it is doing, or `stop` to end with that line. */
  arrived: (target: GatherTarget<Node>) => { status: string; stop?: boolean };
  walking: (target: GatherTarget<Node>) => string;
  noTarget: string;
  /** A fresh start: anything learnt last time (a full bag) is forgotten. */
  started?: () => void;
};

/** Feet this close to the spot have arrived; a waypoint this close is passed. */
const ARRIVED = 6, WAYPOINT_REACHED = 8;
/** Walking that gains less than this in STUCK_MS is stuck, and the way is planned again. */
const STUCK_GAIN = 4, STUCK_MS = 1_500;
/** How often the nodes are looked over again while waiting, and a failed plan tried again. */
const CHOOSE_SECONDS = .5, REPLAN_MS = 1_000;

const idle = (): Movement => ({ x: 0, y: 0, source: 'none' });
/** "1:05" to a time `ms` away. */
export const gatherClock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * When a rock or tree taken at `takenAt` grows back, or null while it stands. The session's time decides; the scene's
 * mark lags up to half a second, so it counts only for one the session does not list yet.
 */
export function regrowsAt(takenAt: number | null, respawnMs: number, at: number, markedGone: boolean) {
  if (takenAt !== null) return at - takenAt < respawnMs ? takenAt + respawnMs : null;
  return markedGone ? at + respawnMs : null;
}

/**
 * Auto Mine and Auto Chop's walking: in its own area of the Town, it stands at the nearest node it can work while
 * the Town's runtime works it, then the next. The player's own keys always win; leaving the area stops it.
 */
export function createAutoGather<Node>(options: AutoGatherOptions, rules: GatherRules<Node>) {
  const { player } = options, { name, area } = rules;
  const now = options.now ?? monotonicNowMs;
  const plan = options.plan ?? planTownPath;
  const resumeStorage = options.resumeStorage ?? (() => { try { return isNativePreview() ? window.localStorage : window.sessionStorage; } catch { return undefined; } });
  const readResume = () => { try { return resumeStorage()?.getItem(rules.resumeKey) ?? null; } catch { return null; } };
  const writeResume = () => { try { resumeStorage()?.setItem(rules.resumeKey, options.identity?.() ?? ''); } catch { /* It still runs this session. */ } };
  const clearResume = () => { try { resumeStorage()?.removeItem(rules.resumeKey); } catch { /* Nothing to carry over. */ } };
  /** On when the page went away (an update's reload) or the session dropped: it comes back on once it can work. */
  let pending = readResume() !== null;
  let active = false;
  let status = pending ? `Resuming ${name}` : 'Off';
  let target: GatherTarget<Node> | null = null;
  let chooseClock = 0;
  let route: TownPoint[] = [];
  let goal: TownPoint | null = null;
  let planFailedAt = -Infinity;
  /** The headway towards the current waypoint: the closest yet, and when. */
  let progress: { at: number; distance: number; waypoint: TownPoint | null } = { at: 0, distance: Infinity, waypoint: null };

  const feet = (): TownPoint => ({ x: player.x, y: player.y + TOWN_FEET_OFFSET });
  const inTown = () => isTownMap(options.mapId());
  const inStayArea = () => (rules.stayInArea ?? rules.inArea)(player.x, player.y);
  const here = () => inTown() && (active || pending ? inStayArea() : rules.inArea(player.x, player.y));

  /** Why it cannot work now, or null. */
  function problem() {
    if (!here()) return `${name} Works in ${area}`;
    return rules.needs();
  }

  function forget() { target = null; route = []; goal = null; chooseClock = 0; progress = { at: 0, distance: Infinity, waypoint: null }; }
  /** `resume` keeps it to come back on (a dropped session); otherwise it stays off. */
  function stop(reason = `${name} Stopped`, resume = false) {
    if (resume && active) pending = true;
    if (!resume) { pending = false; clearResume(); }
    active = false;
    status = reason;
    forget();
  }
  /** Back on after a reload or a dropped session, once connected and able to work, for the same player, still in the area. */
  function resumeWhenReady() {
    if (!pending) return;
    const saved = readResume(), identity = options.identity?.();
    if (saved && identity && saved !== identity) { stop('Off'); return; }
    if (!inTown() || (options.connection && options.connection() !== 'ready') || options.unavailable?.() || options.paused?.() || rules.needs()) return;
    // Back somewhere else: it does not wait to start when they next walk in.
    if (!here()) { stop('Off'); return; }
    pending = false;
    start();
  }
  function start() {
    if (options.connection && options.connection() !== 'ready') { stop(`Connect to the Server to Use ${name}`); return false; }
    const reason = options.unavailable?.() ?? problem();
    if (reason) { stop(reason); return false; }
    forget();
    rules.started?.();
    active = true;
    pending = false;
    writeResume();
    status = 'Starting';
    return true;
  }

  /** Steps along the planned walk to `to` (feet); re-plans for a new goal, an empty walk, or no headway. */
  function walk(to: TownPoint, dt: number): Movement {
    const at = feet(), clockNow = now();
    if (!goal || Math.hypot(goal.x - to.x, goal.y - to.y) > 1) { goal = to; route = []; planFailedAt = -Infinity; }
    if (!route.length) {
      if (clockNow - planFailedAt < REPLAN_MS) return idle();
      const planned = plan(at, to);
      if (!planned) { planFailedAt = clockNow; status = 'No Way There'; return idle(); }
      route = planned;
    }
    while (route.length > 1 && Math.hypot(route[0].x - at.x, route[0].y - at.y) < WAYPOINT_REACHED) route.shift();
    const waypoint = route[0], distance = Math.hypot(waypoint.x - at.x, waypoint.y - at.y);
    if (waypoint !== progress.waypoint || distance < progress.distance - STUCK_GAIN) progress = { at: clockNow, distance, waypoint };
    else if (clockNow - progress.at > STUCK_MS) { route = []; progress.waypoint = null; return idle(); }
    const step = Math.max(1, (options.speed?.() ?? 300) * dt), magnitude = Math.min(1, distance / step);
    return { x: (waypoint.x - at.x) / Math.max(distance, 1e-6) * magnitude, y: (waypoint.y - at.y) / Math.max(distance, 1e-6) * magnitude, source: 'steer' };
  }

  function movement(manual: Movement, dt: number): Movement | null {
    if (!active) resumeWhenReady();
    if (!active) return null;
    if (!inTown()) { stop(`${name} Stopped: Left the Town`); return null; }
    if (!inStayArea()) { stop(`${name} Stopped: Left ${area}`); return null; }
    const connection = options.connection?.() ?? 'ready';
    if (connection === 'ended') { stop(`${name} Stopped for Sign-In`, true); return null; }
    if (manual.x || manual.y) { status = 'Manual Control'; route = []; goal = null; return manual; }
    if (connection === 'recovering') { status = 'Reconnecting'; route = []; goal = null; return idle(); }
    const reason = options.unavailable?.();
    if (reason) { stop(reason, true); return null; }
    if (options.paused?.()) { status = 'Paused'; return idle(); }
    const blocker = rules.needs();
    if (blocker) { status = blocker; forget(); return idle(); }
    chooseClock -= dt;
    if (!target || rules.stale(target) || (target.readyAt !== null && chooseClock <= 0)) {
      target = rules.choose(feet());
      chooseClock = CHOOSE_SECONDS;
    }
    if (!target) { status = rules.noTarget; return idle(); }
    const spot = rules.spot(target.node), at = feet();
    if (Math.hypot(spot.x - at.x, spot.y - at.y) <= ARRIVED) {
      route = []; goal = null;
      const result = rules.arrived(target);
      if (result.stop) { stop(result.status); return null; }
      status = result.status;
      return idle();
    }
    const moving = walk(spot, dt);
    if (moving.source === 'steer') status = rules.walking(target);
    return moving;
  }

  return {
    start,
    stop,
    movement,
    /** Any travel: leaving the Town ends it, and it does not come back on its own. */
    travelStarted() { if (active || pending) stop(`${name} Stopped: Left the Town`); },
    inTown,
    /** In its own area of the Town, where its button shows. */
    here,
    problem,
    /** Drops the target, to choose again (its picks changed). */
    forget,
    state: () => ({ active, waiting: !active && pending, status, target: target?.node ?? null }),
  };
}
