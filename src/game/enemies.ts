import { formatCompactNumber } from "../ui/number-format";
import { CURRENT_ROLE_LANES, laneCombatValue, laneRewardValue,
  desertLaneCombatValue, desertLaneRewardValue, type ForestProgressionLane,
} from "../../shared/progression";
import { ENEMY_BOW_AIM_OFFSET_RADIANS, ENEMY_SPRITE_LAYOUTS, type EnemySpriteAnimationLayout } from "./enemy-sprite-layouts.mjs";

export { ENEMY_BOW_AIM_OFFSET_RADIANS };

export type RewardType = "damage" | "health" | "speed" | "armor" | "regen";

export type EnemyDefinition = {
  hp: number;
  speed: number;
  damage: number;
  attackSpeed: number; // Attacks per second.
  r: number;
  color: string;
  outline: string;
  reward: { type: RewardType; amount: number };
  aggro?: number;
  ranged?: boolean;
  elite?: boolean;
};

type PostForestRole = keyof typeof CURRENT_ROLE_LANES;

/**
 * Forest is authored independently. Campaign enemies select a role and fixed
 * tier reference; encounter targets generate their HP, danger, and rewards.
 */
function forestLaneBalance(lane: ForestProgressionLane): Pick<EnemyDefinition, "hp" | "damage" | "reward"> {
  return {
    ...laneCombatValue(lane, 0),
    reward: laneRewardValue(lane, 0),
  };
}

function postForestLaneBalance(role: PostForestRole, mapIndex: number): Pick<EnemyDefinition, "hp" | "damage" | "reward"> {
  const lane = CURRENT_ROLE_LANES[role];
  return {
    ...desertLaneCombatValue(lane, mapIndex - 1),
    reward: desertLaneRewardValue(lane, mapIndex - 1),
  };
}

function healthEliteBalance(mapIndex: number): Pick<EnemyDefinition, "hp" | "damage" | "reward"> {
  return {
    ...desertLaneCombatValue("King Slime", mapIndex - 1),
    reward: desertLaneRewardValue("King Slime", mapIndex - 1),
  };
}

