export const TERMS_VERSION = "2026-08-29";
export const MINIMUM_PLAYER_AGE = 13;
export const AGE_SLIDER_MIN = 1;
export const AGE_SLIDER_MAX = 100;

export const AGE_BAND_UNDER_13 = 0;
export const AGE_BAND_TEEN = 1;
export const AGE_BAND_ADULT = 2;

export type PlayerAgeBand =
  | typeof AGE_BAND_UNDER_13
  | typeof AGE_BAND_TEEN
  | typeof AGE_BAND_ADULT;

export type EligiblePlayerAgeBand = Exclude<PlayerAgeBand, typeof AGE_BAND_UNDER_13>;

export function playerAgeBand(age: number): PlayerAgeBand {
  if (!Number.isInteger(age) || age < AGE_SLIDER_MIN || age > AGE_SLIDER_MAX) {
    throw new RangeError(`Age must be a whole number from ${AGE_SLIDER_MIN} to ${AGE_SLIDER_MAX}.`);
  }
  if (age < MINIMUM_PLAYER_AGE) return AGE_BAND_UNDER_13;
  if (age < 18) return AGE_BAND_TEEN;
  return AGE_BAND_ADULT;
}

export function isEligiblePlayerAgeBand(ageBand: number): ageBand is EligiblePlayerAgeBand {
  return ageBand === AGE_BAND_TEEN || ageBand === AGE_BAND_ADULT;
}
