import {
  PLAYER_GENDER_FEMALE,
  PLAYER_GENDER_MALE,
  normalizePlayerGender,
  playerGenderLabel,
  type PlayerGender,
} from "../../shared/player-gender";

const GENDER_ICON_PATHS = {
  [PLAYER_GENDER_MALE]: "assets/wildwood/gender/male.png",
  [PLAYER_GENDER_FEMALE]: "assets/wildwood/gender/female.png",
} as const;

export function playerGenderIconPath(gender: PlayerGender) {
  const normalized = normalizePlayerGender(gender);
  return normalized === PLAYER_GENDER_MALE || normalized === PLAYER_GENDER_FEMALE
    ? GENDER_ICON_PATHS[normalized]
    : "";
}

export function appendPlayerGenderIcon(
  element: HTMLElement,
  gender: PlayerGender,
  className = "player-gender-icon",
) {
  const source = playerGenderIconPath(gender);
  if (!source) return null;
  const icon = document.createElement("img");
  icon.className = className;
  icon.src = source;
  icon.alt = playerGenderLabel(normalizePlayerGender(gender));
  icon.draggable = false;
  element.appendChild(icon);
  return icon;
}
