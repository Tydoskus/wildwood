import { expect, it } from "vitest";
import { createMapEnemySigns, mapSignPosition, mapSignRows } from "./map-enemy-sign";
import { CAMPAIGN_GATEWAYS } from "../../../shared/map-gateways";
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

it("stands beside each campaign map's arrival, and nowhere else", () => {
  const arrival = CAMPAIGN_GATEWAYS.tutorial_forest.arrival;
  expect(mapSignPosition("tutorial_forest")).toEqual({ x: arrival.x + 190, y: arrival.y + 30 });
  expect(mapSignPosition("home_exterior")).toBeNull();
});

it("draws the sign once and reuses it until its numbers change", () => {
  let made = 0;
  const context = new Proxy({} as Record<string, unknown>, { get: (target, key: string) => key in target ? target[key] : () => {}, set: (target, key: string, value) => { target[key] = value; return true; } });
  const signs = createMapEnemySigns({ pixelRatio: () => 1, createCanvas: () => { made++; return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement; } });
  const rows = mapSignRows([enemy("Bramble", 42)], (_type, amount) => amount);
  const first = signs.sign(rows);
  expect(signs.sign(mapSignRows([enemy("Bramble", 42)], (_type, amount) => amount))).toBe(first);
  expect(made).toBe(1);
  signs.sign(mapSignRows([enemy("Bramble", 50)], (_type, amount) => amount));
  expect(made).toBe(2);
  expect(signs.sign([])).toBeNull();
});
