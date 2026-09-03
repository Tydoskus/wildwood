import { afterEach, describe, expect, it, vi } from "vitest";
import { createGameBootstrap } from "./game-bootstrap";
import {
  BOSS_AREA_KNOCKBACK_DURATION,
  SPIDER_WEB_RANGE,
  bossAreaKnockbackDistance,
  createBossController,
} from "./boss-controller";
import { BOSS_DAMAGE_PROFILES } from "../boss-damage";
import {
  BOSS_CONE_RANGE,
  FROSTCLAW_ROAR_RANGE,
  GLOOMROOT_SWEEP_RANGE,
  KOI_SHOGUN_SLASH_RANGE,
  MAGMALISK_BITE_RANGE,
  MIREMAW_TONGUE_RANGE,
  TEMPEST_KIRIN_CHARGE_RANGE,
  TIDEWYRM_SURGE_RANGE,
} from "../constants";
import {
  ADVANCED_LAVA_WASTES_BOSS_HEALTH_MULTIPLIER,
  ADVANCED_LAVA_WASTES_BOSS_REWARD_MULTIPLIER,
  ADVANCED_LAVA_WASTES_DAMAGE_REWARD_MULTIPLIER,
  ADVANCED_LAVA_WASTES_HEALTH_REWARD_MULTIPLIER,
  ADVANCED_LAVA_WASTES_HEALTH_SCALE,
  ADVANCED_LAVA_WASTES_REWARD_SCALE,
  DRAGON_MAX_HP,
  FROSTCLAW_MAX_HP,
  FROSTCLAW_REWARD_ARMOR,
  FROSTCLAW_REWARD_DAMAGE,
  FROSTCLAW_REWARD_HEALTH,
  GLOOMROOT_MAX_HP,
  GLOOMROOT_REWARD_ARMOR,
  GLOOMROOT_REWARD_DAMAGE,
  GLOOMROOT_REWARD_HEALTH,
  GLOOMROOT_REWARD_REGEN,
  INFERNAL_DEPTHS_BOSS_HEALTH_MULTIPLIER,
  INFERNAL_DEPTHS_BOSS_REWARD_MULTIPLIER,
  INFERNAL_DEPTHS_DAMAGE_REWARD_MULTIPLIER,
  INFERNAL_DEPTHS_HEALTH_REWARD_MULTIPLIER,
  INTERMEDIATE_SNOWLANDS_BOSS_HEALTH_MULTIPLIER,
  INTERMEDIATE_SNOWLANDS_BOSS_REWARD_MULTIPLIER,
  INTERMEDIATE_SNOWLANDS_DAMAGE_REWARD_MULTIPLIER,
  INTERMEDIATE_SNOWLANDS_HEALTH_REWARD_MULTIPLIER,
  INTERMEDIATE_SNOWLANDS_HEALTH_SCALE,
  INTERMEDIATE_SNOWLANDS_REWARD_SCALE,
  KOI_SHOGUN_MAX_HP,
  KOI_SHOGUN_REWARD_ARMOR,
  KOI_SHOGUN_REWARD_DAMAGE,
  KOI_SHOGUN_REWARD_HEALTH,
  KOI_SHOGUN_REWARD_REGEN,
  MAGMALISK_MAX_HP,
  MAGMALISK_REWARD_ARMOR,
  MAGMALISK_REWARD_DAMAGE,
  MAGMALISK_REWARD_HEALTH,
  MAGMALISK_REWARD_REGEN,
  MIREMAW_MAX_HP,
  MIREMAW_REWARD_ARMOR,
  MIREMAW_REWARD_DAMAGE,
  MIREMAW_REWARD_HEALTH,
  MIREMAW_REWARD_REGEN,
  MOONFEN_DAMAGE_SCALE,
  MOONFEN_REWARD_SCALE,
  SAMURAI_GARDEN_DAMAGE_SCALE,
  SAMURAI_GARDEN_HEALTH_SCALE,
  SAMURAI_GARDEN_REWARD_SCALE,
  CLOUDSPIRE_DAMAGE_SCALE,
  CLOUDSPIRE_DAMAGE_REWARD_MULTIPLIER,
  CLOUDSPIRE_HEALTH_REWARD_MULTIPLIER,
  CLOUDSPIRE_REWARD_SCALE,
  TEMPEST_KIRIN_MAX_HP,
  TEMPEST_KIRIN_REWARD_ARMOR,
  TEMPEST_KIRIN_REWARD_DAMAGE,
  TEMPEST_KIRIN_REWARD_HEALTH,
  TEMPEST_KIRIN_REWARD_REGEN,
  TIDEWYRM_MAX_HP,
  TIDEWYRM_REWARD_ARMOR,
  TIDEWYRM_REWARD_DAMAGE,
  TIDEWYRM_REWARD_HEALTH,
  TIDEWYRM_REWARD_REGEN,
  WATER_REACH_DAMAGE_REWARD_MULTIPLIER,
  WATER_REACH_BOSS_HEALTH_MULTIPLIER,
  WATER_REACH_HEALTH_REWARD_MULTIPLIER,
} from "../../../shared/rules";
import { bossAbilityTimelineAt } from "../../../shared/boss-simulation";

