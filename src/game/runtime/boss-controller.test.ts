import {desertBossHealthAt, bossRewardValue, BOSS_BASE_MAX_HP, SNOWLANDS_TUNING, TUTORIAL_BOSS_HEALTH_SCALE} from "../../../shared/progression";
import {afterEach, describe, expect, it, vi} from "vitest";
import {createGameBootstrap} from "./game-bootstrap";
import {BOSS_AREA_KNOCKBACK_DURATION, SPIDER_WEB_RANGE, createBossController} from "./boss-controller";
import {BOSS_DAMAGE_PROFILES} from "../boss-damage";
import {BOSS_CONE_RANGE, FROSTCLAW_ROAR_RANGE, GLOOMROOT_SWEEP_RANGE, KOI_SHOGUN_SLASH_RANGE, MAGMALISK_BITE_RANGE, MIREMAW_TONGUE_RANGE, PRISMSHELL_SHATTER_RANGE, TEMPEST_KIRIN_CHARGE_RANGE, TIDEWYRM_SURGE_RANGE} from "../constants";
import {DRAGON_MAX_HP, FROSTCLAW_MAX_HP, FROSTCLAW_REWARD_ARMOR, FROSTCLAW_REWARD_DAMAGE, FROSTCLAW_REWARD_HEALTH, GLOOMROOT_MAX_HP, GLOOMROOT_REWARD_ARMOR, GLOOMROOT_REWARD_DAMAGE, GLOOMROOT_REWARD_HEALTH, GLOOMROOT_REWARD_REGEN, KOI_SHOGUN_MAX_HP, KOI_SHOGUN_REWARD_ARMOR, KOI_SHOGUN_REWARD_DAMAGE, KOI_SHOGUN_REWARD_HEALTH, KOI_SHOGUN_REWARD_REGEN, MAGMALISK_MAX_HP, MAGMALISK_REWARD_ARMOR, MAGMALISK_REWARD_DAMAGE, MAGMALISK_REWARD_HEALTH, MAGMALISK_REWARD_REGEN, MIREMAW_MAX_HP, PRISMSHELL_MAX_HP, MIREMAW_REWARD_ARMOR, PRISMSHELL_REWARD_ARMOR, MIREMAW_REWARD_DAMAGE, PRISMSHELL_REWARD_DAMAGE, MIREMAW_REWARD_HEALTH, PRISMSHELL_REWARD_HEALTH, MIREMAW_REWARD_REGEN, PRISMSHELL_REWARD_REGEN, TEMPEST_KIRIN_MAX_HP, TEMPEST_KIRIN_REWARD_ARMOR, TEMPEST_KIRIN_REWARD_DAMAGE, TEMPEST_KIRIN_REWARD_HEALTH, TEMPEST_KIRIN_REWARD_REGEN, TIDEWYRM_MAX_HP, TIDEWYRM_REWARD_ARMOR, TIDEWYRM_REWARD_DAMAGE, TIDEWYRM_REWARD_HEALTH, TIDEWYRM_REWARD_REGEN} from "../../../shared/rules";
import {bossAbilityTimelineAt} from "../../../shared/boss-simulation";
import {ION_SWEEP} from "../../../shared/ion-attacks";
import {ADVANCED_LAVA_WASTES_MAP_ID, BEGINNER_DESERT_MAP_ID, CLOUDSPIRE_MAP_ID, CRYSTAL_HOLLOWS_MAP_ID, INFERNAL_DEPTHS_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ION_CITADEL_MAP_ID, MOONFEN_MAP_ID, NEON_BASTION_MAP_ID, SAMURAI_GARDEN_MAP_ID, WATER_REACH_MAP_ID} from "../world";
import type {BossKind} from "./boss-registry";

afterEach(() => vi.unstubAllGlobals());

describe("Dragon boss", () => {
  it("starts at the shared tutorial health balance", () => {
    const { bosses: { dragon: boss } } = createGameBootstrap();
    expect(DRAGON_MAX_HP).toBe(BOSS_BASE_MAX_HP * TUTORIAL_BOSS_HEALTH_SCALE);
    expect(boss.maxHp).toBe(DRAGON_MAX_HP);
    expect(boss.hp).toBe(DRAGON_MAX_HP);
  });
});

/** Shared state or a result for one boss; every other boss has none. */
function forKind<T>(kind: BossKind, value: () => T) {
  return (requested: BossKind) => requested === kind ? value() : null;
}

function createFrostclawHarness(overrides: Partial<Parameters<typeof createBossController>[0]> = {}) {
  const state = createGameBootstrap();
  state.player.x = state.bosses.frostclaw.x + 300;
  state.player.y = state.bosses.frostclaw.y;
  state.player.hp = 1_000_000_000;
  state.player.maxHp = 1_000_000_000;
  state.bosses.frostclaw.attackClock = 0;
  const damagePlayer = vi.fn(() => true);
  const seen = { seen: () => true, start: () => undefined };
  const controller = createBossController({
    bosses: state.bosses,
    hazards: state.bossHazards,
    player: state.player,
    sharedBoss: () => null,
    bossResult: () => null,
    localIdentity: () => "local",
    running: () => true,
    currentMapId: () => INTERMEDIATE_SNOWLANDS_MAP_ID,
    portalCutsceneActive: () => false,
    portalCutscenes: { dragon: seen, spider: seen, frostclaw: seen, magmalisk: seen, gloomroot: seen, tidewyrm: seen },
    spawnBurst: () => undefined,
    damagePlayer,
    ...overrides,
  });
  return { ...state, controller, damagePlayer };
}