const enemyTypes = {
  // TUTORIAL FOREST ENEMIES
  Bramble: {
    speed: 105, attackSpeed: 1, r: 14,
    color: "#d95738", outline: "#5c1b13",
    ...forestLaneBalance("Bramble"),
  },
  Needle: {
    speed: 105, attackSpeed: 1, r: 10,
    color: "#ffd34d", outline: "#6f4a12",
    ...forestLaneBalance("Needle"),
  },
  Mossback: {
    speed: 105, attackSpeed: 1, r: 22,
    color: "#768d51", outline: "#2c3b20",
    ...forestLaneBalance("Mossback"),
  },
  Spitter: {
    speed: 105, attackSpeed: 1, r: 15,
    color: "#b16ac8", outline: "#4b235d",
    ...forestLaneBalance("Spitter"),
  },
  Brood: {
    speed: 90, attackSpeed: .69, r: 16,
    color: "#45b6c2", outline: "#174a54", ranged: true,
    ...forestLaneBalance("Brood"),
  },
  Cindermaw: {
    speed: 105, attackSpeed: 1, r: 19,
    color: "#d95738", outline: "#5c1b13",
    ...forestLaneBalance("Cindermaw"),
  },
  "King Slime": {
    speed: 95, attackSpeed: 1, r: 27,
    color: "#70a94f", outline: "#2d5127",
    elite: true, aggro: 300,
    ...forestLaneBalance("King Slime"),
  },
  "Dread Warden": {
    speed: 110, attackSpeed: 1, r: 36,
    color: "#a52e3a", outline: "#47101a",
    elite: true, aggro: 340,
    ...forestLaneBalance("Dread Warden"),
  },

  // BEGINNER DESERT ENEMIES
  "Dune Raider": {
    speed: 165, attackSpeed: .65, r: 19,
    color: "#d6a13a", outline: "#5f3c18",
    ...postForestLaneBalance("raider", 1),
  },
  "Dune Archer": {
    speed: 153.75, attackSpeed: .55, r: 17,
    color: "#d5b04d", outline: "#61481d",
    ranged: true,
    ...postForestLaneBalance("archer", 1),
  },
  "Dune Regent": {
    speed: 145, attackSpeed: .65, r: 29,
    color: "#e3c568", outline: "#61481d",
    elite: true, aggro: 310,
    ...healthEliteBalance(1),
  },
  "Venom Guard": {
    speed: 146.25, attackSpeed: .55, r: 24,
    color: "#79d18b", outline: "#285a37",
    ...postForestLaneBalance("guardian", 1),
  },
  "Wastes Reaper": {
    speed: 168.75, attackSpeed: .7, r: 31,
    color: "#8fe09a", outline: "#294f34",
    ranged: true, elite: true, aggro: 300,
    ...postForestLaneBalance("reaper", 1),
  },
  "Blight Oracle": {
    speed: 157.5, attackSpeed: .6, r: 29,
    color: "#a5df79", outline: "#345426",
    elite: true, aggro: 300,
    ...postForestLaneBalance("oracle", 1),
  },

  // INTERMEDIATE SNOWLANDS ENEMIES
  "Frost Raider": {
    speed: 230, attackSpeed: .65, r: 21,
    color: "#8fc7ea", outline: "#315778",
    ...postForestLaneBalance("raider", 2),
  },
  "Glacier Archer": {
    speed: 215, attackSpeed: .55, r: 19,
    color: "#b9e4f4", outline: "#3c6e87",
    ranged: true,
    ...postForestLaneBalance("archer", 2),
  },
  "Glacier Regent": {
    speed: 205, attackSpeed: .65, r: 32,
    color: "#d9f5ff", outline: "#3c6e87",
    elite: true, aggro: 340,
    ...healthEliteBalance(2),
  },
  "Rime Guard": {
    speed: 205, attackSpeed: .55, r: 27,
    color: "#80d8db", outline: "#23626d",
    ...postForestLaneBalance("guardian", 2),
  },
  "Whiteout Reaper": {
    speed: 235, attackSpeed: .7, r: 34,
    color: "#d3ecfb", outline: "#46677f",
    ranged: true, elite: true, aggro: 340,
    ...postForestLaneBalance("reaper", 2),
  },
  "Aurora Oracle": {
    speed: 220, attackSpeed: .6, r: 32,
    color: "#b5a7f0", outline: "#514783",
    elite: true, aggro: 340,
    ...postForestLaneBalance("oracle", 2),
  },

  // ADVANCED LAVA LAKE ENEMIES
  "Ember Raider": {
    speed: 230, attackSpeed: .65, r: 23,
    color: "#ff8a3d", outline: "#6d2418",
    ...postForestLaneBalance("raider", 3),
  },
  "Cinder Archer": {
    speed: 215, attackSpeed: .55, r: 21,
    color: "#ffb347", outline: "#71311c",
    ranged: true,
    ...postForestLaneBalance("archer", 3),
  },
  "Cinder Regent": {
    speed: 205, attackSpeed: .65, r: 35,
    color: "#ffd273", outline: "#71311c",
    elite: true, aggro: 340,
    ...healthEliteBalance(3),
  },
  "Magma Guard": {
    speed: 205, attackSpeed: .55, r: 30,
    color: "#e86132", outline: "#602016",
    ...postForestLaneBalance("guardian", 3),
  },
  "Ash Reaper": {
    speed: 235, attackSpeed: .7, r: 37,
    color: "#ed7042", outline: "#54221e",
    ranged: true, elite: true, aggro: 340,
    ...postForestLaneBalance("reaper", 3),
  },
  "Inferno Oracle": {
    speed: 220, attackSpeed: .6, r: 35,
    color: "#ffc34f", outline: "#6b2c1d",
    elite: true, aggro: 340,
    ...postForestLaneBalance("oracle", 3),
  },

  // NIGHT FOREST ENEMIES
  "Depth Raider": {
    speed: 230,
    attackSpeed: .65, r: 25,
    color: "#e75a35", outline: "#4a1717",
    ...postForestLaneBalance("raider", 4),
  },
  "Abyss Archer": {
    speed: 215,
    attackSpeed: .55, r: 23,
    color: "#ef7840", outline: "#50191a",
    ranged: true,
    ...postForestLaneBalance("archer", 4),
  },
  "Abyss Regent": {
    speed: 205, attackSpeed: .65, r: 38,
    color: "#f09a58", outline: "#50191a",
    elite: true, aggro: 340,
    ...healthEliteBalance(4),
  },
  "Obsidian Colossus": {
    speed: 205,
    attackSpeed: .55, r: 32,
    color: "#b83f32", outline: "#3c1115",
    ...postForestLaneBalance("guardian", 4),
  },
  "Doom Reaper": {
    speed: 235,
    attackSpeed: .7, r: 39,
    color: "#cc4938", outline: "#3b1318",
    ranged: true, elite: true, aggro: 340,
    ...postForestLaneBalance("reaper", 4),
  },
  "Nether Oracle": {
    speed: 220,
    attackSpeed: .6, r: 37,
    color: "#e7843f", outline: "#4d191a",
    elite: true, aggro: 340,
    ...postForestLaneBalance("oracle", 4),
  },

  // WATER REACH ENEMIES
  "Tide Raider": {
    attackSpeed: .65, speed: 230, r: 27,
    color: "#49c9d4", outline: "#123b58",
    ...postForestLaneBalance("raider", 5),
  },
  "Reef Archer": {
    attackSpeed: .65, speed: 215, r: 25,
    color: "#69dce3", outline: "#17465d",
    ranged: true,
    ...postForestLaneBalance("archer", 5),
  },
  "Reef Regent": {
    speed: 205, attackSpeed: .65, r: 41,
    color: "#8deaf0", outline: "#17465d",
    elite: true, aggro: 340,
    ...healthEliteBalance(5),
  },
  "Coral Colossus": {
    attackSpeed: .65, speed: 205, r: 35,
    color: "#ff7f83", outline: "#573049",
    ...postForestLaneBalance("guardian", 5),
  },
  "Drowned Reaper": {
    attackSpeed: .65, speed: 235, r: 42,
    color: "#3f93bd", outline: "#172c50",
    ranged: true, elite: true, aggro: 340,
    ...postForestLaneBalance("reaper", 5),
  },
  "Tidal Oracle": {
    attackSpeed: .65, speed: 220, r: 39,
    color: "#7e9ee9", outline: "#29315d",
    elite: true, aggro: 340,
    ...postForestLaneBalance("oracle", 5),
  },

  // SAMURAI GARDEN ENEMIES
  "Sakura Ronin": {
    attackSpeed: .65, speed: 230, r: 29,
    color: "#ef75aa", outline: "#54233f",
    ...postForestLaneBalance("raider", 6),
  },
  "Petal Archer": {
    attackSpeed: .65, speed: 215, r: 27,
    color: "#ff9fc7", outline: "#60304d",
    ranged: true,
    ...postForestLaneBalance("archer", 6),
  },
  "Petal Regent": {
    speed: 205, attackSpeed: .65, r: 43,
    color: "#ffc5df", outline: "#60304d",
    elite: true, aggro: 340,
    ...healthEliteBalance(6),
  },
  "Bamboo Guardian": {
    attackSpeed: .65, speed: 205, r: 37,
    color: "#7cad70", outline: "#294936",
    ...postForestLaneBalance("guardian", 6),
  },
  "Moonblade Reaper": {
    attackSpeed: .65, speed: 235, r: 44,
    color: "#8a70bd", outline: "#30264f",
    ranged: true, elite: true, aggro: 340,
    ...postForestLaneBalance("reaper", 6),
  },
  "Shrine Oracle": {
    attackSpeed: .65, speed: 220, r: 41,
    color: "#eeb1d4", outline: "#52334f",
    elite: true, aggro: 340,
    ...postForestLaneBalance("oracle", 6),
  },

  // CLOUDSPIRE ENEMIES
  "Gale Prowler": {
    attackSpeed: .65, speed: 230, r: 30,
    color: "#72c9f4", outline: "#203f68",
    ...postForestLaneBalance("raider", 7),
  },
  "Nimbus Archer": {
    attackSpeed: .65, speed: 215, r: 28,
    color: "#b9e8ff", outline: "#365a78",
    ranged: true,
    ...postForestLaneBalance("archer", 7),
  },
  "Nimbus Regent": {
    speed: 205, attackSpeed: .65, r: 45,
    color: "#d9f2ff", outline: "#365a78",
    elite: true, aggro: 340,
    ...healthEliteBalance(7),
  },
  "Skyguard Colossus": {
    attackSpeed: .65, speed: 205, r: 39,
    color: "#e8cb72", outline: "#5b4722",
    ...postForestLaneBalance("guardian", 7),
  },
  "Thunder Reaper": {
    attackSpeed: .65, speed: 235, r: 45,
    color: "#7184db", outline: "#29305d",
    ranged: true, elite: true, aggro: 340,
    ...postForestLaneBalance("reaper", 7),
  },
  "Tempest Oracle": {
    attackSpeed: .65, speed: 220, r: 42,
    color: "#cbbcf4", outline: "#44345f",
    elite: true, aggro: 340,
    ...postForestLaneBalance("oracle", 7),
  },

  // MOONFEN ENEMIES
  "Fen Prowler": {
    attackSpeed: .65, speed: 230, r: 31,
    color: "#4fd9ab", outline: "#173f3b",
    ...postForestLaneBalance("raider", 8),
  },
  "Glowcap Archer": {
    attackSpeed: .65, speed: 215, r: 29,
    color: "#a2f3d5", outline: "#2a514c",
    ranged: true,
    ...postForestLaneBalance("archer", 8),
  },
  "Glowcap Regent": {
    speed: 205, attackSpeed: .65, r: 46,
    color: "#c8ffe3", outline: "#2a514c",
    elite: true, aggro: 340,
    ...healthEliteBalance(8),
  },
  "Bog Colossus": {
    attackSpeed: .65, speed: 205, r: 40,
    color: "#7f9b66", outline: "#30402c",
    ...postForestLaneBalance("guardian", 8),
  },
  "Moonmire Reaper": {
    attackSpeed: .65, speed: 235, r: 46,
    color: "#9b72d0", outline: "#352653",
    ranged: true, elite: true, aggro: 340,
    ...postForestLaneBalance("reaper", 8),
  },
  "Wisp Oracle": {
    attackSpeed: .65, speed: 220, r: 43,
    color: "#72ead1", outline: "#24524e",
    elite: true, aggro: 340,
    ...postForestLaneBalance("oracle", 8),
  },

  // CRYSTAL HOLLOWS ENEMIES
  "Shard Hopper": {
    attackSpeed: .65, speed: 230, r: 30,
    color: "#90e9ef", outline: "#303d5b",
    ...postForestLaneBalance("raider", 9),
  }, "Gear Prowler": {
    attackSpeed: .65, speed: 230, r: 30,
    color: "#90e9ef", outline: "#303d5b",
    ...postForestLaneBalance("raider", 10),
  }, "Gourd Prowler": {
    attackSpeed: .65, speed: 230, r: 30,
    color: "#90e9ef", outline: "#303d5b",
    ...postForestLaneBalance("raider", 11),
  },
  "Crystal Spitter": {
    attackSpeed: .65, speed: 215, r: 29,
    color: "#c9b0ff", outline: "#463762",
    ranged: true,
    ...postForestLaneBalance("archer", 9),
  }, "Rivet Spitter": {
    attackSpeed: .65, speed: 215, r: 29,
    color: "#c9b0ff", outline: "#463762",
    ranged: true,
    ...postForestLaneBalance("archer", 10),
  }, "Seed Spitter": {
    attackSpeed: .65, speed: 215, r: 29,
    color: "#c9b0ff", outline: "#463762",
    ranged: true,
    ...postForestLaneBalance("archer", 11),
  },
  "Crystal Regent": {
    speed: 202, attackSpeed: .65, r: 47,
    color: "#e2cdfd", outline: "#463762",
    elite: true, aggro: 340,
    ...healthEliteBalance(9),
  }, "Gear Regent": {
    speed: 202, attackSpeed: .65, r: 47,
    color: "#e2cdfd", outline: "#463762",
    elite: true, aggro: 340,
    ...healthEliteBalance(10),
  }, "Harvest Regent": {
    speed: 202, attackSpeed: .65, r: 47,
    color: "#e2cdfd", outline: "#463762",
    elite: true, aggro: 340,
    ...healthEliteBalance(11),
  },
  "Geode Guardian": {
    attackSpeed: .65, speed: 202, r: 40,
    color: "#8299c9", outline: "#303854",
    ...postForestLaneBalance("guardian", 9),
  }, "Iron Guardian": {
    attackSpeed: .65, speed: 202, r: 40,
    color: "#8299c9", outline: "#303854",
    ...postForestLaneBalance("guardian", 10),
  }, "Husk Guardian": {
    attackSpeed: .65, speed: 202, r: 40,
    color: "#8299c9", outline: "#303854",
    ...postForestLaneBalance("guardian", 11),
  },
  "Prism Reaver": {
    attackSpeed: .65, speed: 235, r: 46,
    color: "#ab87e6", outline: "#453365",
    ranged: true, elite: true, aggro: 340,
    ...postForestLaneBalance("reaper", 9),
  }, "Scrap Reaver": {
    attackSpeed: .65, speed: 235, r: 46,
    color: "#ab87e6", outline: "#453365",
    ranged: true, elite: true, aggro: 340,
    ...postForestLaneBalance("reaper", 10),
  }, "Thorn Reaver": {
    attackSpeed: .65, speed: 235, r: 46,
    color: "#ab87e6", outline: "#453365",
    ranged: true, elite: true, aggro: 340,
    ...postForestLaneBalance("reaper", 11),
  },
  "Hollow Oracle": {
    attackSpeed: .65, speed: 220, r: 43,
    color: "#f0c58b", outline: "#624862",
    elite: true, aggro: 340,
    ...postForestLaneBalance("oracle", 9),
  }, "Spark Oracle": {
    attackSpeed: .65, speed: 220, r: 43,
    color: "#f0c58b", outline: "#624862",
    elite: true, aggro: 340,
    ...postForestLaneBalance("oracle", 10),
  }, "Harvest Oracle": {
    attackSpeed: .65, speed: 220, r: 43,
    color: "#f0c58b", outline: "#624862",
    elite: true, aggro: 340,
    ...postForestLaneBalance("oracle", 11),
  },
} satisfies Record<string, EnemyDefinition>;

