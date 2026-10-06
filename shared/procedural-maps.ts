import { finalCampaignEnemy, finalCampaignBoss } from "./campaign-combat-baseline";
import { CAMPAIGN_ENDPOINT } from "./campaign-registry";
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
export const PROCEDURAL_ENTRY_MAP = CAMPAIGN_ENDPOINT.mapId;
export const PROCEDURAL_ENTRY_BOSS = CAMPAIGN_ENDPOINT.bossKind;
export const PROCEDURAL_FIRST_TIER = CAMPAIGN_ENDPOINT.endlessTier;
export const PROCEDURAL_WORLD = { width: 4800, height: 4800 };
const PORTAL_CENTER = { x: PROCEDURAL_WORLD.width / 2, y: PROCEDURAL_WORLD.height / 2 };
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
  const saturation = Math.min(38, 24 + (index - 1) * 2);
  // Hex colors work in both the canvas tile painter and the WebGL backdrop.
  // Keep path lighter than ground, and both lighter than detail and accent.
  // Ground sits near the Tutorial Forest's lightness (about 39%) since 0.867;
  // at 53% with a 67% path, Endless read as a bright wash.
  return {
    ground: hslHex(hue, saturation, 41),
    path: hslHex(hue, saturation * 0.6, 56),
    pathDetail: hslHex(hue, saturation, 31),
    accent: hslHex(hue, saturation, 23),
  };
}
export const PROCEDURAL_CAMP_RADIUS = 660;
export const PROCEDURAL_CAMP_JITTER = 80;
export function proceduralMapCore(id: string) {
  const number = proceduralMapNumber(id);
  if (number === null) throw new RangeError("Invalid generated map");
  return { number, tier: Math.min(60, PROCEDURAL_FIRST_TIER + number - 1),
    arrival: { x: PORTAL_CENTER.x, y: PORTAL_CENTER.y + 150 }, boss: { x: 4050, y: 4050 } };
}
export function generateMap(id: ProceduralMapId): GeneratedMap {
  const { number, tier, arrival, boss } = proceduralMapCore(id);
  const seed = Math.imul(number, 2654435761) ^ PROCEDURAL_MAP_VERSION;
  const random = mapRandom(seed);
  // Regions doubled in 0.871 (radius 330 to 660). The slots were pushed apart
  // until a region jittered anywhere within ±80 still clears its neighbours by
  // 120, the arrival by 450 and the boss's 900 arena (src/game/world.test.ts).
  const slots = [
    { x: 1150, y: 1120 },
    { x: 2970, y: 900 },
    { x: 1200, y: 2790 },
    { x: 3620, y: 2430 },
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
    x: slot.x + Math.round((random() - 0.5) * 2 * PROCEDURAL_CAMP_JITTER),
    y: slot.y + Math.round((random() - 0.5) * 2 * PROCEDURAL_CAMP_JITTER),
    name: `${["Damage", "Health", "Armor", "Regen"][["damage", "health", "armor", "regen"].indexOf(lanes[i][1])]} Camp`,
    lane: lanes[i][0],
    stat: lanes[i][1],
    count: lanes[i][1] === "damage" ? 13 : lanes[i][1] === "regen" ? 8 : 6,
    radius: PROCEDURAL_CAMP_RADIUS,
  }));
  const paths: MapPath[] = [
    { x: PORTAL_CENTER.x - 240, y: PORTAL_CENTER.y - 230, w: 480, h: 470 },
  ];
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
        x: PORTAL_CENTER.x - 110,
        y: PORTAL_CENTER.y,
        width: 198,
        height: 198,
        depth: PORTAL_CENTER.y,
        destination:
          number === 1 ? PROCEDURAL_ENTRY_MAP : proceduralMapId(number - 1),
      },
      ...(number < Number.MAX_SAFE_INTEGER
        ? [
            {
              x: PORTAL_CENTER.x + 110,
              y: PORTAL_CENTER.y,
              width: 198,
              height: 198,
              depth: PORTAL_CENTER.y,
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
  const previousTier = PROCEDURAL_FIRST_TIER - 1;
  const previous = finalCampaignEnemy(lane);
  const expectedPrevious = desertLaneCombatValue(lane, previousTier);
  const reward = desertLaneRewardValue(lane, PROCEDURAL_FIRST_TIER);
  reward.amount *= previous.reward.amount / desertLaneRewardValue(lane, previousTier).amount;
  reward.amount *=
    campaignEnemyRewardMultiplier(PROCEDURAL_FIRST_TIER - 1) /
    campaignEnemyRewardMultiplier(PROCEDURAL_FIRST_TIER) * scale.rewards;
  const combat = desertLaneCombatValue(lane, PROCEDURAL_FIRST_TIER);
  const armor = referenceBuildForMap(PROCEDURAL_FIRST_TIER).armor;
  return { hp: combat.hp * previous.hp / expectedPrevious.hp * scale.combatStats * scale.endurance,
    damage: combat.damage * previous.damage / expectedPrevious.damage * scale.combatStats * (1 - armorDamageReduction(armor)) / (1 - armorDamageReduction(armor * scale.combatStats)), reward };
}
export function generatedBossStats(map: Pick<GeneratedMap, "number">, authored = false) {
  const remote = !authored && runtimeMapBalance(`endless_${map.number}`)?.boss;
  if (remote) return { hp: remote.hp, damage: remote.damage, rewards: [] as { type: RewardStat; amount: number }[] };
  const scale = endlessScaling(map.number);
  const armor = referenceBuildForMap(PROCEDURAL_FIRST_TIER).armor * 3;
  const previous = finalCampaignBoss(), previousTier = PROCEDURAL_FIRST_TIER - 1;
  return {
    hp: previous.hp * desertBossHealthAt(PROCEDURAL_FIRST_TIER) / desertBossHealthAt(previousTier) * scale.combatStats * scale.endurance,
    damage: previous.damage * bossHeavyHitAt(PROCEDURAL_FIRST_TIER) / bossHeavyHitAt(previousTier) * scale.combatStats * (1 - armorDamageReduction(armor)) / (1 - armorDamageReduction(armor * scale.combatStats)),
    // Bosses are gates, including before a live balance snapshot has loaded.
    rewards: [] as { type: RewardStat; amount: number }[],
  };
}