type BossHarness = ReturnType<typeof createFrostclawHarness>;

it.each([
  ["Desert", BEGINNER_DESERT_MAP_ID, "spider"],
  ["Snowlands", INTERMEDIATE_SNOWLANDS_MAP_ID, "frostclaw"],
  ["Lava", ADVANCED_LAVA_WASTES_MAP_ID, "magmalisk"],
  ["Infernal", INFERNAL_DEPTHS_MAP_ID, "gloomroot"],
  ["Water", WATER_REACH_MAP_ID, "tidewyrm"],
] as const)("retries the %s first-kill reveal after the server unlock arrives", (_zone, mapId, kind) => {
  let shared = { encounter: 83n, hp: 100, maxHp: 100, alive: true };
  const startCutscene = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
  const overrides = {
    currentMapId: () => mapId,
    sharedBoss: forKind(kind, () => shared),
    bossResult: forKind(kind, () => ({ encounter: 83n, totalDamage: 100,
      contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }] })),
    portalCutscenes: { [kind]: { seen: () => false, start: startCutscene } },
  } as Partial<Parameters<typeof createBossController>[0]>;
  const { controller } = createFrostclawHarness(overrides);
  const sync = controller.byKind[kind].sync;
  sync();
  shared = { ...shared, hp: 0, alive: false };
  sync();
  expect(startCutscene).toHaveBeenCalledTimes(1);
  sync();
  expect(startCutscene).toHaveBeenCalledTimes(2);
  sync();
  expect(startCutscene).toHaveBeenCalledTimes(2);
});

const areaKnockbackBosses: Array<{
  name: string;
  range: number;
  state: (harness: BossHarness) => { x: number; y: number; r: number; attackClock: number };
  update: (harness: BossHarness) => void;
}> = [
  { name: "Dragon cone", range: BOSS_CONE_RANGE, state: (harness) => harness.bosses.dragon, update: (harness) => harness.controller.byKind.dragon.update(.05) },
  { name: "Desert Scorpion web", range: SPIDER_WEB_RANGE, state: (harness) => harness.bosses.spider, update: (harness) => harness.controller.byKind.spider.update(.05) },
  { name: "Frostclaw roar", range: FROSTCLAW_ROAR_RANGE, state: (harness) => harness.bosses.frostclaw, update: (harness) => harness.controller.byKind.frostclaw.update(.05) },
  { name: "Magmalisk bite", range: MAGMALISK_BITE_RANGE, state: (harness) => harness.bosses.magmalisk, update: (harness) => harness.controller.byKind.magmalisk.update(.05) },
  { name: "Gloomroot sweep", range: GLOOMROOT_SWEEP_RANGE, state: (harness) => harness.bosses.gloomroot, update: (harness) => harness.controller.byKind.gloomroot.update(.05) },
  { name: "Tidewyrm surge", range: TIDEWYRM_SURGE_RANGE, state: (harness) => harness.bosses.tidewyrm, update: (harness) => harness.controller.byKind.tidewyrm.update(.05) },
  { name: "Koi Shogun slash", range: KOI_SHOGUN_SLASH_RANGE, state: (harness) => harness.bosses.koiShogun, update: (harness) => harness.controller.byKind.koiShogun.update(.05) },
  { name: "Tempest Kirin charge", range: TEMPEST_KIRIN_CHARGE_RANGE, state: (harness) => harness.bosses.tempestKirin, update: (harness) => harness.controller.byKind.tempestKirin.update(.05) },
  { name: "Miremaw tongue", range: MIREMAW_TONGUE_RANGE, state: (harness) => harness.bosses.miremaw, update: (harness) => harness.controller.byKind.miremaw.update(.05) },
  { name: "Prismshell shatter", range: PRISMSHELL_SHATTER_RANGE, state: (harness) => harness.bosses.prismshell, update: (harness) => harness.controller.byKind.prismshell.update(.05) },
];

describe("Boss area knockback", () => {
  for (const bossCase of areaKnockbackBosses) {
    it(`${bossCase.name} hits without pushing the player`, () => {
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
      expect(after).toBeCloseTo(before, 5);
    });
  }
});

describe("Boss attacks on regular enemies", () => {
  for (const bossCase of areaKnockbackBosses) {
    it(`${bossCase.name} also hits an enemy standing where the player is`, () => {
      const struck: { attack: object; amount: number }[] = [];
      const harness: BossHarness = createFrostclawHarness({
        damageEnemies: (attack, amount, inside) => { if (inside(harness.player.x, harness.player.y, 20)) struck.push({ attack, amount }); },
      });
      const bossState = bossCase.state(harness);
      bossState.attackClock = 0;
      harness.player.x = bossState.x + 300;
      harness.player.y = bossState.y;
      for (let frame = 0; frame < 60 && harness.damagePlayer.mock.calls.length === 0; frame += 1) bossCase.update(harness);
      expect(harness.damagePlayer).toHaveBeenCalledOnce();
      expect(struck.length).toBeGreaterThan(0);
      expect(struck[0].amount).toBe((harness.damagePlayer.mock.calls[0] as unknown as [number])[0]);
    });
  }

  it("lands hazards on enemies inside them", () => {
    const struck: number[] = [];
    const harness: BossHarness = createFrostclawHarness({
      currentMapId: () => ADVANCED_LAVA_WASTES_MAP_ID,
      damageEnemies: (_attack, amount, inside) => { if (inside(harness.bossHazards.magmalisk[0]?.x ?? 0, harness.bossHazards.magmalisk[0]?.y ?? 0, 20)) struck.push(amount); },
    });
    const ground = harness.bossHazards.magmalisk;
    ground.push({ x: 500, y: 500, r: 60, timer: .01, maxTimer: 1 }, { x: 900, y: 900, r: 60, timer: .01, maxTimer: 1 });
    harness.bosses.magmalisk.attackClock = 99;
    harness.controller.byKind.magmalisk.update(.05);
    expect(ground).toHaveLength(0);
    expect(struck.length).toBeGreaterThan(0);
  });
});