export type EnemyKind = keyof typeof enemyTypes;
export const ENEMY_TYPES: Record<EnemyKind, EnemyDefinition> = enemyTypes;

export type EnemyCamp = {
  name: string;
  x: number;
  y: number;
  minRadius: number;
  radius: number;
  count: number;
  types: EnemyKind[];
  ground: string;
  ring: string;
};

export type EnemySpriteLayerSource = {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Optional map-family recolor applied once when the layer is cached. */
  tint?: string;
  /** Actor-local point held by the archer. The layer rotates around it while aiming. */
  aimPivot?: { x: number; y: number };
  /** Rotation needed to make the source art face actor-local right. */
  aimOffsetRadians?: number;
};
export type EnemySpriteSource =
  | { src: string; size: number }
  | { size: number; height: number; layers: EnemySpriteLayerSource[]; animation?: EnemySpriteAnimationLayout };
export type LoadedSpriteLayer = EnemySpriteLayerSource & { image: HTMLImageElement };
export type LoadedEnemySprite = {
  size: number;
  height?: number;
  /** Display-only adjustment; collision and floating-label anchors stay put. */
  visualOffsetY?: number;
  image?: HTMLImageElement;
  layers?: LoadedSpriteLayer[];
  animation?: Omit<EnemySpriteAnimationLayout, "pages"> & {
    pages: (EnemySpriteAnimationLayout["pages"][number] & { image: HTMLImageElement })[];
  };
};

