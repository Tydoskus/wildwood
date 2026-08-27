import { describe, expect, it, vi } from "vitest";
import { createGameBootstrap } from "./game-bootstrap";
import { createBossController } from "./boss-controller";
import {
  DRAGON_MAX_HP,
  FROSTCLAW_MAX_HP,
  FROSTCLAW_REWARD_ARMOR,
  FROSTCLAW_REWARD_DAMAGE,
  FROSTCLAW_REWARD_HEALTH,
  MAGMALISK_MAX_HP,
  MAGMALISK_REWARD_ARMOR,
  MAGMALISK_REWARD_DAMAGE,
  MAGMALISK_REWARD_HEALTH,
  MAGMALISK_REWARD_REGEN,
} from "../../../shared/rules";

describe("Dragon boss", () => {
  it("starts at the shared 300K health balance", () => {
    const { boss } = createGameBootstrap();
    expect(DRAGON_MAX_HP).toBe(300_000);
    expect(boss.maxHp).toBe(DRAGON_MAX_HP);
    expect(boss.hp).toBe(DRAGON_MAX_HP);
  });
});

function createFrostclawHarness(overrides: Partial<Parameters<typeof createBossController>[0]> = {}) {
  const state = createGameBootstrap();
  state.player.x = state.frostclawBoss.x + 300;
  state.player.y = state.frostclawBoss.y;
  state.player.hp = 1_000_000_000;
  state.player.maxHp = 1_000_000_000;
  state.frostclawBoss.attackClock = 0;
  const damagePlayer = vi.fn(() => true);
  const ignoredElement = {} as HTMLElement;
  const controller = createBossController({
    boss: state.boss,
    spiderBoss: state.spiderBoss,
    frostclawBoss: state.frostclawBoss,
    magmaliskBoss: state.magmaliskBoss,
    bossRain: state.bossRain,
    spiderVenom: state.spiderVenom,
    frostclawIcefalls: state.frostclawIcefalls,
    magmaliskEruptions: state.magmaliskEruptions,
    player: state.player,
    getDragonBoss: () => null,
    getSpiderBoss: () => null,
    getFrostclawBoss: () => null,
    getMagmaliskBoss: () => null,
    getDragonResult: () => null,
    getSpiderResult: () => null,
    getFrostclawResult: () => null,
    getMagmaliskResult: () => null,
    localIdentity: () => "local",
    running: () => true,
    currentMapIsDesert: () => false,
    currentMapIsSnow: () => true,
    currentMapIsLava: () => false,
    portalCutsceneActive: () => false,
    hasSeenDragonPortalCutscene: () => true,
    hasSeenSnowlandsPortalCutscene: () => true,
    hasSeenLavaPortalCutscene: () => true,
    hasSeenInfernalPortalCutscene: () => true,
    startDragonPortalCutscene: () => undefined,
    startSnowlandsPortalCutscene: () => undefined,
    startLavaPortalCutscene: () => undefined,
    startInfernalPortalCutscene: () => undefined,
    elements: {
      result: ignoredElement,
      resultTitle: ignoredElement,
      resultTotal: ignoredElement,
      resultContributors: ignoredElement,
      worldNotice: ignoredElement,
      worldNoticeDetail: ignoredElement,
    },
    renderPlayerName: () => undefined,
    spawnBurst: () => undefined,
    damagePlayer,
    logPickup: () => undefined,
    showMessage: () => undefined,
    saveProgress: () => undefined,
    ...overrides,
  });
  return { ...state, controller, damagePlayer };
}

