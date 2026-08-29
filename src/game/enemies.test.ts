import { afterEach, describe, expect, it, vi } from "vitest";
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
import { ENEMY_TYPES, loadEnemySprites, rewardLabel } from "./enemies";
import {
  ELITE_ENEMY_SPRITE_SIZE,
  ENEMY_SPRITE_LAYOUTS,
  MAP_ENEMY_FAMILY_TINTS,
  REGULAR_ENEMY_SPRITE_SIZE,
} from "./enemy-sprite-layouts.mjs";

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
  it("uses one colored slime family per map, with bows for ranged enemies and larger elites", () => {
    const families = [
      [MAP_ENEMY_FAMILY_TINTS.tutorial_forest, ["Bramble", "Needle", "Mossback", "Spitter", "Brood", "Cindermaw", "King Slime", "Dread Warden"]],
      [MAP_ENEMY_FAMILY_TINTS.beginner_desert, ["Dune Raider", "Dune Archer", "Venom Guard", "Wastes Reaper", "Blight Oracle"]],
      [MAP_ENEMY_FAMILY_TINTS.intermediate_snowlands, ["Frost Raider", "Glacier Archer", "Rime Guard", "Whiteout Reaper", "Aurora Oracle"]],
      [MAP_ENEMY_FAMILY_TINTS.advanced_lava_wastes, ["Ember Raider", "Cinder Archer", "Magma Guard", "Ash Reaper", "Inferno Oracle"]],
      [MAP_ENEMY_FAMILY_TINTS.infernal_depths, ["Depth Raider", "Abyss Archer", "Obsidian Colossus", "Doom Reaper", "Nether Oracle"]],
      [MAP_ENEMY_FAMILY_TINTS.water_reach, ["Tide Raider", "Reef Archer", "Coral Colossus", "Drowned Reaper", "Tidal Oracle"]],
      [MAP_ENEMY_FAMILY_TINTS.samurai_garden, ["Sakura Ronin", "Petal Archer", "Bamboo Guardian", "Moonblade Reaper", "Shrine Oracle"]],
    ] as const;

    for (const [tint, kinds] of families) {
      const bodySources = new Set<string>();
      for (const kind of kinds) {
        const definition = ENEMY_TYPES[kind];
        const sprite = ENEMY_SPRITE_LAYOUTS[kind];
        const body = sprite.layers[0];
        const bows = sprite.layers.filter((layer) => layer.src.endsWith("/bow.png"));
        bodySources.add(body.src);
        expect(body.src).toBe("assets/wildwood/enemies/slime-green.png");
        expect(body.tint).toBe(tint ?? undefined);
        expect(sprite.size).toBe(definition.elite ? ELITE_ENEMY_SPRITE_SIZE : REGULAR_ENEMY_SPRITE_SIZE);
        expect(bows).toHaveLength(definition.ranged ? 1 : 0);
        expect(sprite.layers).toHaveLength(definition.ranged ? 2 : 1);
      }
      expect(bodySources.size).toBe(1);
    }
  });

  it("omits separate hand and arm layers from every layered bow enemy", () => {
    for (const sprite of Object.values(ENEMY_SPRITE_LAYOUTS)) {
      if (!("layers" in sprite) || !sprite.layers.some((layer) => layer.src.endsWith("/bow.png"))) continue;
      expect(sprite.layers.some((layer) => /\/(?:arm\d*|hand\d*)\.png$/.test(layer.src))).toBe(false);
    }
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
    const assets = loadEnemySprites(onSettled);

    expect(Object.keys(assets.sprites).sort()).toEqual(Object.keys(ENEMY_TYPES).sort());
    expect(images).toHaveLength(2);
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
    const assets = loadEnemySprites();
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
  });
});