const ENEMY_SPRITE_SOURCES = ENEMY_SPRITE_LAYOUTS as Record<EnemyKind, EnemySpriteSource>;

export const REWARD_DATA: Record<RewardType, { color: string }> = {
  damage: { color: "#ff655a" },
  health: { color: "#66ed79" },
  speed: { color: "#ffe05d" },
  armor: { color: "#74d8ff" },
  regen: { color: "#ff7ccb" },
};

export const CAMPS: EnemyCamp[] = [
  // Every camp is one reward track. The health elites keep a separate late
  // destination instead of being folded into the fast starter-health route.
  { name: "Ember Fen", x: 850, y: 1450, minRadius: 230, radius: 420, count: 6, types: ["Bramble"], ground: "#5b3b28", ring: "#b66a37" },
  { name: "Thornshot Rise", x: 2300, y: 800, minRadius: 210, radius: 360, count: 5, types: ["Spitter"], ground: "#4b3545", ring: "#a86591" },
  { name: "Glass Thicket", x: 4000, y: 900, minRadius: 210, radius: 360, count: 5, types: ["Needle"], ground: "#244f53", ring: "#64bdc5" },
  { name: "Brine Marsh", x: 4150, y: 2300, minRadius: 220, radius: 380, count: 5, types: ["Brood"], ground: "#243e4d", ring: "#5f9eb5" },
  { name: "Mossfall Ruins", x: 850, y: 2850, minRadius: 230, radius: 400, count: 6, types: ["Mossback"], ground: "#33423a", ring: "#8d9b75" },
  { name: "Cinder Quarry", x: 2450, y: 2400, minRadius: 230, radius: 400, count: 6, types: ["Cindermaw", "Cindermaw", "Cindermaw", "Dread Warden"], ground: "#4b4039", ring: "#b5875c" },
  { name: "Moonroot Grove", x: 1150, y: 4200, minRadius: 200, radius: 360, count: 4, types: ["Mossback"], ground: "#3d3157", ring: "#9a79d5" },
  { name: "Sunken Yard", x: 2700, y: 4100, minRadius: 200, radius: 360, count: 4, types: ["Mossback"], ground: "#553334", ring: "#d37362" },
  { name: "Royal Hollow", x: 3750, y: 3550, minRadius: 150, radius: 260, count: 2, types: ["King Slime"], ground: "#405438", ring: "#82bc68" },
];