describe("Boss body and map enemies", () => {
  it("pushes enemies out of its body and hits each one touching it once per contact cooldown", () => {
    vi.useFakeTimers();
    const pushed = vi.fn(), hits: object[] = [];
    const harness: BossHarness = createFrostclawHarness({
      collideEnemies: pushed,
      damageEnemies: (attack, _amount, inside) => { if (inside(harness.bosses.frostclaw.x + harness.bosses.frostclaw.r + 10, harness.bosses.frostclaw.y, 10)) hits.push(attack); },
    });
    harness.player.x = harness.bosses.frostclaw.x + 2_000;
    for (let i = 0; i < 3; i++) harness.controller.byKind.frostclaw.resolveCollision();
    expect(pushed).toHaveBeenCalledWith(harness.bosses.frostclaw);
    // Three frames, one round: the same attack, so each enemy is hit once.
    expect(new Set(hits).size).toBe(1);
    vi.advanceTimersByTime(800);
    harness.controller.byKind.frostclaw.resolveCollision();
    expect(new Set(hits).size).toBe(2);
    vi.useRealTimers();
  });
});

describe("Boss defeat presentation", () => {
  it("leaves player stats unchanged when a local boss dies or its result is replayed", () => {
    let local = { encounter: 71n, hp: FROSTCLAW_MAX_HP, maxHp: FROSTCLAW_MAX_HP, alive: true };
    const { controller, player } = createFrostclawHarness({
      sharedBoss: forKind("frostclaw", () => local),
      bossResult: forKind("frostclaw", () => ({ encounter: 71n, totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }] })),
    });
    const before = { ...player };
    controller.byKind.frostclaw.sync();
    local = { ...local, hp: 0, alive: false };
    controller.byKind.frostclaw.sync();
    controller.byKind.frostclaw.sync();
    expect(player).toEqual(before);
  });
});

