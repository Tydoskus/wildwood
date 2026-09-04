import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import {
  ADVANCED_LAVA_WASTES_DAMAGE_REWARD_MULTIPLIER,
  ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE,
  ADVANCED_LAVA_WASTES_ENCOUNTER_REWARD_SCALE,
  ADVANCED_LAVA_WASTES_HEALTH_SCALE,
  ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER,
  ADVANCED_LAVA_WASTES_REGULAR_REWARD_MULTIPLIER,
  ADVANCED_LAVA_WASTES_REWARD_SCALE,
  BEGINNER_DESERT_CLEAR_ARCHETYPE_COUNTS,
  BEGINNER_DESERT_HEALTH_SCALE,
  BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER,
  CRYSTAL_HOLLOWS_DAMAGE_SCALE,
  CRYSTAL_HOLLOWS_ENCOUNTER_HEALTH_SCALE,
  CRYSTAL_HOLLOWS_ENCOUNTER_REWARD_SCALE,
  CRYSTAL_HOLLOWS_HEALTH_SCALE,
  CRYSTAL_HOLLOWS_REWARD_SCALE,
  INFERNAL_DEPTHS_DAMAGE_REWARD_MULTIPLIER,
  INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE,
  INFERNAL_DEPTHS_ENCOUNTER_REWARD_SCALE,
  INFERNAL_DEPTHS_HEALTH_SCALE,
  INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER,
  INFERNAL_DEPTHS_REGULAR_REWARD_MULTIPLIER,
  INFERNAL_DEPTHS_REWARD_SCALE,
  INTERMEDIATE_SNOWLANDS_CLEAR_ARCHETYPE_COUNTS,
  INTERMEDIATE_SNOWLANDS_HEALTH_SCALE,
  INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER,
  LATE_MAP_CLEAR_ARCHETYPE_COUNTS,
  SAMURAI_GARDEN_ARCHETYPE_PROFILE,
  SAMURAI_GARDEN_DAMAGE_SCALE,
  SAMURAI_GARDEN_ENCOUNTER_CADENCE_SCALE,
  SAMURAI_GARDEN_HEALTH_SCALE,
  SAMURAI_GARDEN_OPEN_MAP_REWARD_MULTIPLIER,
  SAMURAI_GARDEN_REWARD_SCALE,
  WATER_REACH_DAMAGE_REWARD_MULTIPLIER,
  WATER_REACH_ENCOUNTER_HEALTH_SCALE,
  WATER_REACH_ENCOUNTER_REWARD_SCALE,
  WATER_REACH_HEALTH_SCALE,
  WATER_REACH_REGULAR_HEALTH_MULTIPLIER,
  WATER_REACH_REGULAR_REWARD_MULTIPLIER,
  WATER_REACH_REWARD_SCALE,
  WASTES_REAPER_CADENCE_SCALE,
} from "../../shared/rules";
import {
  ENEMY_TYPES,
  createMapScopedEnemySpriteAssets,
  enemySpriteAssetSources,
  loadEnemySprites,
  rewardLabel,
  type EnemyKind,
  type EnemySpriteSource,
} from "./enemies";
import {
  ELITE_ENEMY_SPRITE_SIZE,
  ENEMY_SPRITE_LAYOUTS,
  MAP_ENEMY_FAMILIES,
  REGULAR_ENEMY_SPRITE_SIZE,
} from "./enemy-sprite-layouts.mjs";
import { mapSpawnCamps, type MapId } from "./world";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("enemy reward rules", () => {
  it("keeps the onboarding rewards and labels intentional", () => {
    expect(ENEMY_TYPES.Bramble.reward).toEqual({ type: "health", amount: 28 });
    expect(ENEMY_TYPES.Mossback.reward).toEqual({ type: "armor", amount: 5 });
    expect(ENEMY_TYPES["King Slime"].reward).toEqual({ type: "health", amount: 352 });
    expect(ENEMY_TYPES.Spitter.reward).toEqual({ type: "damage", amount: 1 });
    expect(rewardLabel({ type: "speed", amount: .25 })).toBe("+0.25 ATK/SEC");
    expect(rewardLabel({ type: "damage", amount: 1.05 })).toBe("+1.05 DAMAGE");
    expect(rewardLabel({ type: "armor", amount: 150 })).toBe("+150 ARMOR");
    expect(rewardLabel({ type: "health", amount: 8_500 })).toBe("+8.50k MAX HEALTH");
    expect(rewardLabel({ type: "damage", amount: 240_000 })).toBe("+240k DAMAGE");
  });

  it("preserves each authored full-clear health budget while adding encounter texture", () => {
    type EnemyKind = keyof typeof ENEMY_TYPES;
    const repeated = (previous: number, current: number) => current * current / previous;
    const maps: { enemies: readonly [EnemyKind, number, number][] }[] = [
      { enemies: [
        ["Dune Raider", BEGINNER_DESERT_CLEAR_ARCHETYPE_COUNTS.raider, 1_200_000 * BEGINNER_DESERT_HEALTH_SCALE * BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER],
        ["Dune Archer", BEGINNER_DESERT_CLEAR_ARCHETYPE_COUNTS.archer, 900_000 * BEGINNER_DESERT_HEALTH_SCALE * BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER],
        ["Venom Guard", BEGINNER_DESERT_CLEAR_ARCHETYPE_COUNTS.guardian, 2_600_000 * BEGINNER_DESERT_HEALTH_SCALE * BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER],
        ["Wastes Reaper", BEGINNER_DESERT_CLEAR_ARCHETYPE_COUNTS.reaper, 5_000_000 * BEGINNER_DESERT_HEALTH_SCALE * WASTES_REAPER_CADENCE_SCALE * BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER],
        ["Blight Oracle", BEGINNER_DESERT_CLEAR_ARCHETYPE_COUNTS.oracle, 4_000_000 * BEGINNER_DESERT_HEALTH_SCALE * BEGINNER_DESERT_REGULAR_HEALTH_MULTIPLIER],
      ] },
      { enemies: [
        ["Frost Raider", INTERMEDIATE_SNOWLANDS_CLEAR_ARCHETYPE_COUNTS.raider, 2_700_000_000 * INTERMEDIATE_SNOWLANDS_HEALTH_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER],
        ["Glacier Archer", INTERMEDIATE_SNOWLANDS_CLEAR_ARCHETYPE_COUNTS.archer, 2_280_000_000 * INTERMEDIATE_SNOWLANDS_HEALTH_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER],
        ["Rime Guard", INTERMEDIATE_SNOWLANDS_CLEAR_ARCHETYPE_COUNTS.guardian, 17_790_000_000 * INTERMEDIATE_SNOWLANDS_HEALTH_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER],
        ["Whiteout Reaper", INTERMEDIATE_SNOWLANDS_CLEAR_ARCHETYPE_COUNTS.reaper, 25_000_000_000 * INTERMEDIATE_SNOWLANDS_HEALTH_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER],
        ["Aurora Oracle", INTERMEDIATE_SNOWLANDS_CLEAR_ARCHETYPE_COUNTS.oracle, 16_000_000_000 * INTERMEDIATE_SNOWLANDS_HEALTH_SCALE * INTERMEDIATE_SNOWLANDS_REGULAR_HEALTH_MULTIPLIER],
      ] },
      { enemies: [
        ["Ember Raider", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.raider, 6_075_000_000_000 * ADVANCED_LAVA_WASTES_HEALTH_SCALE * ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE],
        ["Cinder Archer", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.archer, 5_776_000_000_000 * ADVANCED_LAVA_WASTES_HEALTH_SCALE * ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE],
        ["Magma Guard", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.guardian, 121_725_000_000_000 * ADVANCED_LAVA_WASTES_HEALTH_SCALE * ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE],
        ["Ash Reaper", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.reaper, 125_000_000_000_000 * ADVANCED_LAVA_WASTES_HEALTH_SCALE * ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE],
        ["Inferno Oracle", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.oracle, 64_000_000_000_000 * ADVANCED_LAVA_WASTES_HEALTH_SCALE * ADVANCED_LAVA_WASTES_REGULAR_HEALTH_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_HEALTH_SCALE],
      ] },
      { enemies: [
        ["Depth Raider", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.raider, (repeated(2_700_000_000, 6_075_000_000_000) - 10_000_000_000_000_000) * INFERNAL_DEPTHS_HEALTH_SCALE * INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE],
        ["Abyss Archer", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.archer, repeated(2_280_000_000, 5_776_000_000_000) * INFERNAL_DEPTHS_HEALTH_SCALE * INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE],
        ["Obsidian Colossus", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.guardian, repeated(17_790_000_000, 121_725_000_000_000) * INFERNAL_DEPTHS_HEALTH_SCALE * INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE],
        ["Doom Reaper", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.reaper, repeated(25_000_000_000, 125_000_000_000_000) * INFERNAL_DEPTHS_HEALTH_SCALE * INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE],
        ["Nether Oracle", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.oracle, repeated(16_000_000_000, 64_000_000_000_000) * INFERNAL_DEPTHS_HEALTH_SCALE * INFERNAL_DEPTHS_REGULAR_HEALTH_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_HEALTH_SCALE],
      ] },
      { enemies: [
        ["Tide Raider", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.raider, 10_000_000_000_000 * WATER_REACH_HEALTH_SCALE * WATER_REACH_REGULAR_HEALTH_MULTIPLIER * WATER_REACH_ENCOUNTER_HEALTH_SCALE],
        ["Reef Archer", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.archer, 40_000_000_000_000 * WATER_REACH_HEALTH_SCALE * WATER_REACH_REGULAR_HEALTH_MULTIPLIER * WATER_REACH_ENCOUNTER_HEALTH_SCALE],
        ["Coral Colossus", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.guardian, 2_250_000_000_000_000 * WATER_REACH_HEALTH_SCALE * WATER_REACH_REGULAR_HEALTH_MULTIPLIER * WATER_REACH_ENCOUNTER_HEALTH_SCALE],
        ["Drowned Reaper", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.reaper, 1_700_000_000_000_000 * WATER_REACH_HEALTH_SCALE * WATER_REACH_REGULAR_HEALTH_MULTIPLIER * WATER_REACH_ENCOUNTER_HEALTH_SCALE],
        ["Tidal Oracle", LATE_MAP_CLEAR_ARCHETYPE_COUNTS.oracle, 700_000_000_000_000 * WATER_REACH_HEALTH_SCALE * WATER_REACH_REGULAR_HEALTH_MULTIPLIER * WATER_REACH_ENCOUNTER_HEALTH_SCALE],
      ] },
    ];

    for (const { enemies } of maps) {
      const actual = enemies.reduce((total, [kind, count]) => total + ENEMY_TYPES[kind].hp * count, 0);
      const authored = enemies.reduce((total, [, count, sourceHp]) => total + sourceHp * count, 0);
      expect(actual / authored).toBeCloseTo(1, 10);
      const health = enemies.map(([kind]) => ENEMY_TYPES[kind].hp);
      expect(Math.max(...health) / Math.min(...health)).toBeLessThan(2.5);
    }
  });

  it("keeps late-map elite damage rewards above regular rewards without changing the budget", () => {
    const repeated = (previous: number, current: number) => current * current / previous;
    const tracks = [
      {
        raider: "Ember Raider",
        reaper: "Ash Reaper",
        authored: (48_000_000 * 6 + 1_984_500_000 * 7) * ADVANCED_LAVA_WASTES_REWARD_SCALE * ADVANCED_LAVA_WASTES_REGULAR_REWARD_MULTIPLIER * ADVANCED_LAVA_WASTES_DAMAGE_REWARD_MULTIPLIER * ADVANCED_LAVA_WASTES_ENCOUNTER_REWARD_SCALE,
      },
      {
        raider: "Depth Raider",
        reaper: "Doom Reaper",
        authored: (repeated(240_000, 48_000_000) * 6 * 6 + repeated(3_150_000, 1_984_500_000) * 2 * 7) * INFERNAL_DEPTHS_REWARD_SCALE * INFERNAL_DEPTHS_REGULAR_REWARD_MULTIPLIER * INFERNAL_DEPTHS_DAMAGE_REWARD_MULTIPLIER * INFERNAL_DEPTHS_ENCOUNTER_REWARD_SCALE,
      },
      {
        raider: "Tide Raider",
        reaper: "Drowned Reaper",
        authored: (18_000_000_000 * 6 + 830_000_000_000 * 7) * WATER_REACH_REWARD_SCALE * WATER_REACH_REGULAR_REWARD_MULTIPLIER * WATER_REACH_DAMAGE_REWARD_MULTIPLIER * WATER_REACH_ENCOUNTER_REWARD_SCALE,
      },
    ] as const;

    for (const track of tracks) {
      const raider = ENEMY_TYPES[track.raider].reward;
      const reaper = ENEMY_TYPES[track.reaper].reward;
      expect(raider.type).toBe("damage");
      expect(reaper.type).toBe("damage");
      expect(reaper.amount).toBeGreaterThan(raider.amount);
      expect(reaper.amount / raider.amount).toBeCloseTo(1.25, 10);
      expect((raider.amount * 6 + reaper.amount * 7) / track.authored).toBeCloseTo(1, 10);
    }

    expect(ENEMY_TYPES["Moonblade Reaper"].reward.amount)
      .toBeGreaterThan(ENEMY_TYPES["Sakura Ronin"].reward.amount);
  });

  it("keeps regular-enemy hit damage closely grouped from Lava Lake onward", () => {
    const maps = [
      ["Ember Raider", "Cinder Archer", "Magma Guard", "Ash Reaper", "Inferno Oracle"],
      ["Depth Raider", "Abyss Archer", "Obsidian Colossus", "Doom Reaper", "Nether Oracle"],
      ["Tide Raider", "Reef Archer", "Coral Colossus", "Drowned Reaper", "Tidal Oracle"],
      ["Sakura Ronin", "Petal Archer", "Bamboo Guardian", "Moonblade Reaper", "Shrine Oracle"],
    ] as const;
    for (const kinds of maps) {
      const damages = kinds.map((kind) => ENEMY_TYPES[kind].damage);
      expect(Math.max(...damages) / Math.min(...damages)).toBeLessThan(1.71);
    }
  });

  it("textures Samurai archetypes without drifting from the full-clear curve", () => {
    const tracks = [
      ["raider", "Tide Raider", "Sakura Ronin"],
      ["archer", "Reef Archer", "Petal Archer"],
      ["guardian", "Coral Colossus", "Bamboo Guardian"],
      ["reaper", "Drowned Reaper", "Moonblade Reaper"],
      ["oracle", "Tidal Oracle", "Shrine Oracle"],
    ] as const;
    const rewardPower = (reward: (typeof ENEMY_TYPES)[keyof typeof ENEMY_TYPES]["reward"]) =>
      reward.amount * (reward.type === "armor" ? 3 : reward.type === "regen" ? 10 : 1);
    let waterHealth = 0;
    let samuraiHealth = 0;
    let waterThreat = 0;
    let samuraiThreat = 0;
    let waterRewards = 0;
    let samuraiRewards = 0;
    const healthRatios: number[] = [];
    const damageRatios: number[] = [];
    const rewardRatios: number[] = [];

    for (const [archetype, waterKind, samuraiKind] of tracks) {
      const water = ENEMY_TYPES[waterKind];
      const samurai = ENEMY_TYPES[samuraiKind];
      const count = LATE_MAP_CLEAR_ARCHETYPE_COUNTS[archetype];
      healthRatios.push(samurai.hp / water.hp);
      damageRatios.push(samurai.damage / water.damage);
      rewardRatios.push(samurai.reward.amount / water.reward.amount);
      waterHealth += water.hp * count;
      samuraiHealth += samurai.hp * count;
      waterThreat += water.damage * water.attackSpeed * count;
      samuraiThreat += samurai.damage * samurai.attackSpeed * count;
      waterRewards += rewardPower(water.reward) * count;
      samuraiRewards += rewardPower(samurai.reward) * count;

      expect(samurai.reward.type).toBe(water.reward.type);
      expect(samurai.attackSpeed).toBe(SAMURAI_GARDEN_ARCHETYPE_PROFILE[archetype].attackSpeed);
    }

    expect(samuraiHealth / waterHealth).toBeCloseTo(
      SAMURAI_GARDEN_HEALTH_SCALE * SAMURAI_GARDEN_ENCOUNTER_CADENCE_SCALE / WATER_REACH_ENCOUNTER_HEALTH_SCALE,
      10,
    );
    expect(samuraiThreat / waterThreat).toBeCloseTo(SAMURAI_GARDEN_DAMAGE_SCALE, 10);
    expect(samuraiRewards / waterRewards).toBeCloseTo(
      SAMURAI_GARDEN_REWARD_SCALE * SAMURAI_GARDEN_ENCOUNTER_CADENCE_SCALE * SAMURAI_GARDEN_OPEN_MAP_REWARD_MULTIPLIER / WATER_REACH_ENCOUNTER_REWARD_SCALE,
      10,
    );
    expect(new Set(healthRatios.map((ratio) => ratio.toFixed(3))).size).toBeGreaterThan(3);
    expect(new Set(damageRatios.map((ratio) => ratio.toFixed(3))).size).toBeGreaterThan(3);
    expect(new Set(rewardRatios.map((ratio) => ratio.toFixed(3))).size).toBeGreaterThan(3);
    const damages = tracks.map(([, , samuraiKind]) => ENEMY_TYPES[samuraiKind].damage);
    expect(Math.max(...damages) / Math.min(...damages)).toBeLessThan(1.71);
  });
});

