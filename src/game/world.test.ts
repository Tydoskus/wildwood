import { describe, expect, it } from "vitest";
import { GLOOMROOT_MAX_HP, KOI_SHOGUN_MAX_HP, LATE_MAP_CLEAR_ARCHETYPE_COUNTS, MAGMALISK_MAX_HP, MIREMAW_MAX_HP, PRISMSHELL_MAX_HP, TEMPEST_KIRIN_MAX_HP, TIDEWYRM_MAX_HP } from "../../shared/rules";
import { ENEMY_TYPES } from "./enemies";
import { createGameBootstrap } from "./runtime/game-bootstrap";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  MOONFEN_MAP_ID,
  CRYSTAL_HOLLOWS_MAP_ID,
  SAMURAI_GARDEN_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
  createSpawnSites,
  createWorldLayout,
} from "./world";

describe("Advanced Lava Lake", () => {
  it("builds a deterministic lava environment without overlapping rocks or ember dots", () => {
    const first = createWorldLayout({ x: 580, y: 770 }, ADVANCED_LAVA_WASTES_MAP_ID);
    const second = createWorldLayout({ x: 580, y: 770 }, ADVANCED_LAVA_WASTES_MAP_ID);

    expect(first).toEqual(second);
    expect(first.paths.length).toBeGreaterThanOrEqual(5);
    expect(first.decor.some((item) => item.type === "lavaPool")).toBe(true);
    expect(first.decor.some((item) => item.type === "lavaRock")).toBe(true);
    expect(first.decor.some((item) => item.type === "charredTree")).toBe(true);
    const rocks = first.decor.filter((item) => item.type === "lavaRock");
    expect(rocks).toHaveLength(72 * 7);
    let minimumGap = Number.POSITIVE_INFINITY;
    for (let left = 0; left < rocks.length; left += 1) {
      for (let right = left + 1; right < rocks.length; right += 1) {
        minimumGap = Math.min(
          minimumGap,
          Math.hypot(rocks[left].x - rocks[right].x, rocks[left].y - rocks[right].y) - 75 * (rocks[left].s + rocks[right].s),
        );
      }
    }
    expect(minimumGap).toBeGreaterThanOrEqual(0);
    expect(first.decor
      .filter((item) => item.type === "charredTree")
      .every((item) => item.variant === 0 || item.variant === 1)).toBe(true);
  });

  it("connects Magmalisk's Lava Lake portal to scaled Night Forest camps", () => {
    const config = createGameBootstrap().mapConfig;
    const sites = createSpawnSites({ x: 4050, y: 4050 }, INFERNAL_DEPTHS_MAP_ID);
    const layout = createWorldLayout({ x: 580, y: 770 }, INFERNAL_DEPTHS_MAP_ID);
    const infernalKinds = new Set(["Depth Raider", "Abyss Archer", "Obsidian Colossus", "Doom Reaper", "Nether Oracle"]);

    expect(config[ADVANCED_LAVA_WASTES_MAP_ID].secondaryPortal.destination).toBe(INFERNAL_DEPTHS_MAP_ID);
    expect(config[INFERNAL_DEPTHS_MAP_ID].portal.destination).toBe(ADVANCED_LAVA_WASTES_MAP_ID);
    expect(config[INFERNAL_DEPTHS_MAP_ID].name).toBe("Night Forest");
    expect(sites).toHaveLength(30);
    expect(sites.every((site) => infernalKinds.has(site.type))).toBe(true);
    expect(sites.every((site) => Math.hypot(site.x - 4050, site.y - 4050) >= 900)).toBe(true);
    expect(layout.decor.filter((item) => item.type === "tree")).toHaveLength(166);
    expect(layout.decor.some((item) => item.type === "charredTree" || item.type === "lavaPool" || item.type === "lavaRock" || item.type === "grass" || item.type === "petal")).toBe(false);
  });

  it("spawns only lava-tier enemies", () => {
    const sites = createSpawnSites({ x: 4050, y: 4050 }, ADVANCED_LAVA_WASTES_MAP_ID);
    const lavaKinds = new Set(["Ember Raider", "Cinder Archer", "Magma Guard", "Ash Reaper", "Inferno Oracle"]);

    expect(sites).toHaveLength(30);
    expect(sites.every((site) => lavaKinds.has(site.type))).toBe(true);
    expect(sites.every((site) => Math.hypot(site.x - 4050, site.y - 4050) >= 900 - .001)).toBe(true);
  });

  it("uses Title Case map names and connects Snowlands with Lava Lake", () => {
    const config = createGameBootstrap().mapConfig;

    expect(config[TUTORIAL_FOREST_MAP_ID].name).toBe("Tutorial Forest");
    expect(config[BEGINNER_DESERT_MAP_ID].name).toBe("Beginner Desert");
    expect(config[INTERMEDIATE_SNOWLANDS_MAP_ID].name).toBe("Intermediate Snowlands");
    expect(config[ADVANCED_LAVA_WASTES_MAP_ID].name).toBe("Advanced Lava Lake");
    expect(config[INTERMEDIATE_SNOWLANDS_MAP_ID].secondaryPortal.destination).toBe(ADVANCED_LAVA_WASTES_MAP_ID);
    expect(config[ADVANCED_LAVA_WASTES_MAP_ID].portal.destination).toBe(INTERMEDIATE_SNOWLANDS_MAP_ID);
    expect(createGameBootstrap().magmaliskBoss).toMatchObject({ x: 4050, y: 4050, r: 165, maxHp: MAGMALISK_MAX_HP });
  });

  it("connects Gloomroot's Night Forest gate to deterministic Water Reach camps", () => {
    const bootstrap = createGameBootstrap();
    const sites = createSpawnSites(bootstrap.gloomrootBoss, WATER_REACH_MAP_ID);
    const first = createWorldLayout(bootstrap.mapConfig[WATER_REACH_MAP_ID].arrival, WATER_REACH_MAP_ID);
    const second = createWorldLayout(bootstrap.mapConfig[WATER_REACH_MAP_ID].arrival, WATER_REACH_MAP_ID);
    const waterKinds = new Set(["Tide Raider", "Reef Archer", "Coral Colossus", "Drowned Reaper", "Tidal Oracle"]);

    expect(bootstrap.mapConfig[INFERNAL_DEPTHS_MAP_ID].secondaryPortal.destination).toBe(WATER_REACH_MAP_ID);
    expect(bootstrap.mapConfig[WATER_REACH_MAP_ID].portal.destination).toBe(INFERNAL_DEPTHS_MAP_ID);
    expect(bootstrap.mapConfig[WATER_REACH_MAP_ID].name).toBe("Water Reach");
    expect(bootstrap.gloomrootBoss).toMatchObject({ x: 4050, y: 4050, r: 175, maxHp: GLOOMROOT_MAX_HP });
    expect(bootstrap.tidewyrmBoss).toMatchObject({ x: 4050, y: 4050, r: 175, maxHp: TIDEWYRM_MAX_HP });
    expect(sites).toHaveLength(30);
    expect(sites.every((site) => waterKinds.has(site.type))).toBe(true);
    expect(sites.every((site) => Math.hypot(site.x - 4050, site.y - 4050) >= 900)).toBe(true);
    expect(first).toEqual(second);
    expect(first.decor.some((item) => item.type === "coral")).toBe(true);
    expect(first.decor.some((item) => item.type === "shell")).toBe(true);
    expect(first.decor
      .filter((item) => item.type === "coral" || item.type === "shell")
      .every((item) => Math.hypot(item.x - 4050, item.y - 4050) >= 680)).toBe(true);
    expect(first.paths.some((path) => 4050 >= path.x && 4050 <= path.x + path.w && 4050 >= path.y && 4050 <= path.y + path.h)).toBe(true);
  });

  it("connects Water Reach to a deterministic Samurai Garden", () => {
    const bootstrap = createGameBootstrap();
    const sites = createSpawnSites({ x: 4050, y: 4050 }, SAMURAI_GARDEN_MAP_ID);
    const first = createWorldLayout({ x: 580, y: 770 }, SAMURAI_GARDEN_MAP_ID);
    const second = createWorldLayout({ x: 580, y: 770 }, SAMURAI_GARDEN_MAP_ID);
    const samuraiKinds = new Set(["Sakura Ronin", "Petal Archer", "Bamboo Guardian", "Moonblade Reaper", "Shrine Oracle"]);

    expect(bootstrap.mapConfig[WATER_REACH_MAP_ID].secondaryPortal.destination).toBe(SAMURAI_GARDEN_MAP_ID);
    expect(bootstrap.mapConfig[SAMURAI_GARDEN_MAP_ID].portal.destination).toBe(WATER_REACH_MAP_ID);
    expect(bootstrap.mapConfig[SAMURAI_GARDEN_MAP_ID].name).toBe("Samurai Garden");
    expect(bootstrap.koiShogunBoss).toMatchObject({ x: 4050, y: 4050, r: 175, maxHp: KOI_SHOGUN_MAX_HP });
    expect(sites).toHaveLength(30);
    expect(sites.every((site) => samuraiKinds.has(site.type))).toBe(true);
    expect(sites.every((site) => Math.hypot(site.x - 4050, site.y - 4050) >= 900)).toBe(true);
    expect(first).toEqual(second);
    expect(first.paths.length).toBeGreaterThanOrEqual(10);
    expect(first.decor.filter((item) => item.type === "tree")).toHaveLength(148);
    expect(first.decor.some((item) => item.type === "cherryPetal")).toBe(true);
  });

  it("connects Samurai Garden to deterministic Cloudspire camps and its Tempest Kirin", () => {
    const bootstrap = createGameBootstrap();
    const sites = createSpawnSites(bootstrap.tempestKirinBoss, CLOUDSPIRE_MAP_ID);
    const first = createWorldLayout(bootstrap.mapConfig[CLOUDSPIRE_MAP_ID].arrival, CLOUDSPIRE_MAP_ID);
    const second = createWorldLayout(bootstrap.mapConfig[CLOUDSPIRE_MAP_ID].arrival, CLOUDSPIRE_MAP_ID);
    const cloudspireKinds = new Set(["Gale Prowler", "Nimbus Archer", "Skyguard Colossus", "Thunder Reaper", "Tempest Oracle"]);

    expect(bootstrap.mapConfig[SAMURAI_GARDEN_MAP_ID].secondaryPortal.destination).toBe(CLOUDSPIRE_MAP_ID);
    expect(bootstrap.mapConfig[CLOUDSPIRE_MAP_ID].portal.destination).toBe(SAMURAI_GARDEN_MAP_ID);
    expect(bootstrap.mapConfig[CLOUDSPIRE_MAP_ID].name).toBe("Cloudspire");
    expect(bootstrap.tempestKirinBoss).toMatchObject({ x: 4050, y: 4050, r: 180, maxHp: TEMPEST_KIRIN_MAX_HP });
    expect(sites).toHaveLength(30);
    expect(sites.every((site) => cloudspireKinds.has(site.type))).toBe(true);
    expect(sites.every((site) => Math.hypot(site.x - 4050, site.y - 4050) >= 900)).toBe(true);
    expect(first).toEqual(second);
    expect(first.paths).toHaveLength(0);
    expect(first.decor.some((item) => item.type === "cloud")).toBe(true);
    expect(first.decor.some((item) => item.type === "skyShard")).toBe(true);
  });

  it("connects Cloudspire to deterministic Moonfen camps and Miremaw", () => {
    const bootstrap = createGameBootstrap();
    const sites = createSpawnSites(bootstrap.miremawBoss, MOONFEN_MAP_ID);
    const first = createWorldLayout(bootstrap.mapConfig[MOONFEN_MAP_ID].arrival, MOONFEN_MAP_ID);
    const second = createWorldLayout(bootstrap.mapConfig[MOONFEN_MAP_ID].arrival, MOONFEN_MAP_ID);
    const moonfenKinds = new Set(["Fen Prowler", "Glowcap Archer", "Bog Colossus", "Moonmire Reaper", "Wisp Oracle"]);

    expect(bootstrap.mapConfig[CLOUDSPIRE_MAP_ID].secondaryPortal.destination).toBe(MOONFEN_MAP_ID);
    expect(bootstrap.mapConfig[MOONFEN_MAP_ID].portal.destination).toBe(CLOUDSPIRE_MAP_ID);
    expect(bootstrap.mapConfig[MOONFEN_MAP_ID].name).toBe("Moonfen");
    expect(bootstrap.miremawBoss).toMatchObject({ x: 4050, y: 4050, r: 170, maxHp: MIREMAW_MAX_HP });
    expect(sites).toHaveLength(30);
    expect(sites.every((site) => moonfenKinds.has(site.type))).toBe(true);
    expect(sites.every((site) => Math.hypot(site.x - 4050, site.y - 4050) >= 900)).toBe(true);
    expect(first).toEqual(second);
    expect(first.paths.length).toBeGreaterThanOrEqual(9);
    expect(first.decor.some((item) => item.type === "glowMushroom")).toBe(true);
    expect(first.decor.some((item) => item.type === "lilyPad")).toBe(true);
  });

  it("connects Moonfen to a complete, deterministic Crystal Hollows with a clear boss chamber", () => {
    const bootstrap = createGameBootstrap();
    const map = bootstrap.mapConfig[CRYSTAL_HOLLOWS_MAP_ID];
    const layout = createWorldLayout(map.arrival, CRYSTAL_HOLLOWS_MAP_ID);
    const sites = createSpawnSites(bootstrap.prismshellBoss, CRYSTAL_HOLLOWS_MAP_ID);
    const kinds = new Set(["Shard Hopper", "Crystal Spitter", "Geode Guardian", "Prism Reaver", "Hollow Oracle"]);
    expect(bootstrap.mapConfig[MOONFEN_MAP_ID].secondaryPortal.destination).toBe(CRYSTAL_HOLLOWS_MAP_ID);
    expect(map.portal.destination).toBe(MOONFEN_MAP_ID);
    expect(map.name).toBe("Crystal Hollows");
    expect(bootstrap.prismshellBoss).toMatchObject({ x: 4050, y: 4050, r: 170, maxHp: PRISMSHELL_MAX_HP });
    expect(layout).toEqual(createWorldLayout(map.arrival, CRYSTAL_HOLLOWS_MAP_ID));
    expect(layout.paths).not.toEqual(createWorldLayout(map.arrival, MOONFEN_MAP_ID).paths);
    expect(sites).toHaveLength(30);
    expect(sites.every((site) => kinds.has(site.type))).toBe(true);
    expect(sites.every((site) => Math.hypot(site.x - 4050, site.y - 4050) >= 900)).toBe(true);
    expect(layout.decor.filter((decor) => decor.type === "skyShard").length).toBeGreaterThan(100);
    expect(layout.decor.every((decor) => decor.type === "skyShard" || decor.type === "rock")).toBe(true);
    expect(layout.decor.every((decor) => Math.hypot(decor.x - map.arrival.x, decor.y - map.arrival.y) > 300)).toBe(true);
    expect(layout.decor.every((decor) => Math.hypot(decor.x - 4050, decor.y - 4050) > 680)).toBe(true);
    expect(layout.decor.every((decor) => decor.x > 0 && decor.x < 4800 && decor.y > 0 && decor.y < 4800)).toBe(true);
    // Every walkway rectangle must be reachable through overlapping paths.
    const connected = new Set([0]);
    for (let pass = 0; pass < layout.paths.length; pass += 1) {
      layout.paths.forEach((path, index) => {
        if ([...connected].some((otherIndex) => {
          const other = layout.paths[otherIndex];
          return path.x < other.x + other.w && path.x + path.w > other.x &&
            path.y < other.y + other.h && path.y + path.h > other.y;
        })) connected.add(index);
      });
    }
    expect(connected.size).toBe(layout.paths.length);
  });

  it("uses distinct late-map geometry and reward-pure camps without changing family totals", () => {
    const boss = { x: 4050, y: 4050 };
    const lavaSites = createSpawnSites(boss, ADVANCED_LAVA_WASTES_MAP_ID);
    const lateMaps = [
      {
        sites: createSpawnSites(boss, INFERNAL_DEPTHS_MAP_ID),
        kinds: ["Depth Raider", "Abyss Archer", "Obsidian Colossus", "Doom Reaper", "Nether Oracle"],
      },
      {
        sites: createSpawnSites(boss, WATER_REACH_MAP_ID),
        kinds: ["Tide Raider", "Reef Archer", "Coral Colossus", "Drowned Reaper", "Tidal Oracle"],
      },
      {
        sites: createSpawnSites(boss, SAMURAI_GARDEN_MAP_ID),
        kinds: ["Sakura Ronin", "Petal Archer", "Bamboo Guardian", "Moonblade Reaper", "Shrine Oracle"],
      },
      {
        sites: createSpawnSites(boss, CLOUDSPIRE_MAP_ID),
        kinds: ["Gale Prowler", "Nimbus Archer", "Skyguard Colossus", "Thunder Reaper", "Tempest Oracle"],
      },
      {
        sites: createSpawnSites(boss, MOONFEN_MAP_ID),
        kinds: ["Fen Prowler", "Glowcap Archer", "Bog Colossus", "Moonmire Reaper", "Wisp Oracle"],
      },
      {
        sites: createSpawnSites(boss, CRYSTAL_HOLLOWS_MAP_ID),
        kinds: ["Shard Hopper", "Crystal Spitter", "Geode Guardian", "Prism Reaver", "Hollow Oracle"],
      },
    ] as const;
    const positionSignature = (sites: typeof lavaSites) => sites
      .map((site) => `${site.x.toFixed(2)},${site.y.toFixed(2)}`)
      .join("|");
    const signatures = [positionSignature(lavaSites), ...lateMaps.map(({ sites }) => positionSignature(sites))];

    expect(new Set(signatures).size).toBe(signatures.length);
    for (const { sites, kinds } of lateMaps) {
      const expectedCounts = Object.values(LATE_MAP_CLEAR_ARCHETYPE_COUNTS);
      expect(kinds.map((kind) => sites.filter((site) => site.type === kind).length)).toEqual(expectedCounts);
      const campKinds = new Map<string, Set<string>>();
      for (const site of sites) {
        const kindsAtCamp = campKinds.get(site.campName) ?? new Set<string>();
        kindsAtCamp.add(site.type);
        campKinds.set(site.campName, kindsAtCamp);
      }
      for (const types of campKinds.values()) {
        const rewards = new Set([...types].map((type) => ENEMY_TYPES[type as keyof typeof ENEMY_TYPES].reward.type));
        expect(rewards.size).toBe(1);
      }
    }
  });

  it("keeps every map's camps separated and every individual camp on one reward track", () => {
    const boss = { x: 4050, y: 4050 };
    const mapIds = [
      TUTORIAL_FOREST_MAP_ID,
      BEGINNER_DESERT_MAP_ID,
      INTERMEDIATE_SNOWLANDS_MAP_ID,
      ADVANCED_LAVA_WASTES_MAP_ID,
      INFERNAL_DEPTHS_MAP_ID,
      WATER_REACH_MAP_ID,
      SAMURAI_GARDEN_MAP_ID,
      CLOUDSPIRE_MAP_ID,
      MOONFEN_MAP_ID,
      CRYSTAL_HOLLOWS_MAP_ID,
    ] as const;

    for (const mapId of mapIds) {
      const sites = createSpawnSites(boss, mapId);
      const camps = new Map<string, typeof sites>();
      for (const site of sites) {
        const camp = camps.get(site.campName);
        if (camp) camp.push(site);
        else camps.set(site.campName, [site]);
      }
      for (const camp of camps.values()) {
        expect(new Set(camp.map((site) => ENEMY_TYPES[site.type].reward.type)).size).toBe(1);
      }

      let closestCampPair = Number.POSITIVE_INFINITY;
      let closestCampmatePair = Number.POSITIVE_INFINITY;
      for (let left = 0; left < sites.length; left += 1) {
        for (let right = left + 1; right < sites.length; right += 1) {
          const distance = Math.hypot(sites[left].x - sites[right].x, sites[left].y - sites[right].y);
          if (sites[left].campName === sites[right].campName) {
            closestCampmatePair = Math.min(closestCampmatePair, distance);
          } else {
            closestCampPair = Math.min(closestCampPair, distance);
          }
        }
      }
      expect(closestCampmatePair).toBeGreaterThanOrEqual(70);
      expect(closestCampPair).toBeGreaterThanOrEqual(160);
    }
  });
});

describe("Intermediate Snowlands", () => {
  it("places one labeled upgrade bench beside the portal approach", () => {
    const layout = createWorldLayout({ x: 580, y: 770 }, INTERMEDIATE_SNOWLANDS_MAP_ID);
    const benches = layout.decor.filter((item) => item.type === "upgradeBench");

    expect(benches).toEqual([
      { type: "upgradeBench", x: 800, y: 710, s: 1, label: "Upgrade Bench" },
    ]);
  });
});
