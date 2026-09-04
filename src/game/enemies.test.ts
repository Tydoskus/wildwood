import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
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

describe("generated encounter economy", () => {
  it("keeps tutorial breakthroughs and reward labels readable", () => {
    expect(ENEMY_TYPES.Bramble.reward).toEqual({ type: "health", amount: 27 });
    expect(ENEMY_TYPES["King Slime"].reward).toEqual({ type: "health", amount: 50 });
    expect(rewardLabel({ type: "speed", amount: .25 })).toBe("+0.25 ATK/SEC");
    expect(rewardLabel({ type: "damage", amount: 1.05 })).toBe("+1.05 DAMAGE");
  });
  it("keeps every spawned encounter finite, rewarding, and within its role", () => {
    for (const enemy of Object.values(ENEMY_TYPES)) {
      for (const value of [enemy.hp, enemy.damage, enemy.attackSpeed, enemy.reward.amount]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
    const raider = ENEMY_TYPES["Dune Raider"], elite = ENEMY_TYPES["Wastes Reaper"];
    expect(elite.hp).toBeGreaterThan(raider.hp);
    expect(elite.reward.amount / elite.hp / (raider.reward.amount / raider.hp)).toBeLessThan(1.5);
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
