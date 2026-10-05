import { expect, it } from "vitest";
import { createAutoFarmProgress } from "./auto-farm-build";
import { defaultBalanceSettings, resolveMapBalance } from "../../../shared/map-balance";
import type { MapBalanceSnapshot } from "../../../shared/map-balance-types";

function progress(stats: { damage: number; maxHp: number; armor: number }, mapBalance: (mapId: string) => Promise<MapBalanceSnapshot | null>) {
  return createAutoFarmProgress({
    mapId: () => "tutorial_forest", mapBalance,
    base: () => ({ maxHp: stats.maxHp, damage: stats.damage, attackRate: .5, armor: stats.armor, regen: stats.maxHp / 50 }),
    equipment: () => ({ equippedHead: "", equippedChest: "", equippedRightHand: "", equippedLeftHand: "" }) as never,
    research: () => null, upgradeLevel: () => 0, rewardMultiplier: () => 1, minAttackInterval: () => .2,
    criticalChance: () => 0, criticalMultiplier: () => 1,
    mapBoss: () => null, reflectOnly: () => false,
    portals: () => [{ x: 900, y: 900, height: 200, destination: "beginner_desert" }] as never,
    portalUnlocked: () => true,
  });
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

it("judges the next map by its live balance, and not at all until that has loaded", async () => {
  let deliver!: (balance: MapBalanceSnapshot | null) => void;
  const strong = progress({ damage: 1e9, maxHp: 1e9, armor: 1e6 }, () => new Promise(resolve => { deliver = resolve; }));
  // Loading: not ready, however strong the build.
  expect(strong.nextPortal()).toBeNull();
  deliver(resolveMapBalance("beginner_desert", defaultBalanceSettings(), 3));
  await settle();
  expect(strong.nextPortal()).toMatchObject({ destination: "beginner_desert" });
});

it("stays when the next map's live enemies are far harder than the copy the game ships", async () => {
  const live = resolveMapBalance("beginner_desert", defaultBalanceSettings(), 3);
  const brutal: MapBalanceSnapshot = { ...live, enemies: Object.fromEntries(Object.entries(live.enemies).map(([kind, enemy]) => [kind, { ...enemy, damage: enemy.damage * 1e6, hp: enemy.hp * 1e3 }])) };
  const build = { damage: 400, maxHp: 4_000, armor: 50 };
  const real = progress(build, async () => brutal);
  real.nextPortal();
  await settle();
  expect(real.nextPortal()).toBeNull();
  expect(real.nextMapTooHard()).toBe(true);
});