function loadEnemyImage(source: string, onSettled: () => void) {
  const image = new Image();
  image.decoding = "async";
  let retry = 0;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    onSettled();
  };
  image.addEventListener("load", settle, { once: true });
  image.addEventListener("error", () => {
    if (retry >= 2) {
      settle();
      return;
    }
    retry += 1;
    globalThis.setTimeout(() => {
      image.src = `${source}?asset-retry=${retry}`;
    }, retry * 500);
  });
  image.src = source;
  return image;
}

type LazyEnemyImageAsset = {
  image: HTMLImageElement;
  load: () => Promise<void>;
  failed: () => boolean;
  settled: () => boolean;
};

function createLazyEnemyImage(source: string, onSettled: () => void): LazyEnemyImageAsset {
  const image = new Image();
  image.decoding = "async";
  let retry = 0;
  let started = false;
  let didSettle = false;
  let didFail = false;
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  const settle = () => {
    if (didSettle) return;
    didSettle = true;
    onSettled();
    resolve();
  };
  image.addEventListener("load", settle, { once: true });
  image.addEventListener("error", () => {
    if (retry >= 2) {
      didFail = true;
      settle();
      return;
    }
    retry += 1;
    globalThis.setTimeout(() => {
      image.src = `${source}?asset-retry=${retry}`;
    }, retry * 500);
  });
  return {
    image,
    load: () => {
      if (!started) {
        started = true;
        image.src = source;
      }
      return promise;
    },
    failed: () => didFail,
    settled: () => didSettle,
  };
}

