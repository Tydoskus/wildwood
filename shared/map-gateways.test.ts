import { describe, expect, it } from "vitest";
import { CAMPAIGN_MAPS } from "./campaign-registry";
import { CAMPAIGN_GATEWAYS, portalUsePoint } from "./map-gateways";

describe("campaign gateways", () => {
  it("links every campaign map to its neighbours both ways, and nothing else", () => {
    for (const [index, map] of CAMPAIGN_MAPS.entries()) {
      const destinations = CAMPAIGN_GATEWAYS[map.id].portals.map(portal => portal.destination).sort();
      const neighbours = [CAMPAIGN_MAPS[index - 1]?.id, CAMPAIGN_MAPS[index + 1]?.id].filter(Boolean).sort();
      expect(destinations, map.id).toEqual(neighbours);
    }
  });
  it("puts the server's use point a third of the gate above its base, inside the 125 px use range of the drawn gate", () => {
    for (const { portals } of Object.values(CAMPAIGN_GATEWAYS)) for (const portal of portals) {
      const use = portalUsePoint(portal);
      expect(use.x).toBe(portal.x);
      expect(portal.y - use.y).toBeCloseTo(portal.height * .32);
      expect(portal.y - use.y).toBeLessThan(125);
    }
  });
});
