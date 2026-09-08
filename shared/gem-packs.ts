/** Stable catalog for future verified store fulfillment. Prices are USD cents. */
export const GEM_PACKS = [
  { id: 'gems_60', gems: 60, priceCents: 199 },
  { id: 'gems_220', gems: 220, priceCents: 699 },
  { id: 'gems_800', gems: 800, priceCents: 2499 },
  { id: 'gems_3300', gems: 3300, priceCents: 9999 },
] as const;

export const GEM_PACK_DAILY_LIMIT = 1;
// The future verified checkout service must enforce this per account and pack,
// atomically with fulfillment, across all platforms. Never use local storage.
export const GEM_PACK_RESET_TIME_ZONE = 'UTC';
