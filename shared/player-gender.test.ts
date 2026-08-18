import { describe, expect, it } from "vitest";
import {
  PLAYER_GENDER_FEMALE,
  PLAYER_GENDER_MALE,
  PLAYER_GENDER_UNSET,
  isSelectedPlayerGender,
  normalizePlayerGender,
  playerGenderLabel,
} from "./player-gender";

describe("player gender", () => {
  it("normalizes persisted and untrusted values", () => {
    expect(normalizePlayerGender(PLAYER_GENDER_MALE)).toBe(PLAYER_GENDER_MALE);
    expect(normalizePlayerGender(PLAYER_GENDER_FEMALE)).toBe(PLAYER_GENDER_FEMALE);
    expect(normalizePlayerGender(0)).toBe(PLAYER_GENDER_UNSET);
    expect(normalizePlayerGender(3)).toBe(PLAYER_GENDER_UNSET);
    expect(normalizePlayerGender(Number.NaN)).toBe(PLAYER_GENDER_UNSET);
  });

  it("only treats male and female as selectable values", () => {
    expect(isSelectedPlayerGender(PLAYER_GENDER_MALE)).toBe(true);
    expect(isSelectedPlayerGender(PLAYER_GENDER_FEMALE)).toBe(true);
    expect(isSelectedPlayerGender(PLAYER_GENDER_UNSET)).toBe(false);
  });

  it("provides accessible labels", () => {
    expect(playerGenderLabel(PLAYER_GENDER_MALE)).toBe("Male");
    expect(playerGenderLabel(PLAYER_GENDER_FEMALE)).toBe("Female");
    expect(playerGenderLabel(PLAYER_GENDER_UNSET)).toBe("Not selected");
  });
});
