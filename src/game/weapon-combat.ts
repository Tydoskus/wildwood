import { itemDefinition } from "../../shared/items";
import { DEFAULT_ATTACK_RANGE } from "../../shared/rules";

export function isMeleeWeapon(itemId: string | undefined) {
  return itemDefinition(itemId)?.weapon?.mode === "MELEE";
}
/** Apply a saved range bonus to either a ranged weapon or a melee weapon's reach. */
export function weaponAttackRange(itemId: string | undefined, rangedRange: number) {
  const weapon = itemDefinition(itemId)?.weapon;
  return weapon?.mode === "MELEE" ? (weapon.range ?? 75) + Math.max(0, rangedRange - DEFAULT_ATTACK_RANGE) : rangedRange;
}

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
