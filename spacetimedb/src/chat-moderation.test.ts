import { describe, expect, it } from "vitest";
import { MODERATED_CHAT_MESSAGE } from "../../shared/chat-message";
import {
  isPublicDisplayNameAllowed,
  moderatePublicChatMessage,
  normalizeModerationText,
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
      "Sex education is part of health class",
      "That boss fucked me up",
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

  it("catches direct sexual solicitation without blocking standalone context", () => {
    const blocked = [
      "i want sex",
      "have sex with me",
      "i fuck you so hot",
      "i want to fuck you",
      "lets fuck and have sex",
      "f.u.c.k you",
      "f*ck you",
      "I want s3x",
    ];
    for (const message of blocked) expect(shouldModeratePublicChatMessage(message)).toBe(true);
    expect(shouldModeratePublicChatMessage("sex")).toBe(false);
    expect(shouldModeratePublicChatMessage("sex education")).toBe(false);
  });

  it("catches credible real-world threats without hiding normal combat talk", () => {
    expect(shouldModeratePublicChatMessage("I will kill you irl")).toBe(true);
    expect(shouldModeratePublicChatMessage("I know where you live")).toBe(true);
    expect(shouldModeratePublicChatMessage("I will dox you")).toBe(true);
    expect(shouldModeratePublicChatMessage("I will kill your lava boss")).toBe(false);
  });

  it("catches invite links and high-confidence scams", () => {
    expect(shouldModeratePublicChatMessage("join https://discord.gg/example")).toBe(true);
    expect(shouldModeratePublicChatMessage("join discord dot gg example")).toBe(true);
    expect(shouldModeratePublicChatMessage("free gems https://bad.example.xyz")).toBe(true);
    expect(shouldModeratePublicChatMessage("send me your password")).toBe(true);
  });

  it.each(["Wildstat", "Wildwood", "WILDSTAT", "W1LDST4T"])("detects gem-scam links using %s without blocking normal reward discussion", (name) => {
    expect(shouldModeratePublicChatMessage(`free ${name} gems https://bad.example.xyz`)).toBe(true);
    expect(shouldModeratePublicChatMessage(`The daily bonus gives free ${name} gems`)).toBe(false);
  });

  it("catches high-confidence personal-information requests", () => {
    expect(shouldModeratePublicChatMessage("send me your home address")).toBe(true);
    expect(shouldModeratePublicChatMessage("what's your phone number")).toBe(true);
    expect(shouldModeratePublicChatMessage("share your real name")).toBe(true);
    expect(shouldModeratePublicChatMessage("where is the lava boss located")).toBe(false);
  });

  it("normalizes Unicode, leetspeak, separators, and long letter runs only for comparison", () => {
    expect(normalizeModerationText("  F...U...C...K YOU!!!  ")).toBe("fuck you");
    expect(normalizeModerationText("I want s333xxxx")).toBe("i want sex");
  });

  it("applies the same high-confidence filter to display names", () => {
    expect(isPublicDisplayNameAllowed("F_u_c_k")).toBe(false);
    expect(isPublicDisplayNameAllowed("WantSex")).toBe(false);
    expect(isPublicDisplayNameAllowed("Sex Education")).toBe(true);
    expect(isPublicDisplayNameAllowed("Niger Explorer")).toBe(true);
  });

  it("replaces moderated content without retaining the original text", () => {
    expect(moderatePublicChatMessage("send nudes")).toEqual({
      message: MODERATED_CHAT_MESSAGE,
      moderated: true,
    });
  });
});