afterEach(() => vi.unstubAllGlobals());

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
    gloomrootBoss: state.gloomrootBoss,
    tidewyrmBoss: state.tidewyrmBoss,
    koiShogunBoss: state.koiShogunBoss,
    tempestKirinBoss: state.tempestKirinBoss,
    miremawBoss: state.miremawBoss,
    bossRain: state.bossRain,
    spiderVenom: state.spiderVenom,
    frostclawIcefalls: state.frostclawIcefalls,
    magmaliskEruptions: state.magmaliskEruptions,
    gloomrootBlooms: state.gloomrootBlooms,
    tidewyrmWhirlpools: state.tidewyrmWhirlpools,
    koiShogunWhirlpools: state.koiShogunWhirlpools,
    tempestKirinThunderbolts: state.tempestKirinThunderbolts,
    miremawBogBursts: state.miremawBogBursts,
    player: state.player,
    getDragonBoss: () => null,
    getSpiderBoss: () => null,
    getFrostclawBoss: () => null,
    getMagmaliskBoss: () => null,
    getGloomrootBoss: () => null,
    getTidewyrmBoss: () => null,
    getKoiShogunBoss: () => null,
    getTempestKirinBoss: () => null,
    getMiremawBoss: () => null,
    getDragonResult: () => null,
    getSpiderResult: () => null,
    getFrostclawResult: () => null,
    getMagmaliskResult: () => null,
    getGloomrootResult: () => null,
    getTidewyrmResult: () => null,
    getKoiShogunResult: () => null,
    getTempestKirinResult: () => null,
    getMiremawResult: () => null,
    localIdentity: () => "local",
    running: () => true,
    currentMapIsDesert: () => false,
    currentMapIsSnow: () => true,
    currentMapIsLava: () => false,
    currentMapIsInfernal: () => false,
    currentMapIsWater: () => false,
    currentMapIsSamurai: () => false,
    currentMapIsCloudspire: () => false,
    currentMapIsMoonfen: () => false,
    portalCutsceneActive: () => false,
    hasSeenDragonPortalCutscene: () => true,
    hasSeenSnowlandsPortalCutscene: () => true,
    hasSeenLavaPortalCutscene: () => true,
    hasSeenInfernalPortalCutscene: () => true,
    hasSeenWaterPortalCutscene: () => true,
    hasSeenSamuraiPortalCutscene: () => true,
    startDragonPortalCutscene: () => undefined,
    startSnowlandsPortalCutscene: () => undefined,
    startLavaPortalCutscene: () => undefined,
    startInfernalPortalCutscene: () => undefined,
    startWaterPortalCutscene: () => undefined,
    startSamuraiPortalCutscene: () => undefined,
    elements: {
      worldNotice: ignoredElement,
      worldNoticeDetail: ignoredElement,
    },
    renderPlayerName: () => undefined,
    spawnBurst: () => undefined,
    damagePlayer,
    logPickup: () => undefined,
    saveProgress: () => undefined,
    ...overrides,
  });
  return { ...state, controller, damagePlayer };
}

