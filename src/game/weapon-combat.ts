import { DAGGER_REACH } from "../../shared/campaign-equipment";
import { itemDefinition } from "../../shared/items";

export function isMeleeWeapon(itemId: string | undefined) {
  return itemDefinition(itemId)?.weapon?.mode === "MELEE";
}

export function isDagger(itemId: unknown) {
  return itemDefinition(itemId)?.weapon?.mode === "MELEE" && itemDefinition(itemId)?.weapon?.range === DAGGER_REACH;
}
/** A weapon's reach from the range in play (shared/player-stats.ts). */
export { weaponAttackRange } from "../../shared/player-stats";

/** First intersection, including circles whose near edge crosses the segment end. */
export function segmentCircleHit(ex: number, ey: number, dx: number, dy: number, radius: number) {
  const c = ex * ex + ey * ey - radius * radius;
  if (c <= 0) return 0;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return null;
  const dot = ex * dx + ey * dy;
  const discriminant = dot * dot - lengthSq * c;
  if (discriminant < 0) return null;
  const t = (dot - Math.sqrt(discriminant)) / lengthSq;
  return t >= 0 && t <= 1 ? t : null;
}

/** First intersection with an axis-aligned oval, including a start inside it. */
export function segmentEllipseHit(ex: number, ey: number, dx: number, dy: number, horizontalRadius: number, verticalRadius: number) {
  return segmentCircleHit(ex / horizontalRadius, ey / verticalRadius, dx / horizontalRadius, dy / verticalRadius, 1);
}
