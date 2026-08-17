import { describe, expect, it } from "vitest";
import { duelReplayIsInteractive, presentedChatPower } from "./chat-presentation";

describe("chat duel presentation", () => {
  it("shows sender power on duel announcements", () => {
    expect(presentedChatPower(425, "winner", "winner", null)).toBe(425);
  });

  it("uses local player stats when a loss announcement is presented as local chat", () => {
    expect(presentedChatPower(425, "winner", "loser", {
      maxHp: 30,
      damage: 4,
      attackRate: 1.3,
      armor: 0,
      regen: 0,
    })).toBe(35);
  });

  it("only opens replays from expanded chat", () => {
    expect(duelReplayIsInteractive(9n, false)).toBe(false);
    expect(duelReplayIsInteractive(9n, true)).toBe(true);
  });
});
