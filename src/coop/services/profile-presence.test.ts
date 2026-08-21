import { describe, expect, it } from "vitest";
import { resolvePlayerPresenceMap, shouldRetainProfilePresentation } from "./profile-presence";

describe("resolvePlayerPresenceMap", () => {
  it("keeps an open profile online after nearby map membership disappears", () => {
    const profileMaps = new Map([["target", "intermediate_snowlands"]]);
    const nearbyMaps = new Map<string, string>();

    expect(resolvePlayerPresenceMap("target", "local", "tutorial_forest", profileMaps, nearbyMaps))
      .toBe("intermediate_snowlands");
  });

  it("uses the live local map for the current player", () => {
    expect(resolvePlayerPresenceMap("local", "local", "beginner_desert", new Map(), new Map()))
      .toBe("beginner_desert");
  });
});

describe("shouldRetainProfilePresentation", () => {
  it("keeps a portrait cached while chat still displays that player", () => {
    expect(shouldRetainProfilePresentation(
      "chat-player",
      new Set(),
      new Map(),
      [{ sender: "chat-player" }],
    )).toBe(true);
  });

  it("keeps presentation data for nearby and leaderboard players", () => {
    expect(shouldRetainProfilePresentation("nearby", new Set(["nearby"]), new Map(), [])).toBe(true);
    expect(shouldRetainProfilePresentation("ranked", new Set(), new Map([["ranked", {}]]), [])).toBe(true);
  });

  it("allows unreferenced temporary profile data to be released", () => {
    expect(shouldRetainProfilePresentation("unused", new Set(), new Map(), [{ sender: "someone-else" }])).toBe(false);
  });
});
