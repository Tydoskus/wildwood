export const PLAYER_GENDER_UNSET = 0 as const;
export const PLAYER_GENDER_MALE = 1 as const;
export const PLAYER_GENDER_FEMALE = 2 as const;

export type PlayerGender =
  | typeof PLAYER_GENDER_UNSET
  | typeof PLAYER_GENDER_MALE
  | typeof PLAYER_GENDER_FEMALE;

export type SelectedPlayerGender = Exclude<PlayerGender, typeof PLAYER_GENDER_UNSET>;

export function normalizePlayerGender(value: unknown): PlayerGender {
  const numeric = Number(value);
  if (numeric === PLAYER_GENDER_MALE || numeric === PLAYER_GENDER_FEMALE) return numeric;
  return PLAYER_GENDER_UNSET;
}

export function isSelectedPlayerGender(value: unknown): value is SelectedPlayerGender {
  return value === PLAYER_GENDER_MALE || value === PLAYER_GENDER_FEMALE;
}

export function playerGenderLabel(gender: PlayerGender) {
  if (gender === PLAYER_GENDER_MALE) return "Male";
  if (gender === PLAYER_GENDER_FEMALE) return "Female";
  return "Not selected";
}
