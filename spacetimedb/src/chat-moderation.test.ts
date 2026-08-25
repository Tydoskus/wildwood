import { describe, expect, it } from "vitest";
import { MODERATED_CHAT_MESSAGE } from "../../shared/chat-message";
import {
  moderatePublicChatMessage,
  shouldModeratePublicChatMessage,
} from "./chat-moderation";

describe("public chat moderation", () => {
  it("leaves ordinary gameplay chat untouched", () => {
    const allowed = [
      "I killed the dragon boss",
      "Join me in the desert",
      "Niger is a country",
      "The grape dropped near the bench",
      "The path is wet back near the portal",
      "The daily bonus gives free gems",
      "Message moderated.",
    ];

    for (const message of allowed) {
      expect(moderatePublicChatMessage(message)).toEqual({ message, moderated: false });
    }
  });

  it("catches severe slurs with simple leetspeak and separator evasions", () => {
    expect(shouldModeratePublicChatMessage("n1gg3r")).toBe(true);
    expect(shouldModeratePublicChatMessage("f.a.g.g.0.t")).toBe(true);
    expect(shouldModeratePublicChatMessage("wetback")).toBe(true);
  });

  it("catches explicit sexual content", () => {
    expect(shouldModeratePublicChatMessage("send n.u.d.e.s")).toBe(true);
    expect(shouldModeratePublicChatMessage("visit this porn page")).toBe(true);
  });

  it("catches credible real-world threats without hiding normal combat talk", () => {
    expect(shouldModeratePublicChatMessage("I will kill you irl")).toBe(true);
    expect(shouldModeratePublicChatMessage("I know where you live")).toBe(true);
    expect(shouldModeratePublicChatMessage("I will dox you")).toBe(true);
    expect(shouldModeratePublicChatMessage("I will kill your lava boss")).toBe(false);
  });

  it("catches invite links and high-confidence scams", () => {
    expect(shouldModeratePublicChatMessage("join https://discord.gg/example")).toBe(true);
    expect(shouldModeratePublicChatMessage("free gems https://bad.example.xyz")).toBe(true);
    expect(shouldModeratePublicChatMessage("send me your password")).toBe(true);
  });

  it("replaces moderated content without retaining the original text", () => {
    expect(moderatePublicChatMessage("send nudes")).toEqual({
      message: MODERATED_CHAT_MESSAGE,
      moderated: true,
    });
  });
});
