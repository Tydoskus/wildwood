import { describe, expect, it } from "vitest";
import { shouldShowGameStartupAccountChoice } from "./game-bootstrap";

describe("game startup account choice", () => {
  it("does not reopen account choice after OAuth approved the game session", () => {
    expect(shouldShowGameStartupAccountChoice({
      knownAccount: true,
      signInRequired: true,
      gameSessionApproved: true,
    })).toBe(false);
  });

  it("keeps OAuth return on loading instead of flashing account choice", () => {
    expect(shouldShowGameStartupAccountChoice({
      knownAccount: true,
      signInRequired: true,
      returningFromSignIn: true,
    })).toBe(false);
  });

  it("still shows account choice to a new or signed-out player", () => {
    expect(shouldShowGameStartupAccountChoice(undefined)).toBe(true);
    expect(shouldShowGameStartupAccountChoice({ knownAccount: true, signInRequired: true })).toBe(true);
  });
});