describe("Frostclaw boss", () => {
  it("follows the shared Snowlands boss health and reward budget", () => {
    expect(FROSTCLAW_MAX_HP).toBe(desertBossHealthAt(1) * SNOWLANDS_TUNING.bossHealth);
    expect(FROSTCLAW_REWARD_DAMAGE).toBe(bossRewardValue("damage", 1));
    expect(FROSTCLAW_REWARD_HEALTH).toBe(bossRewardValue("health", 1));
    expect(FROSTCLAW_REWARD_ARMOR).toBe(bossRewardValue("armor", 1));
  });

  it("cycles roar, icefall, and rift as three distinct attacks", () => {
    const { controller, bosses: { frostclaw: frostclawBoss }, bossHazards: { frostclaw: frostclawIcefalls } } = createFrostclawHarness();

    controller.byKind.frostclaw.update(.016);
    expect(frostclawBoss.roar).not.toBeNull();
    expect(frostclawBoss.nextAttack).toBe("icefall");

    controller.byKind.frostclaw.update(.85);
    controller.byKind.frostclaw.update(1);
    controller.byKind.frostclaw.update(2.7);
    expect(frostclawIcefalls).toHaveLength(9);
    expect(frostclawBoss.nextAttack).toBe("rift");

    controller.byKind.frostclaw.update(5);
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
    first.bosses.frostclaw.encounter = encounter;
    first.player.x = first.bosses.frostclaw.x + 300;
    first.controller.byKind.frostclaw.update(.016);

    serverNowMs = phase.startedAtMs + 300;
    const second = createFrostclawHarness({
      serverNowMs: () => serverNowMs,
      bossTargets: () => sharedTargets,
    });
    second.bosses.frostclaw.encounter = encounter;
    second.player.x = second.bosses.frostclaw.x - 300;
    first.controller.byKind.frostclaw.update(.016);
    second.controller.byKind.frostclaw.update(.016);

    const snapshot = (harness: typeof first) => ({
      nextAttack: harness.bosses.frostclaw.nextAttack,
      roar: harness.bosses.frostclaw.roar,
      rift: harness.bosses.frostclaw.rift,
      icefalls: harness.bossHazards.frostclaw,
    });
    expect(Boolean(
      first.bosses.frostclaw.roar ||
      first.bosses.frostclaw.rift ||
      first.bossHazards.frostclaw.length,
    )).toBe(true);
    expect(snapshot(first)).toEqual(snapshot(second));
  });

  it("gives a player who arrives partway through an attack its full warning, or skips one too late to finish", () => {
    let now = 1_800_000_000_000;
    while (bossAbilityTimelineAt({ kind: "frostclaw", serverNowMs: now }).ability !== "roar") now += 500;
    const roar = bossAbilityTimelineAt({ kind: "frostclaw", serverNowMs: now });
    const arrive = (afterMs: number) => {
      const harness = createFrostclawHarness({ serverNowMs: () => roar.startedAtMs + afterMs, bossTargets: () => [{ id: "network:1", x: 4_350, y: 4_050 }] });
      harness.bosses.frostclaw.encounter = 5n;
      harness.controller.byKind.frostclaw.update(.016);
      return harness.bosses.frostclaw.roar;
    };
    expect(arrive(800)?.windup).toBeCloseTo(.85 - .016, 5); // the roar's whole windup, less the one frame run
    expect(arrive(roar.slotDurationMs - roar.activeDurationMs + 100)).toBeNull(); // would be cut off: wait for the next
  });

  it("uses Glacial Roar to damage players without pushing them", () => {
    const { controller, bosses: { frostclaw: frostclawBoss }, player, damagePlayer } = createFrostclawHarness();

    controller.byKind.frostclaw.update(.016);
    controller.byKind.frostclaw.update(.85);
    for (let frame = 0; frame < 8 && damagePlayer.mock.calls.length === 0; frame += 1) {
      controller.byKind.frostclaw.update(.05);
    }

    expect(damagePlayer).toHaveBeenCalledWith(BOSS_DAMAGE_PROFILES.frostclaw.roar);
    const before = Math.hypot(player.x - frostclawBoss.x, player.y - frostclawBoss.y);
    controller.applyBossKnockback(BOSS_AREA_KNOCKBACK_DURATION);
    const after = Math.hypot(player.x - frostclawBoss.x, player.y - frostclawBoss.y);
    expect(after).toBeCloseTo(before, 5);
  });

  it("reveals the Lava Lake portal after a local Frostclaw contribution", () => {
    let shared = { encounter: 7n, hp: FROSTCLAW_MAX_HP, maxHp: FROSTCLAW_MAX_HP, alive: true };
    const startLavaPortalCutscene = vi.fn();
    const { controller } = createFrostclawHarness({
      sharedBoss: forKind("frostclaw", () => shared),
      bossResult: forKind("frostclaw", () => ({
        encounter: 7n,
        totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }],
      })),
      portalCutscenes: { frostclaw: { seen: () => false, start: startLavaPortalCutscene } },
    });

    controller.byKind.frostclaw.sync();
    shared = { ...shared, hp: 0, alive: false };
    controller.byKind.frostclaw.sync();

    expect(startLavaPortalCutscene).toHaveBeenCalledOnce();
  });

  it("reveals the portal for an earlier Frostclaw winner after rollout", () => {
    const shared = { encounter: 8n, hp: 0, maxHp: FROSTCLAW_MAX_HP, alive: false };
    const startLavaPortalCutscene = vi.fn();
    const { controller } = createFrostclawHarness({
      sharedBoss: forKind("frostclaw", () => shared),
      bossResult: forKind("frostclaw", () => ({
        encounter: 8n,
        totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }],
      })),
      portalCutscenes: { frostclaw: { seen: () => false, start: startLavaPortalCutscene } },
    });

    controller.byKind.frostclaw.sync();

    expect(startLavaPortalCutscene).toHaveBeenCalledOnce();
  });
});

describe("Magmalisk boss", () => {
  it("follows the shared Lava Lake boss health and four-stat reward budget", () => {
    expect(MAGMALISK_MAX_HP).toBe(desertBossHealthAt(2));
    expect(MAGMALISK_REWARD_DAMAGE).toBe(bossRewardValue("damage", 2));
    expect(MAGMALISK_REWARD_HEALTH).toBe(bossRewardValue("health", 2));
    expect(MAGMALISK_REWARD_ARMOR).toBe(bossRewardValue("armor", 2));
    expect(MAGMALISK_REWARD_REGEN).toBe(bossRewardValue("regen", 2));
  });

  it("cycles bite and eruption using the selected attack frames", () => {
    const { controller, bosses: { magmalisk: magmaliskBoss }, bossHazards: { magmalisk: magmaliskEruptions }, player } = createFrostclawHarness({
      currentMapId: () => ADVANCED_LAVA_WASTES_MAP_ID,
    });
    player.x = magmaliskBoss.x + 300;
    player.y = magmaliskBoss.y;
    magmaliskBoss.attackClock = 0;

    controller.byKind.magmalisk.update(.016);
    expect(magmaliskBoss.bite).not.toBeNull();
    expect(magmaliskBoss.nextAttack).toBe("eruption");

    controller.byKind.magmalisk.update(.72);
    controller.byKind.magmalisk.update(1);
    controller.byKind.magmalisk.update(2.5);
    expect(magmaliskEruptions).toHaveLength(11);
    expect(magmaliskBoss.nextAttack).toBe("bite");
  });

  it("reveals Infernal Depths after a local Magmalisk contribution", () => {
    let shared = { encounter: 9n, hp: MAGMALISK_MAX_HP, maxHp: MAGMALISK_MAX_HP, alive: true };
    const startInfernalPortalCutscene = vi.fn();
    const { controller } = createFrostclawHarness({
      currentMapId: () => ADVANCED_LAVA_WASTES_MAP_ID,
      sharedBoss: forKind("magmalisk", () => shared),
      bossResult: forKind("magmalisk", () => ({
        encounter: 9n,
        totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }],
      })),
      portalCutscenes: { magmalisk: { seen: () => false, start: startInfernalPortalCutscene } },
    });

    controller.byKind.magmalisk.sync();
    shared = { ...shared, hp: 0, alive: false };
    controller.byKind.magmalisk.sync();

    expect(startInfernalPortalCutscene).toHaveBeenCalledOnce();
  });
});

