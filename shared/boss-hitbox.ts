/**
 * The shape a boss is hit with.
 *
 * Every boss used to be a circle of `radius` centred on its position. That
 * holds for a boss drawn about as tall as it is wide, and fails for a squat
 * one: Miremaw is a toad roughly 456 across and 342 tall, so a circle wide
 * enough to cover its flanks also reaches well above its head, and an arrow
 * lands before it touches the artwork.
 *
 * A boss may now carry a vertical radius and a vertical offset. Leaving both
 * out keeps the old circle exactly — the arithmetic below reduces to the
 * original expression — so a boss that already plays correctly is untouched.
 */
export type BossHitbox = {
  /** Half the body's width. */
  radius: number;
  /** Half its height; the radius when omitted, which is the circle. */
  verticalRadius?: number;
  /** Where the body's middle sits relative to the anchor, positive downward. */
  offsetY?: number;
};

export function bossVerticalRadius(radius: number, verticalRadius?: number) {
  return Number.isFinite(verticalRadius) && (verticalRadius as number) > 0 ? verticalRadius as number : radius;
}

/**
 * How far a point is from the boss's surface: negative inside it, and the gap
 * to close outside it. Callers compare this with the attacker's range, exactly
 * as they compared `distance - radius` before.
 */
export function bossSurfaceDistance(
  dx: number,
  dy: number,
  radius: number,
  verticalRadius?: number,
  offsetY = 0,
) {
  const vertical = bossVerticalRadius(radius, verticalRadius);
  const fromCentre = dy - offsetY;
  if (vertical === radius) return Math.hypot(dx, fromCentre) - radius;
  // Scale the vertical axis so the ellipse becomes a circle of `radius`. This
  // is the usual approximation: exact along both axes, and slightly generous
  // on the diagonal, which is the forgiving direction for a player to be wrong.
  return Math.hypot(dx, fromCentre * radius / vertical) - radius;
}

/**
 * Miremaw is a toad: wide, low, and sitting below the point the server
 * measures from. Its circle reached 140 units above the creature's head, so an
 * arrow was counted as a hit while it was still in open air.
 *
 * Measured by `node scripts/check-boss-hitboxes.mjs`.
 */
export const MIREMAW_VERTICAL_RADIUS = 95;
/** Its width, unchanged; kept here so the geometry can be tested on its own. */
export const MIREMAW_RADIUS_REFERENCE = 170;
export const MIREMAW_HITBOX_OFFSET_Y = 65;
