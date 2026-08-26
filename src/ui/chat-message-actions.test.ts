import { describe, expect, it } from "vitest";
import {
  messageActionAvailability,
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
  it("offers reports for another player's ordinary or replay message", () => {
    expect(shouldOfferMessageReport(target, "local-player")).toBe(true);
    expect(shouldOfferMessageReport(target, "other-player")).toBe(false);
    expect(shouldOfferMessageReport({ ...target, replayId: 2n }, "local-player")).toBe(true);
  });

  it("replaces Copy with Watch Replay while retaining Reply and Report", () => {
    expect(messageActionAvailability(target, "local-player")).toEqual({
      watchReplay: false,
      copy: true,
      reply: true,
      report: true,
    });
    expect(messageActionAvailability({ ...target, replayId: 2n }, "local-player")).toEqual({
      watchReplay: true,
      copy: false,
      reply: true,
      report: true,
    });
  });

  it("dismisses on a deliberate pull or a quick downward swipe", () => {
    expect(shouldDismissMessageActionSheet(90, 320, 500)).toBe(true);
    expect(shouldDismissMessageActionSheet(32, 320, 45)).toBe(true);
    expect(shouldDismissMessageActionSheet(32, 320, 500)).toBe(false);
  });
});
