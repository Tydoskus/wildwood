import { describe, expect, it } from "vitest";
import {
  MAX_ACTIVE_SPEECH_BUBBLES_PER_PLAYER,
  activeSpeechBubbleMessages,
} from "./player-identity-renderer";

function message(sender: string, text: string, sentAtMs: number, senderName = sender, replayId = 0n) {
  return { id: BigInt(sentAtMs), sender, senderName, message: text, replayId, sentAtMs };
}

describe("player speech bubbles", () => {
  it("stacks the newest active message nearest the player and pushes older messages upward", () => {
    const now = 10_000;
    const active = activeSpeechBubbleMessages([
      message("rymel", "expired", now - 8_000),
      message("rymel", "oldest active", now - 7_000),
      message("rymel", "middle", now - 3_000),
      message("rymel", "newer", now - 2_000),
      message("rymel", "newest", now - 1_000),
    ], now);

    expect(MAX_ACTIVE_SPEECH_BUBBLES_PER_PLAYER).toBe(3);
    expect(active.get("rymel")?.map((entry) => entry.message)).toEqual(["newest", "newer", "middle"]);
  });

  it("keeps system and duel announcements out of overhead bubbles", () => {
    const now = 10_000;
    const active = activeSpeechBubbleMessages([
      message("system", "rymel has logged in.", now - 1_000, ""),
      message("duel", "A duel finished.", now - 1_000, "DUEL", 1n),
      message("player", "hello", now - 1_000),
    ], now);

    expect([...active.keys()]).toEqual(["player"]);
  });
});
