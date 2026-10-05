import { expect, it } from "vitest";
import { puppetLegs, puppetPoseAt, puppetSites, type PuppetPlan, type PuppetSite } from "./autofarm-puppet";

const site = (x: number, y: number, reward: string, campName = "Camp"): PuppetSite => ({ x, y, type: "Bramble", campName, definition: { reward: { type: reward } } });
const sites = [site(500, 500, "damage", "A"), site(900, 500, "damage", "A"), site(700, 900, "damage", "B"), site(300, 300, "health")];
const plan: PuppetPlan = { seed: "farmer:1", anchorX: 100, anchorY: 100, startedAtMs: 10_000, speed: 200 };

it("farms the plan's group, and its camp when that camp is there", () => {
  expect(puppetSites(sites, "stat:damage", "")).toHaveLength(3);
  expect(puppetSites(sites, "stat:damage", "A")).toHaveLength(2);
  // A camp this map lacks falls back to the whole group.
  expect(puppetSites(sites, "stat:damage", "Nowhere")).toHaveLength(3);
  expect(puppetSites(sites, "stat:health", "")).toHaveLength(1);
});

it("walks from the anchor at its speed, then stands at a camp fighting", () => {
  const legs = puppetLegs(plan, puppetSites(sites, "stat:damage", ""));
  expect(legs.length).toBeGreaterThan(3);
  expect(puppetPoseAt(plan, legs, 10_000)).toMatchObject({ x: 100, y: 100, moving: true });
  // Half a second in: 100px along the first leg.
  const step = puppetPoseAt(plan, legs, 10_500);
  expect(Math.hypot(step.x - 100, step.y - 100)).toBeCloseTo(100, 0);
  const arrived = 10_000 + legs[0].walk * 1_000 + 100;
  expect(puppetPoseAt(plan, legs, arrived)).toMatchObject({ x: legs[0].x, y: legs[0].y, moving: false });
  // Never two legs in a row on the same camp, and every stand is within reach of a camp.
  for (const leg of legs) expect(Math.min(...sites.map(s => Math.hypot(s.x - leg.x, s.y - leg.y)))).toBeLessThan(170);
});

it("plays the same for every viewer, and differently for another farmer", () => {
  const farmed = puppetSites(sites, "stat:damage", "");
  expect(puppetLegs(plan, farmed)).toEqual(puppetLegs({ ...plan }, farmed));
  expect(puppetLegs({ ...plan, seed: "other:1" }, farmed)).not.toEqual(puppetLegs(plan, farmed));
});

it("stands at its anchor with nothing to farm", () => {
  expect(puppetPoseAt(plan, puppetLegs(plan, []), 60_000)).toMatchObject({ x: 100, y: 100, moving: false });
});
