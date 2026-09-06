import { describe, expect, it } from "vitest";
import { createChatUnreadTracker } from "./chat-unread";
const row = (id: bigint, sentAtMs = 101, sender = "friend") => ({ id, sentAtMs, sender });

describe("chat unread tracking", () => {
  it("ignores initial and delayed historical hydration, then counts incoming IDs only once", () => {
    const tracker = createChatUnreadTracker(100);
    expect(tracker.refresh("me", [row(1n)], new Map(), null).guild).toBe(0);
    expect(tracker.refresh("me", [row(1n), row(2n, 90)], new Map(), null).guild).toBe(0);
    expect(tracker.refresh("me", [row(1n), row(2n, 90), row(3n)], new Map(), null).guild).toBe(1);
    expect(tracker.refresh("me", [row(1n), row(2n, 90), row(3n)], new Map(), null).guild).toBe(1);
  });
  it("keeps other private conversations unread when one conversation is read", () => {
    const tracker = createChatUnreadTracker(100);
    tracker.refresh("me", [], new Map(), null);
    const rows = new Map([["friend", [row(1n)]], ["other", [row(2n, 101, "other")]]]);
    const incoming = tracker.refresh("me", [], rows, null);
    expect(incoming.private).toBe(2);
    expect(incoming.conversations.get("other")).toBe(1);
    expect(tracker.refresh("me", [], rows, "private:friend").private).toBe(1);
    expect(tracker.refresh("me", [], rows, "private:other").private).toBe(0);
  });
  it("ignores own messages and clears removed messages and session unread state", () => {
    const tracker = createChatUnreadTracker(100);
    tracker.refresh("me", [], new Map(), null);
    expect(tracker.refresh("me", [row(1n, 101, "me"), row(2n)], new Map(), null).guild).toBe(1);
    expect(tracker.refresh("me", [], new Map(), null).guild).toBe(0);
    tracker.reset(200);
    expect(tracker.refresh("other-account", [row(2n)], new Map(), null).guild).toBe(0);
  });
});