describe("Gloomroot boss", () => {
  it("caps Night Forest with a four-stat Water Reach unlock reward", () => {
    expect(GLOOMROOT_MAX_HP).toBe(desertBossHealthAt(3));
    expect(GLOOMROOT_REWARD_DAMAGE).toBe(bossRewardValue("damage", 3));
    expect(GLOOMROOT_REWARD_HEALTH).toBe(bossRewardValue("health", 3));
    expect(GLOOMROOT_REWARD_ARMOR).toBe(bossRewardValue("armor", 3));
    expect(GLOOMROOT_REWARD_REGEN).toBe(bossRewardValue("regen", 3));
  });

  it("cycles a readable root sweep into staggered Gloom Blooms", () => {
    const { controller, bosses: { gloomroot: gloomrootBoss }, bossHazards: { gloomroot: gloomrootBlooms }, player } = createFrostclawHarness({
      currentMapId: () => INFERNAL_DEPTHS_MAP_ID,
    });
    player.x = gloomrootBoss.x + 300;
    player.y = gloomrootBoss.y;
    gloomrootBoss.attackClock = 0;

    controller.byKind.gloomroot.update(.016);
    expect(gloomrootBoss.sweep).not.toBeNull();
    expect(gloomrootBoss.nextAttack).toBe("bloom");

    controller.byKind.gloomroot.update(.85);
    controller.byKind.gloomroot.update(1.1);
    controller.byKind.gloomroot.update(2.6);
    expect(gloomrootBlooms.length).toBeGreaterThan(0);
    expect(gloomrootBoss.nextAttack).toBe("sweep");
  });

  it("reveals Water Reach after a local Gloomroot contribution", () => {
    let shared = { encounter: 10n, hp: GLOOMROOT_MAX_HP, maxHp: GLOOMROOT_MAX_HP, alive: true };
    const startWaterPortalCutscene = vi.fn();
    const { controller } = createFrostclawHarness({
      currentMapId: () => INFERNAL_DEPTHS_MAP_ID,
      sharedBoss: forKind("gloomroot", () => shared),
      bossResult: forKind("gloomroot", () => ({
        encounter: 10n,
        totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }],
      })),
      portalCutscenes: { gloomroot: { seen: () => false, start: startWaterPortalCutscene } },
    });

    controller.byKind.gloomroot.sync();
    shared = { ...shared, hp: 0, alive: false };
    controller.byKind.gloomroot.sync();

    expect(startWaterPortalCutscene).toHaveBeenCalledOnce();
  });
});

describe("Tidewyrm boss", () => {
  it("caps Water Reach with the scaled Samurai Garden unlock reward", () => {
    expect(TIDEWYRM_MAX_HP).toBe(desertBossHealthAt(4));
    expect(TIDEWYRM_REWARD_DAMAGE).toBe(bossRewardValue("damage", 4));
    expect(TIDEWYRM_REWARD_HEALTH).toBe(bossRewardValue("health", 4));
    expect(TIDEWYRM_REWARD_ARMOR).toBe(bossRewardValue("armor", 4));
    expect(TIDEWYRM_REWARD_REGEN).toBe(bossRewardValue("regen", 4));
  });

  it("cycles a tidal surge into staggered whirlpools", () => {
    const { controller, bosses: { tidewyrm: tidewyrmBoss }, bossHazards: { tidewyrm: tidewyrmWhirlpools }, player } = createFrostclawHarness({
      currentMapId: () => WATER_REACH_MAP_ID,
    });
    player.x = tidewyrmBoss.x + 300;
    player.y = tidewyrmBoss.y;
    tidewyrmBoss.attackClock = 0;

    controller.byKind.tidewyrm.update(.016);
    expect(tidewyrmBoss.surge).not.toBeNull();
    expect(tidewyrmBoss.nextAttack).toBe("whirlpool");

    controller.byKind.tidewyrm.update(.82);
    controller.byKind.tidewyrm.update(1.1);
    controller.byKind.tidewyrm.update(2.5);
    expect(tidewyrmWhirlpools.length).toBeGreaterThan(0);
    expect(tidewyrmBoss.nextAttack).toBe("surge");
  });

  it("reveals Samurai Garden after a local Tidewyrm contribution", () => {
    let shared = { encounter: 11n, hp: TIDEWYRM_MAX_HP, maxHp: TIDEWYRM_MAX_HP, alive: true };
    const startSamuraiPortalCutscene = vi.fn();
    const { controller } = createFrostclawHarness({
      currentMapId: () => WATER_REACH_MAP_ID,
      sharedBoss: forKind("tidewyrm", () => shared),
      bossResult: forKind("tidewyrm", () => ({
        encounter: 11n,
        totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }],
      })),
      portalCutscenes: { tidewyrm: { seen: () => false, start: startSamuraiPortalCutscene } },
    });

    controller.byKind.tidewyrm.sync();
    shared = { ...shared, hp: 0, alive: false };
    controller.byKind.tidewyrm.sync();

    expect(startSamuraiPortalCutscene).toHaveBeenCalledOnce();
  });

  it("does not add rewards again when hydrating an already-dead encounter", () => {
    const shared = { encounter: 12n, hp: 0, maxHp: TIDEWYRM_MAX_HP, alive: false };
    const startSamuraiPortalCutscene = vi.fn();
    const { controller, player } = createFrostclawHarness({
      currentMapId: () => WATER_REACH_MAP_ID,
      sharedBoss: forKind("tidewyrm", () => shared),
      bossResult: forKind("tidewyrm", () => ({
        encounter: 12n,
        totalDamage: 100,
        contributors: [{ identity: "local", name: "Local", gender: 0, damage: 100, percentage: 100 }],
      })),
      portalCutscenes: { tidewyrm: { seen: () => false, start: startSamuraiPortalCutscene } },
    });
    const damageBefore = player.damage;
    const maxHealthBefore = player.baseMaxHp;

    controller.byKind.tidewyrm.sync();

    expect(startSamuraiPortalCutscene).toHaveBeenCalledOnce();
    expect(player.damage).toBe(damageBefore);
    expect(player.baseMaxHp).toBe(maxHealthBefore);
  });
});

