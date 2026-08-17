import { describe, expect, it } from "vitest";
import { resolvePlayerPresenceMap } from "./profile-presence";

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
