export type RewardType = "damage" | "health" | "speed" | "armor" | "regen";

export type EnemyDefinition = {
  hp: number;
  speed: number;
  damage: number;
  r: number;
  color: string;
  outline: string;
  reward: { type: RewardType; amount: number };
  score: number;
  aggro: number;
  ranged?: boolean;
  elite?: boolean;
};

const enemyTypes = {
  Bramble: {
    hp: 120, speed: 170, damage: 14, r: 14,
    color: "#d95738", outline: "#5c1b13", reward: { type: "health", amount: 24 }, score: 4, aggro: 245,
  },
  Needle: {
    hp: 90, speed: 170, damage: 14, r: 10,
    color: "#ffd34d", outline: "#6f4a12", reward: { type: "speed", amount: .02 }, score: 5, aggro: 275,
  },
  Mossback: {
    hp: 380, speed: 170, damage: 19, r: 22,
    color: "#768d51", outline: "#2c3b20", reward: { type: "armor", amount: 1 }, score: 10, aggro: 220,
  },
  Spitter: {
    hp: 180, speed: 140, damage: 18, r: 15,
    color: "#b16ac8", outline: "#4b235d", reward: { type: "damage", amount: 15 }, score: 8, ranged: true, aggro: 330,
  },
  Brood: {
    hp: 220, speed: 170, damage: 16, r: 16,
    color: "#45b6c2", outline: "#174a54", reward: { type: "regen", amount: .3 }, score: 8, aggro: 255,
  },
  "King Slime": {
    hp: 920, speed: 170, damage: 43, r: 27,
    color: "#70a94f", outline: "#2d5127", reward: { type: "health", amount: 176 }, score: 30,
    elite: true, aggro: 300,
  },
  "Dread Warden": {
    hp: 1000, speed: 205, damage: 175, r: 36,
    color: "#a52e3a", outline: "#47101a", reward: { type: "damage", amount: 83 }, score: 180,
    elite: true, aggro: 350,
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
  Spitter: {
    size: 64,
    height: 70,
    layers: [
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/leg1.png", x: -16, y: 19, w: 15, h: 21 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/leg2.png", x: 1, y: 19, w: 17, h: 22 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/body.png", x: -20, y: -5, w: 40, h: 40 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/arm2.png", x: 13, y: -1, w: 20, h: 21 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/bow.png", x: 15, y: -6, w: 43, h: 33 },
      { src: "assets/wildwood/2D Character - Casual Monsters/_PNG/skull/skull/skull_archer/head.png", x: -32, y: -37, w: 64, h: 46 },
    ],
  },
  Brood: { src: "assets/wildwood/enemies/slime-green.png", size: 50 },
  "King Slime": { src: "assets/wildwood/enemies/slime-green-king.png", size: 74 },
  "Dread Warden": { src: "assets/wildwood/enemies/slime-orange-king.png", size: 88 },
};

export const REWARD_DATA: Record<RewardType, { color: string }> = {
  damage: { color: "#ff655a" },
  health: { color: "#66ed79" },
  speed: { color: "#ffe05d" },
  armor: { color: "#d3dbe0" },
  regen: { color: "#ff7ccb" },
};

export const CAMPS: EnemyCamp[] = [
  { name: "Ember Fen", x: 820, y: 900, minRadius: 260, radius: 610, count: 6, types: ["Bramble", "Bramble", "Needle"], ground: "#5b3b28", ring: "#b66a37" },
  { name: "Mossfall Ruins", x: 2400, y: 760, minRadius: 260, radius: 630, count: 6, types: ["Bramble", "Mossback", "Mossback"], ground: "#33423a", ring: "#8d9b75" },
  { name: "Glass Thicket", x: 3970, y: 1120, minRadius: 280, radius: 600, count: 5, types: ["Needle", "Needle", "Brood"], ground: "#244f53", ring: "#64bdc5" },
  { name: "Brine Marsh", x: 850, y: 2860, minRadius: 270, radius: 620, count: 6, types: ["Spitter", "Brood", "Spitter"], ground: "#243e4d", ring: "#5f9eb5" },
  { name: "Cinder Quarry", x: 3830, y: 2790, minRadius: 280, radius: 610, count: 6, types: ["Mossback", "Spitter", "Mossback", "Dread Warden"], ground: "#4b4039", ring: "#b5875c" },
  { name: "Moonroot Grove", x: 1540, y: 4040, minRadius: 240, radius: 560, count: 5, types: ["Brood", "Mossback", "King Slime"], ground: "#3d3157", ring: "#9a79d5" },
  { name: "Sunken Yard", x: 3590, y: 4100, minRadius: 240, radius: 560, count: 5, types: ["Needle", "Spitter", "King Slime"], ground: "#553334", ring: "#d37362" },
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
  if (reward.type === "damage") return `+${reward.amount} DAMAGE`;
  if (reward.type === "health") return `+${reward.amount} MAX HEALTH`;
  if (reward.type === "speed") return `+${reward.amount.toFixed(2)} ATK/SEC`;
  if (reward.type === "armor") return `+${reward.amount} ARMOR`;
  return `+${reward.amount} HP/SEC`;
}
