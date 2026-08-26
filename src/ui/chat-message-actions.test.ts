import { describe, expect, it } from "vitest";
import {
  shouldDismissMessageActionSheet,
  shouldOfferMessageReport,
} from "./chat-message-actions";

const target = {
  id: 7n,
  sender: "other-player",
  senderName: "Mossy Wolf",
  message: "hello",
  replayId: 0n,
};

describe("chat message actions", () => {
  it("offers reports only for another player's ordinary message", () => {
    expect(shouldOfferMessageReport(target, "local-player")).toBe(true);
    expect(shouldOfferMessageReport(target, "other-player")).toBe(false);
    expect(shouldOfferMessageReport({ ...target, replayId: 2n }, "local-player")).toBe(false);
  });

  it("dismisses on a deliberate pull or a quick downward swipe", () => {
    expect(shouldDismissMessageActionSheet(90, 320, 500)).toBe(true);
    expect(shouldDismissMessageActionSheet(32, 320, 45)).toBe(true);
    expect(shouldDismissMessageActionSheet(32, 320, 500)).toBe(false);
  });
});
