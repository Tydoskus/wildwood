import { runtimeMapBalance } from "./map-balance-runtime";
import {
  campaignEnemyRewardMultiplier,
  bossHeavyHitAt,
  desertBossHealthAt,
  desertLaneCombatValue,
  desertLaneRewardValue,
  type ForestProgressionLane,
  type RewardStat,
} from "./progression";
import { armorDamageReduction } from "./combat";
import { referenceBuildForMap } from "./progression";
import { endlessScaling } from "./endless-balance";

export type ProceduralMapId = `endless_${number}`;
export const PROCEDURAL_PREFIX = "endless_";
export const PROCEDURAL_MAP_VERSION = 2;
export const PROCEDURAL_ENTRY_MAP = "ion_citadel";
export const PROCEDURAL_ENTRY_BOSS = "aegisPrime";
export const PROCEDURAL_FIRST_TIER = 14; // Desert is tier zero; this follows Ion.
export const PROCEDURAL_WORLD = { width: 4800, height: 4800 };
export function proceduralMapNumber(id: string): number | null {
  if (!/^endless_[1-9]\d{0,15}$/.test(id)) return null;
  const number = Number(id.slice(PROCEDURAL_PREFIX.length));
  return Number.isSafeInteger(number) ? number : null;
}
export function isProceduralMap(id: string): id is ProceduralMapId {
  return proceduralMapNumber(id) !== null;
}
export function proceduralMapId(index: number): ProceduralMapId {
  if (!Number.isSafeInteger(index) || index < 1)
    throw new RangeError("Invalid generated map number");
  return `endless_${index}`;
}
/** Integer-only RNG: identical layouts in the browser and on the server. */
export function mapRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
export type MapPoint = { x: number; y: number };
export type MapPath = MapPoint & { w: number; h: number };
export type GeneratedCamp = MapPoint & {
  name: string;
  lane: ForestProgressionLane;
  stat: RewardStat;
  count: number;
  radius: number;
};
export type GeneratedMap = {
  id: ProceduralMapId;
  number: number;
  name: string;
  tier: number;
  seed: number;
  arrival: MapPoint;
  boss: MapPoint;
  portals: Array<
    MapPoint & {
      destination: string;
      width: number;
      height: number;
      depth: number;
    }
  >;
  camps: GeneratedCamp[];
  paths: MapPath[];
  palette: { ground: string; path: string; pathDetail: string; accent: string };
};
function hslHex(hue: number, saturation: number, lightness: number) {
  const light = lightness / 100;
  const amplitude = (saturation / 100) * Math.min(light, 1 - light);
  const channel = (offset: number) => {
    const position = (offset + hue / 30) % 12;
    const value =
      light - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
export function proceduralPalette(index: number) {
  // Endless starts at forest green and then walks the whole spectrum, but at a
  // forest's muted saturation and lightness rather than the pale wash it used
  // to have. Saturation starts well above zero; at zero the first map was white.
  const hue = (104 + (index - 1) * 7) % 360;
  const saturation = Math.min(46, 26 + (index - 1) * 2.5);
  // Hex colors work in both the canvas tile painter and the WebGL backdrop.
  // Keep path lighter than ground, and both lighter than detail and accent.
  return {
    ground: hslHex(hue, saturation, 58),
    path: hslHex(hue, saturation * 0.6, 72),
    pathDetail: hslHex(hue, saturation, 44),
    accent: hslHex(hue, saturation, 34),
  };
}
export function proceduralMapCore(id: string) {
  const number = proceduralMapNumber(id);
  if (number === null) throw new RangeError("Invalid generated map");
  return { number, tier: Math.min(60, PROCEDURAL_FIRST_TIER + number - 1),
    arrival: { x: 580, y: 770 }, boss: { x: 4050, y: 4050 } };
}
export function generateMap(id: ProceduralMapId): GeneratedMap {
  const { number, tier, arrival, boss } = proceduralMapCore(id);
  const seed = Math.imul(number, 2654435761) ^ PROCEDURAL_MAP_VERSION;
  const random = mapRandom(seed);
  const slots = [
    { x: 1150, y: 1250 },
    { x: 3050, y: 1100 },
    { x: 1250, y: 2650 },
    { x: 3250, y: 2550 },
  ];
  const lanes: Array<[ForestProgressionLane, RewardStat]> = [
    ["Cindermaw", "damage"],
    ["Bramble", "health"],
    ["Mossback", "armor"],
    ["Brood", "regen"],
  ];
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  const camps = slots.map((slot, i) => ({
    x: slot.x + Math.round((random() - 0.5) * 260),
    y: slot.y + Math.round((random() - 0.5) * 260),
    name: `${["Damage", "Health", "Armor", "Regen"][["damage", "health", "armor", "regen"].indexOf(lanes[i][1])]} Camp`,
    lane: lanes[i][0],
    stat: lanes[i][1],
    count: lanes[i][1] === "damage" ? 13 : 6,
    radius: 330,
  }));
  const paths: MapPath[] = [];
  const connect = (a: MapPoint, b: MapPoint) => {
    paths.push({
      x: Math.min(a.x, b.x) - 90,
      y: a.y - 90,
      w: Math.abs(a.x - b.x) + 180,
      h: 180,
    });
    paths.push({
      x: b.x - 90,
      y: Math.min(a.y, b.y) - 90,
      w: 180,
      h: Math.abs(a.y - b.y) + 180,
    });
  };
  // A connected backbone plus camp branches; all spawn and boss clearings remain reachable.
  let previous = arrival;
  for (const camp of camps) {
    connect(previous, camp);
    previous = camp;
  }
  connect(previous, boss);
  return {
    id,
    number,
    name: `Endless - ${number}`,
    tier,
    seed,
    arrival,
    boss,
    camps,
    paths,
    palette: proceduralPalette(number),
    portals: [
      {
        x: 360,
        y: 680,
        width: 198,
        height: 198,
        depth: 680,
        destination:
          number === 1 ? PROCEDURAL_ENTRY_MAP : proceduralMapId(number - 1),
      },
      ...(number < Number.MAX_SAFE_INTEGER
        ? [
            {
              x: 580,
              y: 680,
              width: 198,
              height: 198,
              depth: 680,
              destination: proceduralMapId(number + 1),
            },
          ]
        : []),
    ],
  };
}
export function generatedEnemyStats(
  map: Pick<GeneratedMap, "number">,
  lane: ForestProgressionLane,
  authored = false,
) {
  const remote = !authored && runtimeMapBalance(`endless_${map.number}`)?.lanes[lane];
  if (remote) return { ...remote, reward: { ...remote.reward } };
  const scale = endlessScaling(map.number);
  const reward = desertLaneRewardValue(lane, PROCEDURAL_FIRST_TIER);
  reward.amount *=
    campaignEnemyRewardMultiplier(PROCEDURAL_FIRST_TIER - 1) /
    campaignEnemyRewardMultiplier(PROCEDURAL_FIRST_TIER) * scale.rewards;
  const combat = desertLaneCombatValue(lane, PROCEDURAL_FIRST_TIER);
  const armor = referenceBuildForMap(PROCEDURAL_FIRST_TIER).armor;
  return { hp: combat.hp * scale.combatStats * scale.endurance,
    damage: combat.damage * scale.combatStats * (1 - armorDamageReduction(armor)) / (1 - armorDamageReduction(armor * scale.combatStats)), reward };
}
export function generatedBossStats(map: Pick<GeneratedMap, "number">, authored = false) {
  const remote = !authored && runtimeMapBalance(`endless_${map.number}`)?.boss;
  if (remote) return { hp: remote.hp, damage: remote.damage, rewards: Object.entries(remote.rewards).map(([type, amount]) => ({ type: type as RewardStat, amount })) };
  const scale = endlessScaling(map.number);
  const armor = referenceBuildForMap(PROCEDURAL_FIRST_TIER).armor * 3;
  return {
    hp: desertBossHealthAt(PROCEDURAL_FIRST_TIER) * scale.combatStats * scale.endurance,
    damage: bossHeavyHitAt(PROCEDURAL_FIRST_TIER) * scale.combatStats * (1 - armorDamageReduction(armor)) / (1 - armorDamageReduction(armor * scale.combatStats)),
    rewards: (["Cindermaw", "Bramble", "Mossback", "Brood"] as const).map(lane => {
      const reward = generatedEnemyStats(map, lane, authored).reward;
      return { ...reward, amount: reward.amount * 10 };
    }),
  };
}