describe("Crystal Hollows balance", () => {
  it("adds one macro step with compact clears and capped movement", () => {
    const tracks = [
      ["raider", "Fen Prowler", "Shard Hopper", 230],
      ["archer", "Glowcap Archer", "Crystal Spitter", 215],
      ["guardian", "Bog Colossus", "Geode Guardian", 205],
      ["reaper", "Moonmire Reaper", "Prism Reaver", 235],
      ["oracle", "Wisp Oracle", "Hollow Oracle", 220],
    ] as const;
    const totals = { previousHp: 0, hp: 0, previousThreat: 0, threat: 0, previousReward: 0, reward: 0 };
    for (const [archetype, previousKind, currentKind, speedCap] of tracks) {
      const previous = ENEMY_TYPES[previousKind];
      const current = ENEMY_TYPES[currentKind];
      const count = LATE_MAP_CLEAR_ARCHETYPE_COUNTS[archetype];
      const rewardWeight = current.reward.type === "armor" ? 3 : current.reward.type === "regen" ? 10 : 1;
      totals.previousHp += previous.hp * count;
      totals.hp += current.hp * count;
      totals.previousThreat += previous.damage * previous.attackSpeed * count;
      totals.threat += current.damage * current.attackSpeed * count;
      totals.previousReward += previous.reward.amount * rewardWeight * count;
      totals.reward += current.reward.amount * rewardWeight * count;
      expect(current.reward.type).toBe(previous.reward.type);
      expect(current.speed).toBeLessThanOrEqual(speedCap);
      if (current.elite) expect(current.aggro).toBe(340);
    }
    expect(totals.hp / totals.previousHp).toBeCloseTo(CRYSTAL_HOLLOWS_HEALTH_SCALE * CRYSTAL_HOLLOWS_ENCOUNTER_HEALTH_SCALE, 10);
    expect(totals.threat / totals.previousThreat).toBeCloseTo(CRYSTAL_HOLLOWS_DAMAGE_SCALE, 10);
    expect(totals.reward / totals.previousReward).toBeCloseTo(CRYSTAL_HOLLOWS_REWARD_SCALE * CRYSTAL_HOLLOWS_ENCOUNTER_REWARD_SCALE, 10);
  });
});

