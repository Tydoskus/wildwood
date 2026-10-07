import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportKills } from "../../tests/helpers/enemy-defeat";
import { STARTER_BOW } from "../../shared/items";
import { SOUL_ARRIVAL, SOUL_MAP_ID, SOUL_TOWN_PORTAL } from "../../shared/soul-dimension";
import { TOWN_ARRIVAL, TOWN_SOUL_PORTAL } from "../../shared/town";
import { HOME_TRAVEL_PORTAL } from "../../shared/home";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function soulReady(options: { open?: boolean; prestige?: number; kills?: number } = {}) {
  const f = crystalFixture();
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1_000 });
  // No row is open; a row the developer switched off closes it.
  if (options.open === false) f.seed("soulDimensionConfig", { id: 0, open: false });
  if (options.prestige ?? 1) f.seed("playerPrestige", { identity: f.ctx.sender, level: options.prestige ?? 1, perkPoints: 0, peakPower: 0, prestigedAt: new Timestamp(0n) });
  const kills = BigInt(options.kills ?? 25);
  f.seed("playerRewardKills", { identity: f.ctx.sender, damage: kills, health: kills, armor: kills, regen: kills, speed: kills });
  return f;
}
const soulKills = (f: any, enemies: { enemy: string; count: number }[], sequence = 1n) => {
  f.patch("player", { mapId: SOUL_MAP_ID, x: SOUL_ARRIVAL.x, y: SOUL_ARRIVAL.y });
  if (sequence === 1n) for (const { enemy } of enemies) fillDefeatBudget(f, SOUL_MAP_ID, enemy);
  return reportKills(f, { streamId: "soul-stream-000001", sequence, mapId: SOUL_MAP_ID, enemies });
};

it("counts campaign kills by reward type, for everyone, Soul Dimension open or not", () => {
  const f = crystalFixture();
  f.patch("player", { mapId: "tutorial_forest" });
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1_000 });
  fillDefeatBudget(f, "tutorial_forest", "Spitter");
  fillDefeatBudget(f, "tutorial_forest", "Bramble");
  reportKills(f, { streamId: "forest-stream-00001", sequence: 1n, mapId: "tutorial_forest", enemies: [{ enemy: "Spitter", count: 4 }, { enemy: "Bramble", count: 2 }] });
  const row = f.db.playerRewardKills.identity.find(f.ctx.sender);
  expect(row.damage).toBe(4n);
  expect(row.health).toBe(2n);
  expect(row.armor).toBe(0n);
});

it("pays soul stats for the soul enemies a tier has woken, and nothing for the rest", () => {
  const f = soulReady({ kills: 25 });
  soulKills(f, [{ enemy: "soul:damage", count: 5 }, { enemy: "soul:health", count: 3 }]);
  const soul = f.db.playerSoulStats.identity.find(f.ctx.sender);
  expect(soul.damage).toBe(5);
  expect(soul.maxHp).toBe(0);
  expect(soul.kills).toBe(5n);
});

it("adds up across reports: the reward is flat and never grows", () => {
  const f = soulReady({ kills: 125 });
  soulKills(f, [{ enemy: "soul:health", count: 10 }]);
  expect(f.db.playerSoulStats.identity.find(f.ctx.sender).maxHp).toBe(10);
  soulKills(f, [{ enemy: "soul:health", count: 10 }], 2n);
  expect(f.db.playerSoulStats.identity.find(f.ctx.sender).maxHp).toBe(20);
});

it("pays nothing in a Soul Dimension that is closed to the player", () => {
  const f = soulReady({ open: false });
  soulKills(f, [{ enemy: "soul:damage", count: 5 }]);
  expect(f.db.playerSoulStats.identity.find(f.ctx.sender)).toBeFalsy();
});

const portalSpot = (portal: { x: number; y: number; height: number }) => ({ x: portal.x, y: portal.y - portal.height * .32 });

it("refuses the way in to a player who has never prestiged", () => {
  const f = soulReady({ prestige: 0 });
  const at = portalSpot(TOWN_SOUL_PORTAL);
  f.patch("player", { mapId: "town", ...at });
  expect(() => f.run(server.changeMap, { mapId: SOUL_MAP_ID, ...at })).toThrow(/not open to you/);
});

it("goes in from the Town's bottom road, and back to the Town through the forest's portal", () => {
  const f = soulReady();
  const at = portalSpot(TOWN_SOUL_PORTAL);
  f.patch("player", { mapId: "town", ...at });
  f.run(server.changeMap, { mapId: SOUL_MAP_ID, ...at });
  expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ mapId: SOUL_MAP_ID, x: SOUL_ARRIVAL.x, y: SOUL_ARRIVAL.y });
  const back = portalSpot(SOUL_TOWN_PORTAL);
  f.patch("player", back);
  f.run(server.changeMap, { mapId: "town", ...back });
  expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ mapId: "town", x: TOWN_ARRIVAL.x, y: TOWN_ARRIVAL.y });
  // Home is no longer a way in, not even its pad.
  const pad = portalSpot(HOME_TRAVEL_PORTAL);
  f.patch("player", { mapId: "home_exterior", ...pad });
  expect(() => f.run(server.changeMap, { mapId: SOUL_MAP_ID, ...pad })).toThrow(/not connected/);
});
