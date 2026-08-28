import { describe, expect, it } from "vitest";
import {
  HOME_EXTERIOR_MAP_ID,
  HOME_INTERIOR_MAP_ID,
  clientMapIdForNetworkMapId,
  homeBoundsForNetworkMapId,
  homeNetworkMapId,
  parseHomeNetworkMapId,
} from "./home";

const OWNER = "ab".repeat(32);

describe("private home routes", () => {
  it("round-trips an owner-scoped room", () => {
    const route = homeNetworkMapId(OWNER.toUpperCase(), "interior");
    expect(route).toBe(`home:${OWNER}:interior`);
    expect(parseHomeNetworkMapId(route)).toEqual({
      ownerIdentity: OWNER,
      room: "interior",
      mapId: HOME_INTERIOR_MAP_ID,
    });
  });

  it("canonicalizes private routes without changing adventure maps", () => {
    expect(clientMapIdForNetworkMapId(homeNetworkMapId(OWNER, "exterior"))).toBe(HOME_EXTERIOR_MAP_ID);
    expect(clientMapIdForNetworkMapId("tutorial_forest")).toBe("tutorial_forest");
  });

  it("rejects malformed or non-owner routes", () => {
    expect(parseHomeNetworkMapId("home:friend:exterior")).toBeNull();
    expect(parseHomeNetworkMapId(`home:${OWNER}:basement`)).toBeNull();
    expect(() => homeNetworkMapId("short", "exterior")).toThrow("Invalid home owner identity");
  });

  it("provides compact room bounds only for home routes", () => {
    expect(homeBoundsForNetworkMapId(homeNetworkMapId(OWNER, "exterior"))).toEqual({ width: 2_400, height: 1_800 });
    expect(homeBoundsForNetworkMapId(homeNetworkMapId(OWNER, "interior"))).toEqual({ width: 1_600, height: 1_200 });
    expect(homeBoundsForNetworkMapId(HOME_EXTERIOR_MAP_ID)).toBeNull();
  });
});
