// The attack speed constants the rating curve stands on, apart from rules.ts so stat-rating.ts imports nothing that
// leads back to items.ts (rules → progression → items → stat-rating would leave these undefined while loading).
export const DEFAULT_ATTACK_INTERVAL = 1.56;
/** The base attack speed cap. Reflect Only wins and Quick Draw raise it. */
export const MAX_BASE_ATTACKS_PER_SECOND = 3;
export const MIN_ATTACK_INTERVAL = 1 / MAX_BASE_ATTACKS_PER_SECOND;
