import { afterEach, describe, expect, it, vi } from "vitest";
import { ENEMY_TYPES, loadEnemySprites, rewardLabel } from "./enemies";
import { ENEMY_SPRITE_LAYOUTS } from "./enemy-sprite-layouts.mjs";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("enemy reward rules", () => {
  it("keeps starter through Lava Lake reward values intentional", () => {
    expect(ENEMY_TYPES.Bramble.reward).toEqual({ type: "health", amount: 28 });
    expect(ENEMY_TYPES.Mossback.reward).toEqual({ type: "armor", amount: 5 });
    expect(ENEMY_TYPES["King Slime"].reward).toEqual({ type: "health", amount: 352 });
    expect(ENEMY_TYPES.Spitter.reward).toEqual({ type: "damage", amount: 1 });
    expect(ENEMY_TYPES["Dune Archer"].reward).toEqual({ type: "health", amount: 8_500 });
    expect(ENEMY_TYPES["Blight Oracle"].reward).toEqual({ type: "regen", amount: 320 });
    expect(ENEMY_TYPES["Frost Raider"].reward).toEqual({ type: "damage", amount: 240_000 });
    expect(ENEMY_TYPES["Frost Raider"].hp).toBe(2_700_000_000);
    expect(ENEMY_TYPES["Frost Raider"].damage).toBe(2_330_000);
    expect(ENEMY_TYPES["Glacier Archer"].hp).toBe(2_280_000_000);
    expect(ENEMY_TYPES["Whiteout Reaper"].reward).toEqual({ type: "damage", amount: 3_150_000 });
    expect(ENEMY_TYPES["Rime Guard"].reward).toEqual({ type: "armor", amount: 14_000 });
    expect(ENEMY_TYPES["Aurora Oracle"].reward).toEqual({ type: "regen", amount: 161_000 });
    expect(ENEMY_TYPES["Rime Guard"].hp).toBeGreaterThan(ENEMY_TYPES["Venom Guard"].hp);
    expect(ENEMY_TYPES["Ember Raider"]).toMatchObject({
      hp: 6_075_000_000_000,
      damage: 8_143_350_000,
      reward: { type: "damage", amount: 48_000_000 },
    });
    expect(ENEMY_TYPES["Cinder Archer"].hp).toBeGreaterThan(ENEMY_TYPES["Glacier Archer"].hp);
    expect(ENEMY_TYPES["Cinder Archer"].damage).toBe(149_187_000_000);
    expect(ENEMY_TYPES["Magma Guard"].damage).toBe(1_168_200_000_000);
    expect(ENEMY_TYPES["Ash Reaper"].damage).toBe(44_100_000_000);
    expect(ENEMY_TYPES["Inferno Oracle"].damage).toBe(613_470_000_000);
    expect(ENEMY_TYPES["Magma Guard"].reward).toEqual({ type: "armor", amount: 1_307_000 });
    expect(ENEMY_TYPES["Ash Reaper"].reward).toEqual({ type: "damage", amount: 1_984_500_000 });
    expect(ENEMY_TYPES["Inferno Oracle"].reward).toEqual({ type: "regen", amount: 81_003_125 });
    expect(ENEMY_TYPES["Depth Raider"].reward).toEqual({ type: "damage", amount: 19_200_000_000 });
    expect(ENEMY_TYPES["Abyss Archer"].reward.amount).toBeCloseTo(475_262_790_697.67444);
    expect(ENEMY_TYPES["Doom Reaper"].reward).toEqual({ type: "damage", amount: 2_500_470_000_000 });
  });

  it("formats reward labels without changing their numeric value", () => {
    expect(rewardLabel({ type: "speed", amount: .25 })).toBe("+0.25 ATK/SEC");
    expect(rewardLabel({ type: "damage", amount: 1.05 })).toBe("+1.05 DAMAGE");
    expect(rewardLabel({ type: "armor", amount: 150 })).toBe("+150 ARMOR");
    expect(rewardLabel({ type: "health", amount: 8_500 })).toBe("+8.50k MAX HEALTH");
    expect(rewardLabel({ type: "damage", amount: 240_000 })).toBe("+240k DAMAGE");
  });

  it("repeats each archetype's Snowlands-to-Lava multiplier and doubles Infernal damage and health rewards", () => {
    const tracks = [
      ["Frost Raider", "Ember Raider", "Depth Raider"],
      ["Glacier Archer", "Cinder Archer", "Abyss Archer"],
      ["Rime Guard", "Magma Guard", "Obsidian Colossus"],
      ["Whiteout Reaper", "Ash Reaper", "Doom Reaper"],
      ["Aurora Oracle", "Inferno Oracle", "Nether Oracle"],
    ] as const;
    for (const [snowKind, lavaKind, infernalKind] of tracks) {
      const snow = ENEMY_TYPES[snowKind];
      const lava = ENEMY_TYPES[lavaKind];
      const infernal = ENEMY_TYPES[infernalKind];
      expect(infernal.hp / lava.hp).toBeCloseTo(lava.hp / snow.hp, 8);
      expect(infernal.damage / lava.damage).toBeCloseTo(lava.damage / snow.damage, 8);
      const rewardBoost = infernal.reward.type === "damage" || infernal.reward.type === "health" ? 2 : 1;
      expect(infernal.reward.amount / lava.reward.amount).toBeCloseTo(lava.reward.amount / snow.reward.amount * rewardBoost, 8);
    }
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
});

describe("enemy sprite loading", () => {
  it("keeps the approved Dune Archer bow alignment without a separate hand layer", () => {
    const duneArcher = ENEMY_SPRITE_LAYOUTS["Dune Archer"];
    expect("layers" in duneArcher).toBe(true);
    if (!("layers" in duneArcher)) return;
    expect(duneArcher.layers.find((layer) => layer.src.endsWith("/bow.png"))).toMatchObject({
      x: -27,
      y: 0,
      w: 50,
      h: 30,
      aimPivot: { x: 0, y: 18 },
      aimOffsetRadians: 0,
    });
    expect(duneArcher.layers.some((layer) => layer.src.endsWith("/arm2.png"))).toBe(false);
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