type BossHarness = ReturnType<typeof createFrostclawHarness>;

const areaKnockbackBosses: Array<{
  name: string;
  range: number;
  state: (harness: BossHarness) => { x: number; y: number; r: number; attackClock: number };
  update: (harness: BossHarness) => void;
}> = [
  { name: "Dragon cone", range: BOSS_CONE_RANGE, state: (harness) => harness.boss, update: (harness) => harness.controller.updateBoss(.05) },
  { name: "Desert Scorpion web", range: SPIDER_WEB_RANGE, state: (harness) => harness.spiderBoss, update: (harness) => harness.controller.updateSpiderBoss(.05) },
  { name: "Frostclaw roar", range: FROSTCLAW_ROAR_RANGE, state: (harness) => harness.frostclawBoss, update: (harness) => harness.controller.updateFrostclawBoss(.05) },
  { name: "Magmalisk bite", range: MAGMALISK_BITE_RANGE, state: (harness) => harness.magmaliskBoss, update: (harness) => harness.controller.updateMagmaliskBoss(.05) },
  { name: "Gloomroot sweep", range: GLOOMROOT_SWEEP_RANGE, state: (harness) => harness.gloomrootBoss, update: (harness) => harness.controller.updateGloomrootBoss(.05) },
  { name: "Tidewyrm surge", range: TIDEWYRM_SURGE_RANGE, state: (harness) => harness.tidewyrmBoss, update: (harness) => harness.controller.updateTidewyrmBoss(.05) },
  { name: "Koi Shogun slash", range: KOI_SHOGUN_SLASH_RANGE, state: (harness) => harness.koiShogunBoss, update: (harness) => harness.controller.updateKoiShogunBoss(.05) },
  { name: "Tempest Kirin charge", range: TEMPEST_KIRIN_CHARGE_RANGE, state: (harness) => harness.tempestKirinBoss, update: (harness) => harness.controller.updateTempestKirinBoss(.05) },
  { name: "Miremaw tongue", range: MIREMAW_TONGUE_RANGE, state: (harness) => harness.miremawBoss, update: (harness) => harness.controller.updateMiremawBoss(.05) },
];

describe("Boss area knockback", () => {
  for (const bossCase of areaKnockbackBosses) {
    it(`${bossCase.name} pushes once without ejecting a close-range player`, () => {
      const harness = createFrostclawHarness();
      const bossState = bossCase.state(harness);
      bossState.attackClock = 0;
      harness.player.x = bossState.x + 300;
      harness.player.y = bossState.y;
      harness.damagePlayer.mockClear();

      for (let frame = 0; frame < 60 && harness.damagePlayer.mock.calls.length === 0; frame += 1) {
        bossCase.update(harness);
      }

      expect(harness.damagePlayer).toHaveBeenCalledOnce();
      const before = Math.hypot(harness.player.x - bossState.x, harness.player.y - bossState.y);
      harness.controller.applyBossKnockback(BOSS_AREA_KNOCKBACK_DURATION);
      const after = Math.hypot(harness.player.x - bossState.x, harness.player.y - bossState.y);
      const oneHitDistance = bossAreaKnockbackDistance(bossCase.range, bossState.r);
      expect(after - before).toBeCloseTo(oneHitDistance, 5);
      expect(after).toBeLessThan(bossCase.range);
      expect(before + oneHitDistance * 2).toBeGreaterThan(bossCase.range);
    });
  }
});

