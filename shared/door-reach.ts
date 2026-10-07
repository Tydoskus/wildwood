/**
 * A door judged from where the server last heard of a player.
 *
 * Movement packets are sparse: a player with multiplayer off sends no start
 * and no halt for up to half a minute, so the server's position for someone
 * standing at a door can still be wherever they last stopped. A door that only
 * looked there refused honest trips by the hundred (0.900.0–0.900.2). This
 * walks the player from that last position towards each side of the door (its
 * sill outside, its room's doorway), as far as they could have walked since,
 * and asks the door's own rule there: a door they could honestly have reached
 * works, one they could not still does not. A movement packet from the same
 * player is accepted out to the same distance, so this trusts no more than
 * movement already does.
 */
export function doorDestinationWithin<T>(
  destinationAt: (x: number, y: number) => T | null,
  from: { x: number; y: number },
  allowance: number,
  sides: readonly { x: number; y: number }[],
): T | null {
  const exact = destinationAt(from.x, from.y);
  if (exact) return exact;
  const reach = Number.isFinite(allowance) ? Math.max(0, allowance) : 0;
  const nearestFirst = [...sides].sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
  for (const side of nearestFirst) {
    const distance = Math.hypot(side.x - from.x, side.y - from.y);
    const k = distance > 0 ? Math.min(1, reach / distance) : 0;
    const destination = destinationAt(from.x + (side.x - from.x) * k, from.y + (side.y - from.y) * k);
    if (destination) return destination;
  }
  return null;
}