describe("enemy movement balance", () => {
  it("slows every Tutorial Forest regular enemy by 50 percent", () => {
    expect({
      Bramble: ENEMY_TYPES.Bramble.speed,
      Needle: ENEMY_TYPES.Needle.speed,
      Mossback: ENEMY_TYPES.Mossback.speed,
      Spitter: ENEMY_TYPES.Spitter.speed,
      Brood: ENEMY_TYPES.Brood.speed,
      Cindermaw: ENEMY_TYPES.Cindermaw.speed,
      "King Slime": ENEMY_TYPES["King Slime"].speed,
      "Dread Warden": ENEMY_TYPES["Dread Warden"].speed,
    }).toEqual({
      Bramble: 105,
      Needle: 105,
      Mossback: 105,
      Spitter: 105,
      Brood: 90,
      Cindermaw: 105,
      "King Slime": 95,
      "Dread Warden": 110,
    });
  });

  it("slows every Beginner Desert regular enemy by 25 percent", () => {
    expect({
      "Dune Raider": ENEMY_TYPES["Dune Raider"].speed,
      "Dune Archer": ENEMY_TYPES["Dune Archer"].speed,
      "Venom Guard": ENEMY_TYPES["Venom Guard"].speed,
      "Wastes Reaper": ENEMY_TYPES["Wastes Reaper"].speed,
      "Blight Oracle": ENEMY_TYPES["Blight Oracle"].speed,
    }).toEqual({
      "Dune Raider": 165,
      "Dune Archer": 153.75,
      "Venom Guard": 146.25,
      "Wastes Reaper": 168.75,
      "Blight Oracle": 157.5,
    });
  });

  it("keeps post-Snowlands movement and aggro at the Snowlands archetype values", () => {
    const tracks = [
      ["Frost Raider", "Ember Raider", "Depth Raider", "Tide Raider", "Sakura Ronin"],
      ["Glacier Archer", "Cinder Archer", "Abyss Archer", "Reef Archer", "Petal Archer"],
      ["Rime Guard", "Magma Guard", "Obsidian Colossus", "Coral Colossus", "Bamboo Guardian"],
      ["Whiteout Reaper", "Ash Reaper", "Doom Reaper", "Drowned Reaper", "Moonblade Reaper"],
      ["Aurora Oracle", "Inferno Oracle", "Nether Oracle", "Tidal Oracle", "Shrine Oracle"],
    ] as const;

    for (const [snowlandsKind, ...laterKinds] of tracks) {
      const snowlands = ENEMY_TYPES[snowlandsKind];
      for (const laterKind of laterKinds) {
        expect(ENEMY_TYPES[laterKind].speed).toBe(snowlands.speed);
        if (snowlands.elite) expect(ENEMY_TYPES[laterKind].aggro).toBe(snowlands.aggro);
      }
    }
  });
});