describe("Boss defeat presentation", () => {
  it("shows participants the compact world notice and only one reward channel", () => {
    type FakeElement = {
      className: string;
      hidden: boolean;
      textContent: string;
      children: FakeElement[];
      style: Record<string, string>;
      offsetWidth: number;
      append: (...children: FakeElement[]) => void;
      appendChild: (child: FakeElement) => FakeElement;
      replaceChildren: (...children: FakeElement[]) => void;
      querySelector: (_selector: string) => FakeElement | null;
    };
    const fakeElement = (): FakeElement => {
      const element: FakeElement = {
        className: "",
        hidden: true,
        textContent: "",
        children: [],
        style: {},
        offsetWidth: 0,
        append: (...children) => { element.children.push(...children); },
        appendChild: (child) => { element.children.push(child); return child; },
        replaceChildren: (...children) => { element.children = [...children]; },
        querySelector: () => null,
      };
      return element;
    };
    const noticeTitle = fakeElement();
    const worldNotice = fakeElement();
    worldNotice.querySelector = () => noticeTitle;
    const worldNoticeDetail = fakeElement();
    vi.stubGlobal("document", { createElement: () => fakeElement() });
    vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });

    let shared = { encounter: 71n, hp: FROSTCLAW_MAX_HP, maxHp: FROSTCLAW_MAX_HP, alive: true };
    const logPickup = vi.fn();
    const { controller } = createFrostclawHarness({
      getFrostclawBoss: () => shared,
      getFrostclawResult: () => ({
        encounter: 71n,
        totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }],
      }),
      elements: {
        worldNotice: worldNotice as unknown as HTMLElement,
        worldNoticeDetail: worldNoticeDetail as unknown as HTMLElement,
      },
      logPickup,
    });

    controller.syncFrostclawState();
    shared = { ...shared, hp: 0, alive: false };
    controller.syncFrostclawState();

    expect(worldNotice.hidden).toBe(false);
    expect(noticeTitle.textContent).toBe("FROSTCLAW DEFEATED");
    expect(worldNoticeDetail.children).toHaveLength(1);
    expect(logPickup).toHaveBeenCalledTimes(3);
  });
});