describe("Koi Shogun boss", () => {
  it("caps Samurai Garden with a repeatable late-map reward", () => {
    expect(KOI_SHOGUN_MAX_HP).toBe(desertBossHealthAt(5));
    expect(KOI_SHOGUN_REWARD_DAMAGE).toBe(bossRewardValue("damage", 5));
    expect(KOI_SHOGUN_REWARD_HEALTH).toBe(bossRewardValue("health", 5));
    expect(KOI_SHOGUN_REWARD_ARMOR).toBe(bossRewardValue("armor", 5));
    expect(KOI_SHOGUN_REWARD_REGEN).toBe(bossRewardValue("regen", 5));
  });

  it("cycles a water slash into staggered whirlpools", () => {
    const { controller, bosses: { koiShogun: koiShogunBoss }, bossHazards: { koiShogun: koiShogunWhirlpools }, player } = createFrostclawHarness({
      currentMapId: () => SAMURAI_GARDEN_MAP_ID,
    });
    player.x = koiShogunBoss.x + 300;
    player.y = koiShogunBoss.y;
    koiShogunBoss.attackClock = 0;

    controller.byKind.koiShogun.update(.016);
    expect(koiShogunBoss.slash).not.toBeNull();
    expect(koiShogunBoss.nextAttack).toBe("whirlpool");

    controller.byKind.koiShogun.update(.78);
    controller.byKind.koiShogun.update(1.1);
    controller.byKind.koiShogun.update(2.5);
    expect(koiShogunWhirlpools.length).toBeGreaterThan(0);
    expect(koiShogunBoss.nextAttack).toBe("slash");
  });
});

describe("Tempest Kirin boss", () => {
  it("caps Cloudspire with the next repeatable late-map reward", () => {
    expect(TEMPEST_KIRIN_MAX_HP).toBe(desertBossHealthAt(6));
    expect(TEMPEST_KIRIN_REWARD_DAMAGE).toBe(bossRewardValue("damage", 6));
    expect(TEMPEST_KIRIN_REWARD_HEALTH).toBe(bossRewardValue("health", 6));
    expect(TEMPEST_KIRIN_REWARD_ARMOR).toBe(bossRewardValue("armor", 6));
    expect(TEMPEST_KIRIN_REWARD_REGEN).toBe(bossRewardValue("regen", 6));
  });

  it("cycles a charge wave into targeted thunder circles", () => {
    const { controller, bosses: { tempestKirin: tempestKirinBoss }, bossHazards: { tempestKirin: tempestKirinThunderbolts }, player } = createFrostclawHarness({
      currentMapId: () => CLOUDSPIRE_MAP_ID,
    });
    player.x = tempestKirinBoss.x + 300;
    player.y = tempestKirinBoss.y;
    tempestKirinBoss.attackClock = 0;

    controller.byKind.tempestKirin.update(.016);
    expect(tempestKirinBoss.charge).not.toBeNull();
    expect(tempestKirinBoss.nextAttack).toBe("thunder");

    controller.byKind.tempestKirin.update(.75);
    controller.byKind.tempestKirin.update(1.05);
    controller.byKind.tempestKirin.update(2.4);
    expect(tempestKirinThunderbolts.length).toBeGreaterThan(0);
    expect(tempestKirinBoss.nextAttack).toBe("charge");
  });
});