describe("Frostclaw boss", () => {
  it("grants the current third-boss reward without changing armor", () => {
    expect(FROSTCLAW_REWARD_DAMAGE).toBe(14_400_000);
    expect(FROSTCLAW_REWARD_HEALTH).toBe(54_000_000);
    expect(FROSTCLAW_REWARD_ARMOR).toBe(15_000);
  });

  it("cycles roar, icefall, and rift as three distinct attacks", () => {
    const { controller, frostclawBoss, frostclawIcefalls } = createFrostclawHarness();

    controller.updateFrostclawBoss(.016);
    expect(frostclawBoss.roar).not.toBeNull();
    expect(frostclawBoss.nextAttack).toBe("icefall");

    controller.updateFrostclawBoss(.85);
    controller.updateFrostclawBoss(1);
    controller.updateFrostclawBoss(2.7);
    expect(frostclawIcefalls).toHaveLength(9);
    expect(frostclawBoss.nextAttack).toBe("rift");

    controller.updateFrostclawBoss(5);
    expect(frostclawBoss.rift).not.toBeNull();
    expect(frostclawBoss.nextAttack).toBe("roar");
  });

  it("uses Glacial Roar to damage and push players away", () => {
    const { controller, frostclawBoss, player, damagePlayer } = createFrostclawHarness();

    controller.updateFrostclawBoss(.016);
    controller.updateFrostclawBoss(.85);
    for (let frame = 0; frame < 8 && frostclawBoss.pushTimer <= 0; frame += 1) {
      controller.updateFrostclawBoss(.05);
    }

    expect(damagePlayer).toHaveBeenCalledWith(28_000_000);
    expect(frostclawBoss.pushTimer).toBeGreaterThan(0);
    const before = Math.hypot(player.x - frostclawBoss.x, player.y - frostclawBoss.y);
    controller.applyFrostclawPush(.25);
    const after = Math.hypot(player.x - frostclawBoss.x, player.y - frostclawBoss.y);
    expect(after).toBeGreaterThan(before + 100);
  });

  it("reveals the Lava Lake portal after a local Frostclaw contribution", () => {
    let shared = { encounter: 7n, hp: FROSTCLAW_MAX_HP, maxHp: FROSTCLAW_MAX_HP, alive: true };
    const startLavaPortalCutscene = vi.fn();
    const { controller } = createFrostclawHarness({
      getFrostclawBoss: () => shared,
      getFrostclawResult: () => ({
        encounter: 7n,
        totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }],
      }),
      hasSeenLavaPortalCutscene: () => false,
      startLavaPortalCutscene,
    });

    controller.syncFrostclawState();
    shared = { ...shared, hp: 0, alive: false };
    controller.syncFrostclawState();

    expect(startLavaPortalCutscene).toHaveBeenCalledOnce();
  });

  it("reveals the portal for an earlier Frostclaw winner after rollout", () => {
    const shared = { encounter: 8n, hp: 0, maxHp: FROSTCLAW_MAX_HP, alive: false };
    const startLavaPortalCutscene = vi.fn();
    const { controller } = createFrostclawHarness({
      getFrostclawBoss: () => shared,
      getFrostclawResult: () => ({
        encounter: 8n,
        totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }],
      }),
      hasSeenLavaPortalCutscene: () => false,
      startLavaPortalCutscene,
    });

    controller.syncFrostclawState();

    expect(startLavaPortalCutscene).toHaveBeenCalledOnce();
  });
});

describe("Magmalisk boss", () => {
  it("continues Lava scaling with four stat rewards", () => {
    expect(MAGMALISK_REWARD_DAMAGE).toBe(432_000_000);
    expect(MAGMALISK_REWARD_HEALTH).toBe(2_458_350_000);
    expect(MAGMALISK_REWARD_ARMOR).toBe(210_000);
    expect(MAGMALISK_REWARD_REGEN).toBe(12_150_468.75);
  });

  it("cycles bite and eruption using the selected attack frames", () => {
    const { controller, magmaliskBoss, magmaliskEruptions, player } = createFrostclawHarness({
      currentMapIsSnow: () => false,
      currentMapIsLava: () => true,
    });
    player.x = magmaliskBoss.x + 300;
    player.y = magmaliskBoss.y;
    magmaliskBoss.attackClock = 0;

    controller.updateMagmaliskBoss(.016);
    expect(magmaliskBoss.bite).not.toBeNull();
    expect(magmaliskBoss.nextAttack).toBe("eruption");

    controller.updateMagmaliskBoss(.72);
    controller.updateMagmaliskBoss(1);
    controller.updateMagmaliskBoss(2.5);
    expect(magmaliskEruptions).toHaveLength(11);
    expect(magmaliskBoss.nextAttack).toBe("bite");
  });

  it("reveals Infernal Depths after a local Magmalisk contribution", () => {
    let shared = { encounter: 9n, hp: MAGMALISK_MAX_HP, maxHp: MAGMALISK_MAX_HP, alive: true };
    const startInfernalPortalCutscene = vi.fn();
    const { controller } = createFrostclawHarness({
      currentMapIsSnow: () => false,
      currentMapIsLava: () => true,
      getMagmaliskBoss: () => shared,
      getMagmaliskResult: () => ({
        encounter: 9n,
        totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }],
      }),
      hasSeenInfernalPortalCutscene: () => false,
      startInfernalPortalCutscene,
    });

    controller.syncMagmaliskState();
    shared = { ...shared, hp: 0, alive: false };
    controller.syncMagmaliskState();

    expect(startInfernalPortalCutscene).toHaveBeenCalledOnce();
  });
});
