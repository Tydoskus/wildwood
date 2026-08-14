import { formatCompactNumber } from "../ui/number-format";

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

const enemyTypes = {
  Bramble: {
    hp: 42, speed: 210, damage: 14, attackSpeed: 1, r: 14,
    color: "#d95738", outline: "#5c1b13", reward: { type: "health", amount: 28 },
  },
  Needle: {
    hp: 90, speed: 210, damage: 24, attackSpeed: 1, r: 10,
    color: "#ffd34d", outline: "#6f4a12", reward: { type: "speed", amount: .01 },
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
    color: "#a5df79", outline: "#345426", reward: { type: "regen", amount: 220 },
    elite: true, aggro: 300,
  },

  // INTERMEDIATE SNOWLANDS ENEMIES
  // Desert-to-snow uses the same archetype multipliers as forest-to-desert.
  "Frost Raider": {
    hp: 4_000_000_000, speed: 230, damage: 2_330_000, attackSpeed: .65, r: 21,
    color: "#8fc7ea", outline: "#315778", reward: { type: "damage", amount: 240_000 },
  },
  "Glacier Archer": {
    hp: 3_680_000_000, speed: 215, damage: 11_150_000, attackSpeed: .55, r: 19,
    color: "#b9e4f4", outline: "#3c6e87", reward: { type: "health", amount: 2_580_000 },
    ranged: true,
  },
  "Rime Guard": {
    hp: 17_790_000_000, speed: 205, damage: 35_300_000, attackSpeed: .55, r: 27,
    color: "#80d8db", outline: "#23626d", reward: { type: "armor", amount: 4_500 },
  },
  "Whiteout Reaper": {
    hp: 25_000_000_000, speed: 235, damage: 8_400_000, attackSpeed: .7, r: 34,
    color: "#d3ecfb", outline: "#46677f", reward: { type: "damage", amount: 300_000 },
    ranged: true, elite: true, aggro: 340,
  },
  "Aurora Oracle": {
    hp: 16_000_000_000, speed: 220, damage: 28_600_000, attackSpeed: .6, r: 32,
    color: "#b5a7f0", outline: "#514783", reward: { type: "regen", amount: 161_000 },
    elite: true, aggro: 340,
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

type SpriteLayerSource = { src: string; x: number; y: number; w: number; h: number };
type SpriteSource = { src: string; size: number } | { size: number; height: number; layers: SpriteLayerSource[] };
export type LoadedSpriteLayer = SpriteLayerSource & { image: HTMLImageElement };
export type LoadedEnemySprite = {
  size: number;
  height?: number;
  image?: HTMLImageElement;
  layers?: LoadedSpriteLayer[];
};

const ENEMY_SPRITE_SOURCES: Record<EnemyKind, SpriteSource> = {
  Bramble: { src: "assets/wildwood/enemies/slime-green.png", size: 46 },
  Needle: { src: "assets/wildwood/enemies/slime-orange.png", size: 42 },
  Mossback: { src: "assets/wildwood/enemies/slime-green-stone.png", size: 62 },
  Spitter: { src: "assets/wildwood/enemies/slime-orange.png", size: 50 },
  Brood: {
    size: 64,
    height: 70,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/leg1.png", x: -16, y: 19, w: 15, h: 21 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/leg2.png", x: 1, y: 19, w: 17, h: 22 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/body.png", x: -20, y: -5, w: 40, h: 40 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/bow.png", x: 15, y: -6, w: 43, h: 33 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/arm2.png", x: 13, y: -1, w: 20, h: 21 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/head.png", x: -32, y: -37, w: 64, h: 46 },
    ],
  },
  Cindermaw: { src: "assets/wildwood/enemies/slime-orange-stone.png", size: 64 },
  "King Slime": { src: "assets/wildwood/enemies/slime-green-king.png", size: 74 },
  "Dread Warden": { src: "assets/wildwood/enemies/slime-orange-king.png", size: 88 },
  "Dune Raider": {
    size: 70,
    height: 78,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_warrior/leg.png", x: -15, y: 23, w: 17, h: 15 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_warrior/leg2.png", x: 1, y: 23, w: 17, h: 15 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_warrior/body.png", x: -28, y: -39, w: 56, h: 70 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_warrior/arm.png", x: -38, y: -16, w: 72, h: 31 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_warrior/arm2.png", x: 18, y: -8, w: 17, h: 17 },
    ],
  },
  "Dune Archer": {
    size: 68,
    height: 76,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_archer/leg.png", x: -14, y: 22, w: 15, h: 16 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_archer/leg2.png", x: 1, y: 22, w: 15, h: 16 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_archer/body.png", x: -25, y: -31, w: 50, h: 58 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_archer/hat.png", x: -32, y: -43, w: 64, h: 39 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_archer/bow.png", x: 15, y: -12, w: 50, h: 30 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/goblin/goblin/goblin_archer/arm2.png", x: 12, y: -5, w: 14, h: 15 },
    ],
  },
  "Venom Guard": {
    size: 76,
    height: 86,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/leg.png", x: -16, y: 24, w: 18, h: 26 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/leg2.png", x: 1, y: 27, w: 17, h: 23 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/body.png", x: -25, y: -18, w: 50, h: 50 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/arm.png", x: -40, y: -10, w: 70, h: 44 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/head.png", x: -34, y: -49, w: 68, h: 57 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_warrior/shield.png", x: 18, y: -6, w: 32, h: 34 },
    ],
  },
  "Wastes Reaper": {
    size: 86,
    height: 92,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/leg1.png", x: -18, y: 25, w: 19, h: 27 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/leg2.png", x: 1, y: 25, w: 20, h: 27 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/body.png", x: -26, y: -22, w: 52, h: 52 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/bow.png", x: 19, y: -17, w: 56, h: 43 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/arm2.png", x: 16, y: -9, w: 25, h: 26 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull_archer/head.png", x: -39, y: -56, w: 78, h: 56 },
    ],
  },
  "Blight Oracle": {
    size: 82,
    height: 92,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/leg.png", x: -17, y: 25, w: 20, h: 27 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/leg2.png", x: 1, y: 27, w: 19, h: 25 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/body.png", x: -29, y: -23, w: 58, h: 59 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/arm.png", x: -35, y: -12, w: 25, h: 26 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/arm2.png", x: 10, y: -12, w: 25, h: 26 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull_poison/skull/head.png", x: -34, y: -56, w: 68, h: 57 },
    ],
  },
  "Frost Raider": { src: "assets/wildwood/enemies/slime-green-stone.png", size: 62 },
  "Glacier Archer": { src: "assets/wildwood/enemies/slime-orange.png", size: 50 },
  "Rime Guard": { src: "assets/wildwood/enemies/slime-green-stone.png", size: 70 },
  "Whiteout Reaper": { src: "assets/wildwood/enemies/slime-orange.png", size: 66 },
  "Aurora Oracle": { src: "assets/wildwood/enemies/slime-green.png", size: 68 },
};

export const REWARD_DATA: Record<RewardType, { color: string }> = {
  damage: { color: "#ff655a" },
  health: { color: "#66ed79" },
  speed: { color: "#ffe05d" },
  armor: { color: "#d3dbe0" },
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

export function loadEnemySprites(): Record<EnemyKind, LoadedEnemySprite> {
  return Object.fromEntries(Object.entries(ENEMY_SPRITE_SOURCES).map(([kind, source]) => {
    if ("layers" in source) {
      const layers = source.layers.map((layer) => {
        const image = new Image();
        image.src = layer.src;
        return { ...layer, image };
      });
      return [kind, { size: source.size, height: source.height, layers }];
    }
    const image = new Image();
    image.src = source.src;
    return [kind, { size: source.size, image }];
  })) as Record<EnemyKind, LoadedEnemySprite>;
}

export function loadActorShadowSprite() {
  const image = new Image();
  image.src = "assets/wildwood/2D Character - Casual Monsters/_PNG/slime/shadow.png";
  return image;
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