describe("Frostclaw boss", () => {
  it("follows the shared Snowlands boss health and reward budget", () => {
    expect(FROSTCLAW_MAX_HP).toBe(750_000_000_000 * INTERMEDIATE_SNOWLANDS_HEALTH_SCALE * INTERMEDIATE_SNOWLANDS_BOSS_HEALTH_MULTIPLIER);
    expect(FROSTCLAW_REWARD_DAMAGE).toBe(72_000_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE * INTERMEDIATE_SNOWLANDS_BOSS_REWARD_MULTIPLIER * INTERMEDIATE_SNOWLANDS_DAMAGE_REWARD_MULTIPLIER);
    expect(FROSTCLAW_REWARD_HEALTH).toBe(270_000_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE * INTERMEDIATE_SNOWLANDS_BOSS_REWARD_MULTIPLIER * INTERMEDIATE_SNOWLANDS_HEALTH_REWARD_MULTIPLIER);
    expect(FROSTCLAW_REWARD_ARMOR).toBe(75_000 * INTERMEDIATE_SNOWLANDS_REWARD_SCALE * INTERMEDIATE_SNOWLANDS_BOSS_REWARD_MULTIPLIER);
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

  it("reconstructs the same shared attack after different client histories", () => {
    const encounter = 77n;
    const phase = bossAbilityTimelineAt({
      kind: "frostclaw",
      serverNowMs: 1_800_000_000_000,
    });
    let serverNowMs = phase.startedAtMs - 100;
    const sharedTargets = [
      { id: "network:1", x: 4_350, y: 4_050 },
      { id: "network:2", x: 3_750, y: 4_050 },
    ];
    const first = createFrostclawHarness({
      serverNowMs: () => serverNowMs,
      bossTargets: () => sharedTargets,
    });
    first.frostclawBoss.encounter = encounter;
    first.player.x = first.frostclawBoss.x + 300;
    first.controller.updateFrostclawBoss(.016);

    serverNowMs = phase.startedAtMs + 300;
    const second = createFrostclawHarness({
      serverNowMs: () => serverNowMs,
      bossTargets: () => sharedTargets,
    });
    second.frostclawBoss.encounter = encounter;
    second.player.x = second.frostclawBoss.x - 300;
    first.controller.updateFrostclawBoss(.016);
    second.controller.updateFrostclawBoss(.016);

    const snapshot = (harness: typeof first) => ({
      nextAttack: harness.frostclawBoss.nextAttack,
      roar: harness.frostclawBoss.roar,
      rift: harness.frostclawBoss.rift,
      icefalls: harness.frostclawIcefalls,
    });
    expect(Boolean(
      first.frostclawBoss.roar ||
      first.frostclawBoss.rift ||
      first.frostclawIcefalls.length,
    )).toBe(true);
    expect(snapshot(first)).toEqual(snapshot(second));
  });

  it("uses Glacial Roar to damage and push players away", () => {
    const { controller, frostclawBoss, player, damagePlayer } = createFrostclawHarness();

    controller.updateFrostclawBoss(.016);
    controller.updateFrostclawBoss(.85);
    for (let frame = 0; frame < 8 && damagePlayer.mock.calls.length === 0; frame += 1) {
      controller.updateFrostclawBoss(.05);
    }

    expect(damagePlayer).toHaveBeenCalledWith(BOSS_DAMAGE_PROFILES.frostclaw.roar);
    const before = Math.hypot(player.x - frostclawBoss.x, player.y - frostclawBoss.y);
    controller.applyBossKnockback(BOSS_AREA_KNOCKBACK_DURATION);
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
  it("follows the shared Lava Lake boss health and four-stat reward budget", () => {
    expect(MAGMALISK_MAX_HP).toBe(3_750_000_000_000_000 * ADVANCED_LAVA_WASTES_HEALTH_SCALE * ADVANCED_LAVA_WASTES_BOSS_HEALTH_MULTIPLIER);
    expect(MAGMALISK_REWARD_DAMAGE).toBe(14_400_000_000 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_DAMAGE_REWARD_MULTIPLIER * ADVANCED_LAVA_WASTES_BOSS_REWARD_MULTIPLIER);
    expect(MAGMALISK_REWARD_HEALTH).toBe(81_945_000_000 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_HEALTH_REWARD_MULTIPLIER * ADVANCED_LAVA_WASTES_BOSS_REWARD_MULTIPLIER);
    expect(MAGMALISK_REWARD_ARMOR).toBe(7_000_000 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_BOSS_REWARD_MULTIPLIER);
    expect(MAGMALISK_REWARD_REGEN).toBe(405_015_625 * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_BOSS_REWARD_MULTIPLIER);
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

describe("Gloomroot boss", () => {
  it("caps Night Forest with a four-stat Water Reach unlock reward", () => {
    expect(GLOOMROOT_MAX_HP).toBe(1_150_000_000_000_000 * INFERNAL_DEPTHS_BOSS_HEALTH_MULTIPLIER);
    expect(GLOOMROOT_REWARD_DAMAGE).toBe(120_000_000_000 * INFERNAL_DEPTHS_BOSS_REWARD_MULTIPLIER * INFERNAL_DEPTHS_DAMAGE_REWARD_MULTIPLIER);
    expect(GLOOMROOT_REWARD_HEALTH).toBe(250_000_000_000 * INFERNAL_DEPTHS_BOSS_REWARD_MULTIPLIER * INFERNAL_DEPTHS_HEALTH_REWARD_MULTIPLIER);
    expect(GLOOMROOT_REWARD_ARMOR).toBe(10_000_000 * INFERNAL_DEPTHS_BOSS_REWARD_MULTIPLIER);
    expect(GLOOMROOT_REWARD_REGEN).toBe(2_000_000_000 * INFERNAL_DEPTHS_BOSS_REWARD_MULTIPLIER);
  });

  it("cycles a readable root sweep into staggered Gloom Blooms", () => {
    const { controller, gloomrootBoss, gloomrootBlooms, player } = createFrostclawHarness({
      currentMapIsSnow: () => false,
      currentMapIsInfernal: () => true,
    });
    player.x = gloomrootBoss.x + 300;
    player.y = gloomrootBoss.y;
    gloomrootBoss.attackClock = 0;

    controller.updateGloomrootBoss(.016);
    expect(gloomrootBoss.sweep).not.toBeNull();
    expect(gloomrootBoss.nextAttack).toBe("bloom");

    controller.updateGloomrootBoss(.85);
    controller.updateGloomrootBoss(1.1);
    controller.updateGloomrootBoss(2.6);
    expect(gloomrootBlooms.length).toBeGreaterThan(0);
    expect(gloomrootBoss.nextAttack).toBe("sweep");
  });

  it("reveals Water Reach after a local Gloomroot contribution", () => {
    let shared = { encounter: 10n, hp: GLOOMROOT_MAX_HP, maxHp: GLOOMROOT_MAX_HP, alive: true };
    const startWaterPortalCutscene = vi.fn();
    const { controller } = createFrostclawHarness({
      currentMapIsSnow: () => false,
      currentMapIsInfernal: () => true,
      getGloomrootBoss: () => shared,
      getGloomrootResult: () => ({
        encounter: 10n,
        totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }],
      }),
      hasSeenWaterPortalCutscene: () => false,
      startWaterPortalCutscene,
    });

    controller.syncGloomrootState();
    shared = { ...shared, hp: 0, alive: false };
    controller.syncGloomrootState();

    expect(startWaterPortalCutscene).toHaveBeenCalledOnce();
  });
});

describe("Tidewyrm boss", () => {
  it("caps Water Reach with the scaled Samurai Garden unlock reward", () => {
    expect(TIDEWYRM_MAX_HP).toBe(GLOOMROOT_MAX_HP * SAMURAI_GARDEN_HEALTH_SCALE * WATER_REACH_BOSS_HEALTH_MULTIPLIER);
    expect(TIDEWYRM_REWARD_DAMAGE).toBe(GLOOMROOT_REWARD_DAMAGE * SAMURAI_GARDEN_REWARD_SCALE * WATER_REACH_DAMAGE_REWARD_MULTIPLIER);
    expect(TIDEWYRM_REWARD_HEALTH).toBe(GLOOMROOT_REWARD_HEALTH * SAMURAI_GARDEN_REWARD_SCALE * WATER_REACH_HEALTH_REWARD_MULTIPLIER);
    expect(TIDEWYRM_REWARD_ARMOR).toBe(GLOOMROOT_REWARD_ARMOR * SAMURAI_GARDEN_REWARD_SCALE);
    expect(TIDEWYRM_REWARD_REGEN).toBe(GLOOMROOT_REWARD_REGEN * SAMURAI_GARDEN_REWARD_SCALE);
  });

  it("cycles a tidal surge into staggered whirlpools", () => {
    const { controller, tidewyrmBoss, tidewyrmWhirlpools, player } = createFrostclawHarness({
      currentMapIsSnow: () => false,
      currentMapIsWater: () => true,
    });
    player.x = tidewyrmBoss.x + 300;
    player.y = tidewyrmBoss.y;
    tidewyrmBoss.attackClock = 0;

    controller.updateTidewyrmBoss(.016);
    expect(tidewyrmBoss.surge).not.toBeNull();
    expect(tidewyrmBoss.nextAttack).toBe("whirlpool");

    controller.updateTidewyrmBoss(.82);
    controller.updateTidewyrmBoss(1.1);
    controller.updateTidewyrmBoss(2.5);
    expect(tidewyrmWhirlpools.length).toBeGreaterThan(0);
    expect(tidewyrmBoss.nextAttack).toBe("surge");
  });

  it("reveals Samurai Garden after a local Tidewyrm contribution", () => {
    let shared = { encounter: 11n, hp: TIDEWYRM_MAX_HP, maxHp: TIDEWYRM_MAX_HP, alive: true };
    const startSamuraiPortalCutscene = vi.fn();
    const { controller } = createFrostclawHarness({
      currentMapIsSnow: () => false,
      currentMapIsWater: () => true,
      getTidewyrmBoss: () => shared,
      getTidewyrmResult: () => ({
        encounter: 11n,
        totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }],
      }),
      hasSeenSamuraiPortalCutscene: () => false,
      startSamuraiPortalCutscene,
    });

    controller.syncTidewyrmState();
    shared = { ...shared, hp: 0, alive: false };
    controller.syncTidewyrmState();

    expect(startSamuraiPortalCutscene).toHaveBeenCalledOnce();
  });

  it("does not add rewards again when hydrating an already-dead encounter", () => {
    const shared = { encounter: 12n, hp: 0, maxHp: TIDEWYRM_MAX_HP, alive: false };
    const startSamuraiPortalCutscene = vi.fn();
    const { controller, player } = createFrostclawHarness({
      currentMapIsSnow: () => false,
      currentMapIsWater: () => true,
      getTidewyrmBoss: () => shared,
      getTidewyrmResult: () => ({
        encounter: 12n,
        totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }],
      }),
      hasSeenSamuraiPortalCutscene: () => false,
      startSamuraiPortalCutscene,
    });
    const damageBefore = player.damage;
    const maxHealthBefore = player.baseMaxHp;

    controller.syncTidewyrmState();

    expect(startSamuraiPortalCutscene).toHaveBeenCalledOnce();
    expect(player.damage).toBe(damageBefore);
    expect(player.baseMaxHp).toBe(maxHealthBefore);
  });
});

describe("Koi Shogun boss", () => {
  it("caps Samurai Garden with a repeatable late-map reward", () => {
    expect(KOI_SHOGUN_MAX_HP).toBe(TIDEWYRM_MAX_HP * SAMURAI_GARDEN_DAMAGE_SCALE * .75);
    expect(KOI_SHOGUN_REWARD_DAMAGE).toBe(TIDEWYRM_REWARD_DAMAGE * SAMURAI_GARDEN_REWARD_SCALE);
    expect(KOI_SHOGUN_REWARD_HEALTH).toBe(TIDEWYRM_REWARD_HEALTH * SAMURAI_GARDEN_REWARD_SCALE);
    expect(KOI_SHOGUN_REWARD_ARMOR).toBe(TIDEWYRM_REWARD_ARMOR * SAMURAI_GARDEN_REWARD_SCALE);
    expect(KOI_SHOGUN_REWARD_REGEN).toBe(TIDEWYRM_REWARD_REGEN * SAMURAI_GARDEN_REWARD_SCALE);
  });

  it("cycles a water slash into staggered whirlpools", () => {
    const { controller, koiShogunBoss, koiShogunWhirlpools, player } = createFrostclawHarness({
      currentMapIsSnow: () => false,
      currentMapIsSamurai: () => true,
    });
    player.x = koiShogunBoss.x + 300;
    player.y = koiShogunBoss.y;
    koiShogunBoss.attackClock = 0;

    controller.updateKoiShogunBoss(.016);
    expect(koiShogunBoss.slash).not.toBeNull();
    expect(koiShogunBoss.nextAttack).toBe("whirlpool");

    controller.updateKoiShogunBoss(.78);
    controller.updateKoiShogunBoss(1.1);
    controller.updateKoiShogunBoss(2.5);
    expect(koiShogunWhirlpools.length).toBeGreaterThan(0);
    expect(koiShogunBoss.nextAttack).toBe("slash");
  });
});

describe("Tempest Kirin boss", () => {
  it("caps Cloudspire with the next repeatable late-map reward", () => {
    expect(TEMPEST_KIRIN_MAX_HP).toBe(KOI_SHOGUN_MAX_HP * CLOUDSPIRE_DAMAGE_SCALE * 1.1);
    expect(TEMPEST_KIRIN_REWARD_DAMAGE).toBe(KOI_SHOGUN_REWARD_DAMAGE * CLOUDSPIRE_REWARD_SCALE * CLOUDSPIRE_DAMAGE_REWARD_MULTIPLIER);
    expect(TEMPEST_KIRIN_REWARD_HEALTH).toBe(KOI_SHOGUN_REWARD_HEALTH * CLOUDSPIRE_REWARD_SCALE * CLOUDSPIRE_HEALTH_REWARD_MULTIPLIER);
    expect(TEMPEST_KIRIN_REWARD_ARMOR).toBe(KOI_SHOGUN_REWARD_ARMOR * CLOUDSPIRE_REWARD_SCALE);
    expect(TEMPEST_KIRIN_REWARD_REGEN).toBe(KOI_SHOGUN_REWARD_REGEN * CLOUDSPIRE_REWARD_SCALE);
  });

  it("cycles a charge wave into targeted thunder circles", () => {
    const { controller, tempestKirinBoss, tempestKirinThunderbolts, player } = createFrostclawHarness({
      currentMapIsSnow: () => false,
      currentMapIsCloudspire: () => true,
    });
    player.x = tempestKirinBoss.x + 300;
    player.y = tempestKirinBoss.y;
    tempestKirinBoss.attackClock = 0;

    controller.updateTempestKirinBoss(.016);
    expect(tempestKirinBoss.charge).not.toBeNull();
    expect(tempestKirinBoss.nextAttack).toBe("thunder");

    controller.updateTempestKirinBoss(.75);
    controller.updateTempestKirinBoss(1.05);
    controller.updateTempestKirinBoss(2.4);
    expect(tempestKirinThunderbolts.length).toBeGreaterThan(0);
    expect(tempestKirinBoss.nextAttack).toBe("charge");
  });
});

describe("Miremaw boss", () => {
  it("caps Moonfen with the next repeatable late-map reward", () => {
    expect(MIREMAW_MAX_HP).toBe(TEMPEST_KIRIN_MAX_HP * MOONFEN_DAMAGE_SCALE * 1.1);
    expect(MIREMAW_REWARD_DAMAGE).toBe(TEMPEST_KIRIN_REWARD_DAMAGE * MOONFEN_REWARD_SCALE);
    expect(MIREMAW_REWARD_HEALTH).toBe(TEMPEST_KIRIN_REWARD_HEALTH * MOONFEN_REWARD_SCALE);
    expect(MIREMAW_REWARD_ARMOR).toBe(TEMPEST_KIRIN_REWARD_ARMOR * MOONFEN_REWARD_SCALE);
    expect(MIREMAW_REWARD_REGEN).toBe(TEMPEST_KIRIN_REWARD_REGEN * MOONFEN_REWARD_SCALE);
  });

  it("cycles a tongue sweep into staggered bog bursts", () => {
    const { controller, miremawBoss, miremawBogBursts, player } = createFrostclawHarness({
      currentMapIsSnow: () => false,
      currentMapIsMoonfen: () => true,
    });
    player.x = miremawBoss.x + 300;
    player.y = miremawBoss.y;
    miremawBoss.attackClock = 0;

    controller.updateMiremawBoss(.016);
    expect(miremawBoss.tongue).not.toBeNull();
    expect(miremawBoss.nextAttack).toBe("bogBurst");

    controller.updateMiremawBoss(.7);
    controller.updateMiremawBoss(.6);
    controller.updateMiremawBoss(2.4);
    expect(miremawBogBursts.length).toBeGreaterThan(0);
    expect(miremawBoss.nextAttack).toBe("tongue");
  });
});