describe("enemy sprite loading", () => {
  it("uses all original families before adding distinct new families to the remaining maps", () => {
    expect(MAP_ENEMY_FAMILIES).toEqual({
      tutorial_forest: "slime-green", beginner_desert: "goblin", intermediate_snowlands: "skeleton",
      advanced_lava_wastes: "slime-orange", infernal_depths: "skeleton-poison", water_reach: "goblin-green",
      samurai_garden: "flower-tulip", cloudspire: "wingdemon-bee", moonfen: "fungus-rock", crystal_hollows: "hornrabbit-crystal",
    });
    expect(new Set(Object.values(MAP_ENEMY_FAMILIES)).size).toBe(10);
    const covered = new Set<string>();
    for (const [mapId, family] of Object.entries(MAP_ENEMY_FAMILIES)) {
      const kinds = new Set(mapSpawnCamps(mapId as MapId).flatMap((camp) => camp.types));
      for (const kind of kinds) {
        covered.add(kind);
        const definition = ENEMY_TYPES[kind];
        const sprite = ENEMY_SPRITE_LAYOUTS[kind];
        const bows = sprite.layers.filter((layer) => layer.src.endsWith("/bow.png"));
        expect(sprite.family).toBe(family);
        expect(sprite.size).toBe(definition.elite ? ELITE_ENEMY_SPRITE_SIZE : REGULAR_ENEMY_SPRITE_SIZE);
        expect(bows).toHaveLength(definition.ranged && !sprite.animation ? 1 : 0);
        if (family.startsWith("goblin")) expect(sprite.layers.find((layer) => layer.src.endsWith("/body.png"))?.src).toContain(
          `/goblin/${family === "goblin-green" ? "goblin_green" : "goblin"}/`,
        );
        if (family.startsWith("skeleton")) expect(sprite.layers.find((layer) => layer.src.endsWith("/head.png"))?.src).toContain(
          `/skull/${family === "skeleton-poison" ? "skull_poison" : "skull"}/`,
        );
        if (family.startsWith("slime")) expect(sprite.layers[0].src).toContain(`/enemies/${family}`);
        if (sprite.animation) expect(sprite.animation.pages.every((page) => page.src.includes(`/enemies/${family}/`))).toBe(true);
      }
    }
    expect([...covered].sort()).toEqual(Object.keys(ENEMY_TYPES).sort());
  });

  it("ships every referenced image and reuses the original stone/crowned slime art", () => {
    const paths = new Set(Object.values(ENEMY_SPRITE_LAYOUTS).flatMap(enemySpriteAssetSources));
    for (const path of paths) expect(existsSync(new URL(`../../public/${path}`, import.meta.url)), path).toBe(true);
    for (const color of ["green", "orange"]) for (const suffix of ["", "-stone", "-king"]) {
      expect(paths.has(`assets/wildstat/enemies/slime-${color}${suffix}.png`)).toBe(true);
    }
    for (const sprite of Object.values(ENEMY_SPRITE_LAYOUTS)) for (const layer of sprite.layers) {
      expect([layer.x, layer.y, layer.w, layer.h].every(Number.isFinite)).toBe(true);
      expect(layer.w).toBeGreaterThan(0); expect(layer.h).toBeGreaterThan(0);
    }
  });

  it("uses the new families' own attacks without attaching bows to ranged variants", () => {
    const kinds = ["Petal Archer", "Moonblade Reaper", "Nimbus Archer", "Thunder Reaper", "Glowcap Archer", "Crystal Spitter", "Moonmire Reaper", "Prism Reaver"] as const;
    for (const kind of kinds) {
      expect(ENEMY_TYPES[kind].ranged).toBe(true);
      expect(ENEMY_SPRITE_LAYOUTS[kind].layers).toEqual([]);
      expect(ENEMY_SPRITE_LAYOUTS[kind].animation?.animations.attack.frames.length).toBeGreaterThan(1);
    }
  });

  it("ships only idle/walk/attack WebP sheets with valid frames and a bounded texture budget", () => {
    const sprites = ["Sakura Ronin", "Gale Prowler", "Fen Prowler", "Shard Hopper"].map((kind) => ENEMY_SPRITE_LAYOUTS[kind]);
    for (const sprite of sprites) {
      let bytes = 0;
      const animation = sprite.animation!;
      expect(Object.keys(animation.animations).sort()).toEqual(["attack", "idle", "walk"]);
      expect(animation.pages.reduce((sum, page) => sum + page.width * page.height * 4, 0)).toBeLessThan(16 * 1024 * 1024);
      for (const page of animation.pages) {
        expect(page.src).toMatch(/\.webp$/);
        const file = new URL(`../../public/${page.src}`, import.meta.url);
        const buffer = readFileSync(file);
        bytes += statSync(file).size;
        expect(buffer.subarray(8, 12).toString()).toBe("WEBP");
        expect(buffer.subarray(12, 16).toString()).toBe("VP8X");
        expect(buffer.readUIntLE(24, 3) + 1).toBe(page.width);
        expect(buffer.readUIntLE(27, 3) + 1).toBe(page.height);
        expect(Math.max(page.width, page.height)).toBeLessThanOrEqual(2048);
      }
      for (const [key, clip] of Object.entries(animation.animations)) {
        expect(clip.loop).toBe(key !== "attack");
        expect(clip.frames.length).toBeGreaterThan(1);
        expect(clip.frameDurationMs * clip.frames.length).toBeCloseTo(clip.durationMs, 3);
        for (const frame of clip.frames) {
          const page = animation.pages[frame.page];
          expect(frame.x).toBeGreaterThanOrEqual(2); expect(frame.y).toBeGreaterThanOrEqual(2);
          expect(frame.x + frame.w).toBeLessThanOrEqual(page.width - 2);
          expect(frame.y + frame.h).toBeLessThanOrEqual(page.height - 2);
          expect([frame.w, frame.h]).toEqual([animation.frameWidth, animation.frameHeight]);
        }
      }
      // Assets are lazy per family; each additional map keeps the same budget.
      expect(bytes).toBeLessThan(256 * 1024);
    }
  });

  it("omits separate hand and arm layers from every layered bow enemy", () => {
    for (const sprite of Object.values(ENEMY_SPRITE_LAYOUTS)) {
      if (!("layers" in sprite) || !sprite.layers.some((layer) => layer.src.endsWith("/bow.png"))) continue;
      expect(sprite.layers.some((layer) => /\/(?:arm\d*|hand\d*)\.png$/.test(layer.src))).toBe(false);
    }
  });

  it("does not request an off-map enemy source until that map is prepared", async () => {
    const images: FakeImage[] = [];
    class FakeImage extends EventTarget {
      decoding = "auto";
      src = "";

      constructor() {
        super();
        images.push(this);
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const sources = {
      forestEnemy: { src: "forest-enemy.png", size: 40 },
      desertEnemy: { src: "desert-enemy.png", size: 40 },
    } satisfies Record<"forestEnemy" | "desertEnemy", EnemySpriteSource>;
    const assets = createMapScopedEnemySpriteAssets(sources, {
      forest: ["forestEnemy"],
      desert: ["desertEnemy"],
    });

    expect(images.map((image) => image.src)).toEqual(["", ""]);
    const forestReady = assets.ensureMapSprites("forest");
    expect(images.map((image) => image.src)).toEqual(["forest-enemy.png", ""]);
    images[0].dispatchEvent(new Event("load"));
    await forestReady;
    expect(assets.mapSpritesReady("forest")).toBe(true);
    expect(assets.mapSpriteLoadFailed("forest")).toBe(false);
    expect(assets.mapSpritesReady("desert")).toBe(false);

    const desertReady = assets.ensureMapSprites("desert");
    expect(images.map((image) => image.src)).toEqual(["forest-enemy.png", "desert-enemy.png"]);
    images[1].dispatchEvent(new Event("load"));
    await desertReady;
    expect(assets.mapSpritesReady("desert")).toBe(true);
  });

  it("shares animation pages between variants and only starts a family's images for its map", async () => {
    const images: FakeImage[] = [];
    class FakeImage extends EventTarget {
      decoding = "auto";
      src = "";
      constructor() { super(); images.push(this); }
    }
    vi.stubGlobal("Image", FakeImage);
    const groups = Object.fromEntries(Object.keys(MAP_ENEMY_FAMILIES).map((mapId) => [
      mapId, [...new Set(mapSpawnCamps(mapId as MapId).flatMap((camp) => camp.types))],
    ]));
    const assets = loadEnemySprites(groups);
    expect(images.every((image) => !image.src)).toBe(true);
    const forest = assets.ensureMapSprites("tutorial_forest");
    const forestPaths = new Set(groups.tutorial_forest.flatMap((kind) => enemySpriteAssetSources(ENEMY_SPRITE_LAYOUTS[kind])));
    expect(new Set(images.filter((image) => image.src).map((image) => image.src))).toEqual(forestPaths);
    images.filter((image) => image.src).forEach((image) => image.dispatchEvent(new Event("load")));
    await forest;
    expect(assets.mapSpritesReady("moonfen")).toBe(false);
    expect(assets.mapSpritesReady("crystal_hollows")).toBe(false);
    const moonfen = assets.ensureMapSprites("moonfen");
    const pages = images.filter((image) => image.src.includes("/fungus-rock/"));
    expect(pages).toHaveLength(3);
    expect(images.some((image) => image.src.includes("/flower-tulip/") || image.src.includes("/wingdemon-bee/"))).toBe(false);
    const normal = assets.sprites["Fen Prowler"].animation!;
    const elite = assets.sprites["Moonmire Reaper"].animation!;
    normal.pages.forEach((page, index) => expect(page.image).toBe(elite.pages[index].image));
    pages.slice(0, 2).forEach((image) => image.dispatchEvent(new Event("load")));
    expect(assets.mapSpritesReady("moonfen")).toBe(false);
    expect(assets.mapSpritesReady("crystal_hollows")).toBe(false);
    pages[2].dispatchEvent(new Event("load"));
    await moonfen;
    expect(assets.mapSpritesReady("moonfen")).toBe(true);
    expect(assets.mapSpriteLoadFailed("moonfen")).toBe(false);
    expect(images.some((image) => image.src.includes("/hornrabbit-crystal/"))).toBe(false);
    const crystalHollows = assets.ensureMapSprites("crystal_hollows");
    const crystalPages = images.filter((image) => image.src.includes("/hornrabbit-crystal/"));
    expect(crystalPages).toHaveLength(3);
    const crystalNormal = assets.sprites["Shard Hopper"].animation!;
    const crystalElite = assets.sprites["Prism Reaver"].animation!;
    crystalNormal.pages.forEach((page, index) => expect(page.image).toBe(crystalElite.pages[index].image));
    crystalPages.forEach((page) => page.dispatchEvent(new Event("load")));
    await crystalHollows;
    expect(assets.mapSpritesReady("crystal_hollows")).toBe(true);
    expect(assets.mapSpriteLoadFailed("crystal_hollows")).toBe(false);
  });

  it("waits for every enemy image, including a delayed layer", () => {
    const images: FakeImage[] = [];
    class FakeImage extends EventTarget {
      decoding = "auto";
      src = "";

      constructor() {
        super();
        images.push(this);
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const onSettled = vi.fn();
    const assets = loadEnemySprites({ all: Object.keys(ENEMY_TYPES) as EnemyKind[] }, onSettled);
    void assets.ensureMapSprites("all");

    expect(Object.keys(assets.sprites).sort()).toEqual(Object.keys(ENEMY_TYPES).sort());
    const paths = new Set(Object.values(ENEMY_SPRITE_LAYOUTS).flatMap(enemySpriteAssetSources));
    expect(images).toHaveLength(paths.size);
    expect(new Set(images.map((image) => image.src))).toEqual(paths);
    expect(assets.ready()).toBe(false);
    images.slice(0, -1).forEach((image) => image.dispatchEvent(new Event("load")));
    expect(assets.ready()).toBe(false);
    images.at(-1)?.dispatchEvent(new Event("load"));
    expect(assets.ready()).toBe(true);
    expect(onSettled).toHaveBeenCalledTimes(images.length);
  });

  it("unblocks after a failed image exhausts two cache-busting retries", () => {
    vi.useFakeTimers();
    const images: FakeImage[] = [];
    class FakeImage extends EventTarget {
      decoding = "auto";
      src = "";

      constructor() {
        super();
        images.push(this);
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const assets = loadEnemySprites({ all: Object.keys(ENEMY_TYPES) as EnemyKind[] });
    void assets.ensureMapSprites("all");
    const failedImage = images[0];
    images.slice(1).forEach((image) => image.dispatchEvent(new Event("load")));

    failedImage.dispatchEvent(new Event("error"));
    vi.advanceTimersByTime(500);
    expect(failedImage.src).toContain("?asset-retry=1");
    failedImage.dispatchEvent(new Event("error"));
    vi.advanceTimersByTime(1_000);
    expect(failedImage.src).toContain("?asset-retry=2");
    expect(assets.ready()).toBe(false);
    failedImage.dispatchEvent(new Event("error"));
    expect(assets.ready()).toBe(true);
    expect(assets.mapSpriteLoadFailed("all")).toBe(true);
  });
});
