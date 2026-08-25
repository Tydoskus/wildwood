import { describe, expect, it } from "vitest";
import {
  duelReplayIsInteractive,
  formatChatTime,
  shouldShowGlobalChatMessage,
} from "./chat-presentation";

describe("chat duel presentation", () => {
  it("only opens replays from expanded chat", () => {
    expect(duelReplayIsInteractive(9n, false)).toBe(false);
    expect(duelReplayIsInteractive(9n, true)).toBe(true);
  });

  it("formats centered chat times without a leading zero or day period", () => {
    expect(formatChatTime(new Date(2026, 0, 1, 1, 2))).toBe("1:02");
    expect(formatChatTime(new Date(2026, 0, 1, 13, 5))).toBe("1:05");
    expect(formatChatTime(new Date(2026, 0, 1, 0, 7))).toBe("12:07");
  });

  it("hides global login and leave announcements until friend chat exists", () => {
    expect(shouldShowGlobalChatMessage("")).toBe(false);
    expect(shouldShowGlobalChatMessage("AtomTank")).toBe(true);
  });
});