describe("Miremaw boss", () => {
  it("uses the tuned body edge for contact damage", () => {
    const { controller, bosses: { miremaw: miremawBoss }, player, damagePlayer } = createFrostclawHarness();
    expect(miremawBoss.ry).toBe(95);
    expect(miremawBoss.hitboxOffsetY).toBe(63);
    const top = miremawBoss.y + (miremawBoss.hitboxOffsetY ?? 0) - (miremawBoss.ry ?? miremawBoss.r) - player.r;
    player.x = miremawBoss.x;
    player.y = top - 1;
    controller.byKind.miremaw.resolveCollision();
    expect(damagePlayer).not.toHaveBeenCalled();
    expect(player.y).toBe(top - 1);

    player.y = top + 1;
    controller.byKind.miremaw.resolveCollision();
    expect(damagePlayer).toHaveBeenCalledOnce();
    expect(player.y).toBeCloseTo(top);
  });

  it("caps Moonfen with the next repeatable late-map reward", () => {
    expect(MIREMAW_MAX_HP).toBe(desertBossHealthAt(7));
    expect(MIREMAW_REWARD_DAMAGE).toBe(bossRewardValue("damage", 7));
    expect(MIREMAW_REWARD_HEALTH).toBe(bossRewardValue("health", 7));
    expect(MIREMAW_REWARD_ARMOR).toBe(bossRewardValue("armor", 7));
    expect(MIREMAW_REWARD_REGEN).toBe(bossRewardValue("regen", 7));
  });

  it("cycles a tongue sweep into staggered bog bursts", () => {
    const { controller, bosses: { miremaw: miremawBoss }, bossHazards: { miremaw: miremawBogBursts }, player } = createFrostclawHarness({
      currentMapId: () => MOONFEN_MAP_ID,
    });
    player.x = miremawBoss.x + 300;
    player.y = miremawBoss.y;
    miremawBoss.attackClock = 0;

    controller.byKind.miremaw.update(.016);
    expect(miremawBoss.tongue).not.toBeNull();
    expect(miremawBoss.nextAttack).toBe("bogBurst");

    controller.byKind.miremaw.update(.7);
    controller.byKind.miremaw.update(.6);
    controller.byKind.miremaw.update(2.4);
    expect(miremawBogBursts.length).toBeGreaterThan(0);
    expect(miremawBoss.nextAttack).toBe("tongue");
  });
});

describe("Prismshell boss", () => {
  it("continues the full progression step after Miremaw", () => {
    expect(PRISMSHELL_MAX_HP).toBe(desertBossHealthAt(8));
    expect(PRISMSHELL_REWARD_DAMAGE).toBe(bossRewardValue("damage", 8));
    expect(PRISMSHELL_REWARD_HEALTH).toBe(bossRewardValue("health", 8));
    expect(PRISMSHELL_REWARD_ARMOR).toBe(bossRewardValue("armor", 8));
    expect(PRISMSHELL_REWARD_REGEN).toBe(bossRewardValue("regen", 8));
  });

  it("cycles its wider shatter sweep into eight staggered crystal bursts", () => {
    const { controller, bosses: { prismshell: prismshellBoss }, bossHazards: { prismshell: prismshellCrystalBursts }, player } = createFrostclawHarness({
      currentMapId: () => CRYSTAL_HOLLOWS_MAP_ID,
    });
    player.x = prismshellBoss.x + 300;
    player.y = prismshellBoss.y;
    prismshellBoss.attackClock = 0;
    controller.byKind.prismshell.update(.016);
    expect(prismshellBoss.shatter).toMatchObject({ windup: .85, duration: .8 });
    expect(prismshellBoss.nextAttack).toBe("crystalBurst");
    controller.byKind.prismshell.update(.86);
    controller.byKind.prismshell.update(.81);
    controller.byKind.prismshell.update(2.4);
    expect(prismshellCrystalBursts).toHaveLength(8);
    expect(prismshellCrystalBursts.every((burst) => burst.r === 86)).toBe(true);
    expect(new Set(prismshellCrystalBursts.map((burst) => burst.maxTimer)).size).toBe(8);
    expect(prismshellBoss.nextAttack).toBe("shatter");
    controller.byKind.prismshell.reset();
    expect(prismshellBoss.shatter).toBeNull();
    expect(prismshellCrystalBursts).toHaveLength(0);
  });
});


describe("expansion boss patterns", () => {
  it("Ironhorn alternates a narrow wave with two rows of scrap and clears on reset", () => {
    const h = createFrostclawHarness();
    h.player.x = h.bosses.ironhorn.x + 300; h.player.y = h.bosses.ironhorn.y;
    h.bosses.ironhorn.attackClock = 0;
    h.controller.byKind.ironhorn.update(.016);
    expect(h.bosses.ironhorn.shatter).toMatchObject({ windup: 1.05, duration: .8 });
    h.controller.byKind.ironhorn.update(1.06); h.controller.byKind.ironhorn.update(.81); h.controller.byKind.ironhorn.update(2.4);
    expect(h.bossHazards.ironhorn).toHaveLength(6);
    expect(new Set(h.bossHazards.ironhorn.map(burst => burst.maxTimer)).size).toBe(2);
    h.controller.byKind.ironhorn.reset();
    expect(h.bossHazards.ironhorn).toHaveLength(0);
    expect(h.bosses.ironhorn.shatter).toBeNull();
  });
  it("Dreadreaper surrounds its target with a ring that leaves the center safe", () => {
    const h = createFrostclawHarness();
    h.player.x = h.bosses.dreadreaper.x - 300; h.player.y = h.bosses.dreadreaper.y;
    h.bosses.dreadreaper.attackClock = 0;
    h.controller.byKind.dreadreaper.update(.016);
    expect(h.bosses.dreadreaper.shatter).toMatchObject({ windup: 1.1, duration: .8 });
    h.controller.byKind.dreadreaper.update(1.11); h.controller.byKind.dreadreaper.update(.81); h.controller.byKind.dreadreaper.update(2.4);
    expect(h.bossHazards.dreadreaper).toHaveLength(10);
    for (const burst of h.bossHazards.dreadreaper) expect(Math.hypot(burst.x - h.player.x, burst.y - h.player.y)).toBeGreaterThan(burst.r);
    h.controller.byKind.dreadreaper.reset();
    expect(h.bossHazards.dreadreaper).toHaveLength(0);
    expect(h.bosses.dreadreaper.shatter).toBeNull();
  });
});

