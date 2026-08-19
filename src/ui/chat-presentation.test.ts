import { describe, expect, it } from "vitest";
import { duelReplayIsInteractive } from "./chat-presentation";

describe("chat duel presentation", () => {
  it("only opens replays from expanded chat", () => {
    expect(duelReplayIsInteractive(9n, false)).toBe(false);
    expect(duelReplayIsInteractive(9n, true)).toBe(true);
  });
});
