import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { HOME_TRAVEL_PORTAL } from "../../shared/home";
import { BOSS_REWARD_CLAIM_BITS } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
const position = { x: HOME_TRAVEL_PORTAL.x, y: HOME_TRAVEL_PORTAL.y - HOME_TRAVEL_PORTAL.height * .32 };
function home() { const f = crystalFixture(); f.patch("player", { mapId: "home_exterior", ...position }); return f; }
const mapOf = (f: ReturnType<typeof home>) => f.db.player.identity.find(f.ctx.sender).mapId;

it("travels from the home portal to any unlocked campaign map", () => {
  const f = home(); f.patch("playerProgress", { desertUnlocked: true, snowlandsUnlocked: true });
  f.run(server.changeMap, { mapId: "intermediate_snowlands", ...position });
  expect(mapOf(f)).toBe("intermediate_snowlands");
});

it("always reaches the first map, and reaches an unlocked Endless map", () => {
  const f = home();
  f.run(server.changeMap, { mapId: "tutorial_forest", ...position });
  expect(mapOf(f)).toBe("tutorial_forest");
  const g = home();
  g.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
  g.seed("proceduralProgress", { identity: g.ctx.sender, completed: 2 });
  g.run(server.changeMap, { mapId: "endless_3", ...position });
  expect(mapOf(g)).toBe("endless_3");
});

it("refuses a map the player has not unlocked", () => {
  const f = home();
  expect(() => f.run(server.changeMap, { mapId: "intermediate_snowlands", ...position })).toThrow("Desert Spider");
  expect(() => f.run(server.changeMap, { mapId: "endless_1", ...position })).toThrow("previous map");
  f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
  expect(() => f.run(server.changeMap, { mapId: "endless_2", ...position })).toThrow("previous map");
  expect(() => f.run(server.changeMap, { mapId: "first_steps", ...position })).toThrow("Unsupported");
  expect(mapOf(f)).toBe("home_exterior");
});

it("refuses travel from anywhere but beside the portal", () => {
  const f = home(); f.patch("playerProgress", { desertUnlocked: true });
  expect(() => f.run(server.changeMap, { mapId: "beginner_desert", x: 1000, y: 1400 })).toThrow("closer");
  expect(() => f.run(server.changeMap, { mapId: "tutorial_forest", x: NaN, y: 490 })).toThrow("finite");
  expect(mapOf(f)).toBe("home_exterior");
});

it("still sends the toolbar teleport back to the saved spot", () => {
  const f = home(); f.patch("playerProgress", { desertUnlocked: true });
  f.seed("homeReturnLocation", { identity: f.ctx.sender, mapId: "beginner_desert", x: 1500, y: 1600, facing: 0 });
  f.run(server.changeMap, { mapId: "home_exterior", ...position });
  expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ mapId: "beginner_desert", x: 1500, y: 1600 });
});

it("does not bypass new unlocks through an old Home return point", () => {
  const f = home();
  f.patch("playerProgress", { desertUnlocked: true, ionCitadelUnlocked: false });
  f.seed("playerEndlessRebaseBackup", { identity: f.ctx.sender, recordedAt: f.ctx.timestamp });
  f.seed("homeReturnLocation", { identity: f.ctx.sender, mapId: "ion_citadel", x: 1500, y: 1500, facing: 0 });
  f.run(server.changeMap, { mapId: "home_exterior", ...position });
  expect(mapOf(f)).toBe("tutorial_forest");
});
