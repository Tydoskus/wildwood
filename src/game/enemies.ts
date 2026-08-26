import { formatCompactNumber } from "../ui/number-format";
import { ENEMY_BOW_AIM_OFFSET_RADIANS, ENEMY_SPRITE_LAYOUTS } from "./enemy-sprite-layouts.mjs";

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

function repeatTierMultiplier(previous: number, current: number) {
  return current * (current / previous);
}

const enemyTypes = {
  Bramble: {
    hp: 42, speed: 210, damage: 14, attackSpeed: 1, r: 14,
    color: "#d95738", outline: "#5c1b13", reward: { type: "health", amount: 28 },
  },
  Needle: {
    hp: 90, speed: 210, damage: 24, attackSpeed: 1, r: 10,
    color: "#ffd34d", outline: "#6f4a12", reward: { type: "speed", amount: .02 },
  },
  Mossback: {
    hp: 380, speed: 210, damage: 29, attackSpeed: 1, r: 22,
    color: "#768d51", outline: "#2c3b20", reward: { type: "armor", amount: 5 },
  },
  Spitter: {
    hp: 24, speed: 210, damage: 48, attackSpeed: 1, r: 15,
    color: "#b16ac8", outline: "#4b235d", reward: { type: "damage", amount: 1 },
  },
  Brood: {
    hp: 220, speed: 180, damage: 56, attackSpeed: .69, r: 16,
    color: "#45b6c2", outline: "#174a54", reward: { type: "regen", amount: .3 }, ranged: true,
  },
  Cindermaw: {
    hp: 360, speed: 210, damage: 86, attackSpeed: 1, r: 19,
    color: "#d95738", outline: "#5c1b13", reward: { type: "damage", amount: 6 },
  },
  "King Slime": {
    hp: 920, speed: 190, damage: 143, attackSpeed: 1, r: 27,
    color: "#70a94f", outline: "#2d5127", reward: { type: "health", amount: 352 },
    elite: true, aggro: 300,
  },
  "Dread Warden": {
    hp: 1000, speed: 220, damage: 275, attackSpeed: 1, r: 36,
    color: "#a52e3a", outline: "#47101a", reward: { type: "damage", amount: 83 },
    elite: true, aggro: 350,
  },

  // BEGINNER DESERT ENEMIES
  // Balance these values directly: hp, speed, damage, attackSpeed, and reward.
  "Dune Raider": {
    hp: 1_200_000, speed: 220, damage: 20_000, attackSpeed: .65, r: 19,
    color: "#d6a13a", outline: "#5f3c18", reward: { type: "damage", amount: 1200 },
  },
  "Dune Archer": {
    hp: 900_000, speed: 205, damage: 25_000, attackSpeed: .55, r: 17,
    color: "#d5b04d", outline: "#61481d", reward: { type: "health", amount: 8_500 },
    ranged: true,
  },
  "Venom Guard": {
    hp: 2_600_000, speed: 195, damage: 32_000, attackSpeed: .55, r: 24,
    color: "#79d18b", outline: "#285a37", reward: { type: "armor", amount: 150 },
  },
  "Wastes Reaper": {
    hp: 5_000_000, speed: 225, damage: 48_000, attackSpeed: .7, r: 31,
    color: "#8fe09a", outline: "#294f34", reward: { type: "damage", amount: 5_000 },
    ranged: true, elite: true, aggro: 300,
  },
  "Blight Oracle": {
    hp: 4_000_000, speed: 210, damage: 40_000, attackSpeed: .6, r: 29,
    color: "#a5df79", outline: "#345426", reward: { type: "regen", amount: 320 },
    elite: true, aggro: 300,
  },

  // INTERMEDIATE SNOWLANDS ENEMIES
  // Desert-to-snow uses the same archetype multipliers as forest-to-desert.
  "Frost Raider": {
    hp: 2_700_000_000, speed: 230, damage: 2_330_000, attackSpeed: .65, r: 21,
    color: "#8fc7ea", outline: "#315778", reward: { type: "damage", amount: 240_000 },
  },
  "Glacier Archer": {
    hp: 2_280_000_000, speed: 215, damage: 11_150_000, attackSpeed: .55, r: 19,
    color: "#b9e4f4", outline: "#3c6e87", reward: { type: "health", amount: 2_580_000 },
    ranged: true,
  },
  "Rime Guard": {
    hp: 17_790_000_000, speed: 205, damage: 35_300_000, attackSpeed: .55, r: 27,
    color: "#80d8db", outline: "#23626d", reward: { type: "armor", amount: 14_000 },
  },
  "Whiteout Reaper": {
    hp: 25_000_000_000, speed: 235, damage: 8_400_000, attackSpeed: .7, r: 34,
    color: "#d3ecfb", outline: "#46677f", reward: { type: "damage", amount: 3_150_000 },
    ranged: true, elite: true, aggro: 340,
  },
  "Aurora Oracle": {
    hp: 16_000_000_000, speed: 220, damage: 28_600_000, attackSpeed: .6, r: 32,
    color: "#b5a7f0", outline: "#514783", reward: { type: "regen", amount: 161_000 },
    elite: true, aggro: 340,
  },

  // ADVANCED LAVA LAKE ENEMIES
  // Snow-to-lava continues each archetype's desert-to-snow multiplier.
  // Damage is intentionally 30x the original Lava Lake launch tuning.
  "Ember Raider": {
    hp: 6_075_000_000_000, speed: 240, damage: 8_143_350_000, attackSpeed: .65, r: 23,
    color: "#ff8a3d", outline: "#6d2418", reward: { type: "damage", amount: 48_000_000 },
  },
  "Cinder Archer": {
    hp: 5_776_000_000_000, speed: 225, damage: 149_187_000_000, attackSpeed: .55, r: 21,
    color: "#ffb347", outline: "#71311c", reward: { type: "health", amount: 783_000_000 },
    ranged: true,
  },
  "Magma Guard": {
    hp: 121_725_000_000_000, speed: 215, damage: 1_168_200_000_000, attackSpeed: .55, r: 30,
    color: "#e86132", outline: "#602016", reward: { type: "armor", amount: 1_307_000 },
  },
  "Ash Reaper": {
    hp: 125_000_000_000_000, speed: 245, damage: 44_100_000_000, attackSpeed: .7, r: 37,
    color: "#ed7042", outline: "#54221e", reward: { type: "damage", amount: 1_984_500_000 },
    ranged: true, elite: true, aggro: 380,
  },
  "Inferno Oracle": {
    hp: 64_000_000_000_000, speed: 230, damage: 613_470_000_000, attackSpeed: .6, r: 35,
    color: "#ffc34f", outline: "#6b2c1d", reward: { type: "regen", amount: 81_003_125 },
    elite: true, aggro: 380,
  },

  // INFERNAL DEPTHS ENEMIES
  // Repeat each archetype's actual Snowlands-to-Lava multiplier, including
  // Lava Lake's deliberate damage tuning, instead of flattening the curve.
  "Depth Raider": {
    hp: repeatTierMultiplier(2_700_000_000, 6_075_000_000_000), speed: 250,
    damage: repeatTierMultiplier(2_330_000, 8_143_350_000), attackSpeed: .65, r: 25,
    color: "#e75a35", outline: "#4a1717", reward: { type: "damage", amount: repeatTierMultiplier(240_000, 48_000_000) },
  },
  "Abyss Archer": {
    hp: repeatTierMultiplier(2_280_000_000, 5_776_000_000_000), speed: 235,
    damage: repeatTierMultiplier(11_150_000, 149_187_000_000), attackSpeed: .55, r: 23,
    color: "#ef7840", outline: "#50191a", reward: { type: "health", amount: repeatTierMultiplier(2_580_000, 783_000_000) },
    ranged: true,
  },
  "Obsidian Colossus": {
    hp: repeatTierMultiplier(17_790_000_000, 121_725_000_000_000), speed: 225,
    damage: repeatTierMultiplier(35_300_000, 1_168_200_000_000), attackSpeed: .55, r: 32,
    color: "#b83f32", outline: "#3c1115", reward: { type: "armor", amount: repeatTierMultiplier(14_000, 1_307_000) },
  },
  "Doom Reaper": {
    hp: repeatTierMultiplier(25_000_000_000, 125_000_000_000_000), speed: 255,
    damage: repeatTierMultiplier(8_400_000, 44_100_000_000), attackSpeed: .7, r: 39,
    color: "#cc4938", outline: "#3b1318", reward: { type: "damage", amount: repeatTierMultiplier(3_150_000, 1_984_500_000) },
    ranged: true, elite: true, aggro: 420,
  },
  "Nether Oracle": {
    hp: repeatTierMultiplier(16_000_000_000, 64_000_000_000_000), speed: 240,
    damage: repeatTierMultiplier(28_600_000, 613_470_000_000), attackSpeed: .6, r: 37,
    color: "#e7843f", outline: "#4d191a", reward: { type: "regen", amount: repeatTierMultiplier(161_000, 81_003_125) },
    elite: true, aggro: 420,
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

type SpriteLayerSource = {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Actor-local point held by the archer. The layer rotates around it while aiming. */
  aimPivot?: { x: number; y: number };
  /** Rotation needed to make the source art face actor-local right. */
  aimOffsetRadians?: number;
};
type SpriteSource = { src: string; size: number } | { size: number; height: number; layers: SpriteLayerSource[] };
export type LoadedSpriteLayer = SpriteLayerSource & { image: HTMLImageElement };
export type LoadedEnemySprite = {
  size: number;
  height?: number;
  image?: HTMLImageElement;
  layers?: LoadedSpriteLayer[];
};

const ENEMY_SPRITE_SOURCES = ENEMY_SPRITE_LAYOUTS as Record<EnemyKind, SpriteSource>;

export const REWARD_DATA: Record<RewardType, { color: string }> = {
  damage: { color: "#ff655a" },
  health: { color: "#66ed79" },
  speed: { color: "#ffe05d" },
  armor: { color: "#74d8ff" },
  regen: { color: "#ff7ccb" },
};

export const CAMPS: EnemyCamp[] = [
  // Starter: exact +health and +1 damage camps near the top-left spawn.
  { name: "Ember Fen", x: 820, y: 1700, minRadius: 190, radius: 440, count: 6, types: ["Bramble"], ground: "#5b3b28", ring: "#b66a37" },
  { name: "Thornshot Rise", x: 1650, y: 820, minRadius: 190, radius: 440, count: 5, types: ["Spitter"], ground: "#4b3545", ring: "#a86591" },
  // Medium: attack-speed and regeneration camps across the top-right.
  { name: "Glass Thicket", x: 3300, y: 900, minRadius: 230, radius: 520, count: 5, types: ["Needle"], ground: "#244f53", ring: "#64bdc5" },
  { name: "Brine Marsh", x: 4050, y: 1700, minRadius: 230, radius: 520, count: 5, types: ["Brood"], ground: "#243e4d", ring: "#5f9eb5" },
  // Hard: armor enemies occupy the lower-left and late-game routes.
  { name: "Mossfall Ruins", x: 950, y: 3150, minRadius: 250, radius: 570, count: 6, types: ["Mossback"], ground: "#33423a", ring: "#8d9b75" },
  // Elite locations stay unchanged; regular camp members share one reward type.
  { name: "Cinder Quarry", x: 3830, y: 2790, minRadius: 280, radius: 610, count: 6, types: ["Cindermaw", "Cindermaw", "Cindermaw", "Dread Warden"], ground: "#4b4039", ring: "#b5875c" },
  { name: "Moonroot Grove", x: 1540, y: 4040, minRadius: 240, radius: 560, count: 5, types: ["Mossback", "Mossback", "King Slime"], ground: "#3d3157", ring: "#9a79d5" },
  { name: "Sunken Yard", x: 3590, y: 4100, minRadius: 240, radius: 560, count: 5, types: ["Mossback", "Mossback", "King Slime"], ground: "#553334", ring: "#d37362" },
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

export function loadEnemySprites(onAssetSettled: () => void = () => {}) {
  const expectedAssets = Object.values(ENEMY_SPRITE_SOURCES).reduce(
    (count, source) => count + ("layers" in source ? source.layers.length : 1),
    0,
  );
  let settledAssets = 0;
  const settleAsset = () => {
    settledAssets += 1;
    onAssetSettled();
  };
  const sprites = Object.fromEntries(Object.entries(ENEMY_SPRITE_SOURCES).map(([kind, source]) => {
    if ("layers" in source) {
      const layers = source.layers.map((layer) => ({ ...layer, image: loadEnemyImage(layer.src, settleAsset) }));
      return [kind, { size: source.size, height: source.height, layers }];
    }
    const image = loadEnemyImage(source.src, settleAsset);
    return [kind, { size: source.size, image }];
  })) as Record<EnemyKind, LoadedEnemySprite>;
  return {
    sprites,
    ready: () => settledAssets >= expectedAssets,
  };
}

export function loadActorShadowSprite(onAssetSettled: () => void = () => {}) {
  return loadEnemyImage("assets/wildwood/2D Character - Casual Monsters/_PNG/slime/shadow.png", onAssetSettled);
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
