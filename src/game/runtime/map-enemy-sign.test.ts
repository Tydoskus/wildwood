import { expect, it } from "vitest";
import { createMapEnemySigns, mapSignPosition, mapSignRows, touchingMapSign } from "./map-enemy-sign";
import { CAMPAIGN_GATEWAYS } from "../../../shared/map-gateways";
import { generateMap } from "../../../shared/procedural-maps";
import type { EnemyState } from "./types";

const enemy = (type: string, maxHp: number, extra: Partial<EnemyState> = {}) => ({
  type, maxHp, damage: maxHp / 10, reward: { type: "damage", amount: 2 }, ...extra,
}) as EnemyState;

it("lists each kind of enemy once, weakest first, with rewards as the player is paid them", () => {
  const rows = mapSignRows([
    enemy("Needle", 90), enemy("Bramble", 42), enemy("Needle", 90),
    enemy("Ghost", 5, { remoteCombatGhost: true }), enemy("Boss", 9, { generatedBoss: true }),
  ], (_type, amount) => amount * 3);
  expect(rows.map(row => row.name)).toEqual(["Bramble", "Needle"]);
  expect(rows[0]).toMatchObject({ hp: 42, hit: 4.2, reward: { type: "damage", amount: 6 } });
});

it("stands beside each campaign map's arrival, behind its portals, and nowhere else", () => {
  // Right of the arrival, a little behind the portals' line so it stands behind them, not in front.
  const { arrival, portals } = CAMPAIGN_GATEWAYS.tutorial_forest;
  expect(mapSignPosition("tutorial_forest")).toEqual({ x: arrival.x + 190, y: Math.min(...portals.map(portal => portal.y)) - 40 });
  expect(mapSignPosition("home_exterior")).toBeNull();
});

it("draws the small sign once per pixel ratio, and opens only to a player standing at it", () => {
  let made = 0;
  const context = new Proxy({} as Record<string, unknown>, { get: (target, key: string) => key in target ? target[key] : () => {}, set: (target, key: string, value) => { target[key] = value; return true; } });
  let ratio = 1;
  const signs = createMapEnemySigns({ pixelRatio: () => ratio, createCanvas: () => { made++; return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement; } });
  expect(signs.sign()).toBe(signs.sign());
  ratio = 2; signs.sign();
  expect(made).toBe(2);
  const sign = { x: 500, y: 500 };
  expect(touchingMapSign(sign, { x: 520, y: 480 })).toBe(true);
  expect(touchingMapSign(sign, { x: 600, y: 500 })).toBe(false);
  expect(touchingMapSign(sign, { x: 500, y: 600 })).toBe(false);
});

it("stands clear of both Endless portals, behind their line", () => {
  const spot = mapSignPosition("endless_3")!;
  const { portals, arrival } = generateMap("endless_3");
  expect(spot.y).toBe(Math.min(...portals.map(portal => portal.y)) - 40);
  for (const portal of portals) expect(spot.x - (portal.x + portal.width / 2)).toBeGreaterThanOrEqual(60);
  expect(spot.x).toBeGreaterThan(arrival.x);
});

it("lists Endless lanes that share a base kind under their own names", () => {
  const rows = mapSignRows([
    enemy("Bramble", 100, { displayName: "Gloom Raider" }), enemy("Bramble", 300, { displayName: "Gloom Regent" }), enemy("Bramble", 100, { displayName: "Gloom Raider" }),
  ], (_type, amount) => amount);
  expect(rows.map(row => row.name)).toEqual(["Gloom Raider", "Gloom Regent"]);
});