export function enemySpriteAssetSources(source: EnemySpriteSource) {
  return "layers" in source
    ? [...source.layers.map((layer) => layer.src), ...(source.animation?.pages.map((page) => page.src) ?? [])]
    : [source.src];
}

/**
 * Builds the renderer's complete sprite lookup without requesting every map's
 * files. A source receives its first `src` assignment only when one of the
 * maps that uses it is prepared.
 */
export function createMapScopedEnemySpriteAssets<Kind extends string, MapKey extends string>(
  spriteSources: Record<Kind, EnemySpriteSource>,
  enemyKindsByMap: Record<MapKey, readonly Kind[]>,
  onAssetSettled: () => void = () => {},
) {
  const uniqueAssetSources = [...new Set(Object.values<EnemySpriteSource>(spriteSources).flatMap(enemySpriteAssetSources))];
  const imageAssets = new Map(uniqueAssetSources.map((source) => [source, createLazyEnemyImage(source, onAssetSettled)]));
  const sprites = Object.fromEntries(Object.entries<EnemySpriteSource>(spriteSources).map(([kind, source]) => {
    if ("layers" in source) {
      const layers = source.layers.map((layer) => ({ ...layer, image: imageAssets.get(layer.src)!.image }));
      const animation = source.animation ? {
        ...source.animation,
        pages: source.animation.pages.map((page) => ({ ...page, image: imageAssets.get(page.src)!.image })),
      } : undefined;
      return [kind, { size: source.size, height: source.height, layers, ...(animation ? { animation } : {}) }];
    }
    return [kind, { size: source.size, image: imageAssets.get(source.src)!.image }];
  })) as Record<Kind, LoadedEnemySprite>;
  const assetsByMap = new Map(Object.entries<readonly Kind[]>(enemyKindsByMap).map(([mapId, kinds]) => {
    const mapSources = new Set<string>();
    for (const kind of kinds) {
      const source = spriteSources[kind];
      if (!source) throw new Error(`Missing enemy sprite layout for ${kind}.`);
      for (const assetSource of enemySpriteAssetSources(source)) mapSources.add(assetSource);
    }
    return [mapId as MapKey, [...mapSources].map((source) => imageAssets.get(source)!)];
  }));

  function mapAssets(mapId: MapKey) {
    const assets = assetsByMap.get(mapId);
    if (!assets) throw new Error(`Missing enemy sprite group for ${mapId}.`);
    return assets;
  }

  return {
    sprites,
    ensureMapSprites: (mapId: MapKey) => Promise.all(mapAssets(mapId).map((asset) => asset.load())).then(() => undefined),
    mapSpriteLoadFailed: (mapId: MapKey) => mapAssets(mapId).some((asset) => asset.failed()),
    mapSpritesReady: (mapId: MapKey) => mapAssets(mapId).every((asset) => asset.settled()),
    ready: () => [...imageAssets.values()].every((asset) => asset.settled()),
  };
}