it("runs Voltwarden's laser lanes and staggered EMP rings on the shared clock", () => {
  let serverNowMs = 100;
  const h = createFrostclawHarness({ serverNowMs: () => serverNowMs, currentMapId: () => NEON_BASTION_MAP_ID });
  h.bosses.voltwarden.dead = false;
  h.player.x = h.bosses.voltwarden.x + 500; h.player.y = h.bosses.voltwarden.y;
  h.controller.byKind.voltwarden.update(.01);
  expect(h.bosses.voltwarden.shatter).not.toBeNull();
  expect(h.bosses.voltwarden.nextAttack).toBe("empPulse");
  h.player.y += 95;
  serverNowMs = 1500;
  h.controller.byKind.voltwarden.update(1.4);
  expect(h.damagePlayer).not.toHaveBeenCalled();
  serverNowMs = 4800;
  h.controller.byKind.voltwarden.update(.01);
  expect(h.bosses.voltwarden.shatter).toBeNull();
  expect(h.bossHazards.voltwarden).toHaveLength(3);
  for (const pulse of h.bossHazards.voltwarden) {
    expect(pulse.x).toBe(h.bosses.voltwarden.x); expect(pulse.y).toBe(h.bosses.voltwarden.y);
  }
});

it("alternates Aegis Prime's shared-clock volley direction and clears attacks on reset", () => {
  let serverNowMs = 4900;
  const h = createFrostclawHarness({ serverNowMs: () => serverNowMs, currentMapId: () => ION_CITADEL_MAP_ID });
  h.bosses.aegisPrime.dead = false;
  h.player.x = h.bosses.aegisPrime.x - 400; h.player.y = h.bosses.aegisPrime.y;
  h.controller.byKind.aegisPrime.update(.01);
  expect(h.bossHazards.aegisPrime).toHaveLength(3);
  expect(h.bossHazards.aegisPrime.every(p => Math.abs(p.y - h.player.y) < .001)).toBe(true);
  serverNowMs += 9900;
  h.controller.byKind.aegisPrime.update(.01);
  expect(h.bossHazards.aegisPrime).toHaveLength(3);
  expect(h.bossHazards.aegisPrime.every(p => Math.abs(p.x - h.player.x) < .001)).toBe(true);
  h.controller.byKind.aegisPrime.reset();
  expect(h.bossHazards.aegisPrime).toHaveLength(0);
  expect(h.bosses.aegisPrime.shatter).toBeNull();
});

it("lands Aegis Prime's shield sweep where its drawn wave is, not across the whole arc at once", () => {
  // Where the travelling wave is drawn when the hit lands, for a player this far in front.
  const waveRadiusAtHit = (distance: number) => {
    let serverNowMs = 100; // the opening Shield Sweep slot
    const h = createFrostclawHarness({ serverNowMs: () => serverNowMs, currentMapId: () => ION_CITADEL_MAP_ID });
    h.bosses.aegisPrime.dead = false;
    h.player.x = h.bosses.aegisPrime.x - distance; h.player.y = h.bosses.aegisPrime.y;
    for (let frame = 0; frame < 150 && !h.damagePlayer.mock.calls.length; frame++) {
      serverNowMs += 1_000 / 60;
      h.controller.byKind.aegisPrime.update(1 / 60);
    }
    expect(h.damagePlayer).toHaveBeenCalledTimes(1);
    const sweep = h.bosses.aegisPrime.shatter!;
    expect(sweep.windup).toBe(0);
    return ION_SWEEP.innerRange + (1 - Math.max(0, sweep.timer) / sweep.duration) * (ION_SWEEP.range - ION_SWEEP.innerRange);
  };
  // The wave's 42px reach, plus the 16px it travels in one frame.
  for (const distance of [250, 450, 650]) expect(Math.abs(waveRadiusAtHit(distance) - distance)).toBeLessThanOrEqual(42 + 16);
});

it("leads Angler hits by half a second without replaying on staggered circles", () => {
  const h = createFrostclawHarness({ currentMapId: () => WATER_REACH_MAP_ID });
  h.player.x = h.bosses.tidewyrm.x + 300; h.player.y = h.bosses.tidewyrm.y;
  h.bosses.tidewyrm.attackClock = 0;
  h.controller.byKind.tidewyrm.update(.016);
  expect(h.bosses.tidewyrm.spriteAttackElapsed).toBeCloseTo(-.32);
  h.controller.byKind.tidewyrm.update(.82);
  expect(h.bosses.tidewyrm.spriteAttackElapsed).toBeCloseTo(.5);
  h.controller.byKind.tidewyrm.update(1.1);
  h.controller.byKind.tidewyrm.update(2.5);
  expect(h.bossHazards.tidewyrm.length).toBeGreaterThan(0);
  expect(h.bosses.tidewyrm.spriteAttackElapsed).toBeCloseTo(-.35);
  h.controller.byKind.tidewyrm.update(.36);
  expect(h.bosses.tidewyrm.spriteAttackElapsed).toBeCloseTo(.01);
  h.controller.byKind.tidewyrm.update(.5);
  expect(h.bosses.tidewyrm.spriteAttackElapsed).toBeCloseTo(.51);
  h.controller.byKind.tidewyrm.reset();
  expect(h.bosses.tidewyrm.spriteAttackElapsed).toBeUndefined();
});
