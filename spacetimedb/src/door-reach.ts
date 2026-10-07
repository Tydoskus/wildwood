import { doorDestinationWithin } from "../../shared/door-reach";
import { BLACK_BOOTS_SPEED_BONUS } from "../../shared/items";
import { PLAYER_SPEED } from "../../shared/rules";
import { effectiveMovementSpeedForProgress } from "./player-speed";
import { readPlayerProgress } from "./wide-stats";

/** The slack a movement packet gets on top of speed × time (presence-runtime's MOVEMENT_POSITION_PACKET_TOLERANCE; a test keeps them equal). */
export const DOOR_POSITION_TOLERANCE = 96;

/**
 * Where a door reducer sends a player (shared/door-reach.ts has why): its rule at the server's extrapolated
 * position, or else anywhere the player could have walked since their last movement packet, at the fastest
 * speed the server would accept from them in one.
 */
export function doorDestinationFor<T>(
  ctx: any,
  moving: { x: number; y: number; speed?: number; identity: any; mapId: string },
  destinationAt: (x: number, y: number) => T | null,
  sides: readonly { x: number; y: number }[],
): T | null {
  const exact = destinationAt(moving.x, moving.y);
  if (exact) return exact;
  const motion = ctx.db.playerMotion.identity.find(moving.identity);
  if (!motion || motion.mapId !== moving.mapId || ![motion.x, motion.y].every(Number.isFinite)) return null;
  const elapsed = Math.max(0, Number(ctx.timestamp.microsSinceUnixEpoch - motion.lastInputAt.microsSinceUnixEpoch) / 1_000_000);
  const progress = readPlayerProgress(ctx, moving.identity);
  const speed = Math.max(PLAYER_SPEED, Number.isFinite(moving.speed) ? moving.speed! : 0,
    progress ? effectiveMovementSpeedForProgress(ctx, progress) + BLACK_BOOTS_SPEED_BONUS : 0);
  return doorDestinationWithin(destinationAt, motion, speed * elapsed + DOOR_POSITION_TOLERANCE, sides);
}

/**
 * Whether a player is within `range` of a station (the Loadout Upgrades bench): at the server's position, or
 * anywhere they could have walked since their last movement packet, as a door is judged.
 */
export function withinStationReach(ctx: any, player: { x: number; y: number; speed?: number; identity: any; mapId: string },
  station: { x: number; y: number }, range: number) {
  return doorDestinationFor(ctx, player, (x, y) => Math.hypot(x - station.x, y - station.y) <= range ? true : null, [station]) === true;
}