export function loadEnemySprites<MapKey extends string>(
  enemyKindsByMap: Record<MapKey, readonly EnemyKind[]>,
  onAssetSettled: () => void = () => {},
) {
  return createMapScopedEnemySpriteAssets(ENEMY_SPRITE_SOURCES, enemyKindsByMap, onAssetSettled);
}

export function loadActorShadowSprite(onAssetSettled: () => void = () => {}) {
  return loadEnemyImage("assets/wildstat/2D Character - Casual Monsters/_PNG/slime/shadow.png", onAssetSettled);
}

export function rewardLabel(reward: EnemyDefinition["reward"]) {
  return `${rewardAmountLabel(reward)} ${rewardStatLabel(reward)}`;
}

export function rewardAmountLabel(reward: EnemyDefinition["reward"]) {
  if (reward.type === "speed") return `+${reward.amount.toFixed(2)}`;
  if (Math.abs(reward.amount) < 1_000 && !Number.isInteger(reward.amount)) return `+${reward.amount.toFixed(2)}`;
  return `+${formatCompactNumber(reward.amount)}`;
}

export function rewardStatLabel(reward: EnemyDefinition["reward"]) {
  if (reward.type === "damage") return "DAMAGE";
  if (reward.type === "health") return "MAX HEALTH";
  if (reward.type === "speed") return "ATK/SEC";
  if (reward.type === "armor") return "ARMOR";
  return "HP/SEC";
}
