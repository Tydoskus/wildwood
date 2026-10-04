import { CAMPAIGN_GATEWAYS } from "../../../shared/map-gateways";
import { ENEMY_TYPES, type EnemyDefinition, type EnemyKind, type RewardType } from "../enemies";
import { runtimeMapBalance } from "../../../shared/map-balance-runtime";
import { bossForMap } from "./boss-registry";
import type { EnemyState } from "./types";

/**
 * A small wooden sign beside each campaign map's arrival point. Walking into
 * it opens a window listing the enemies that live there (ui/map-enemy-index.ts):
 * health, one hit before armor, and what a kill pays, as the enemies' own
 * labels show it. The sign is drawn once to its own canvas and then as one image.
 */
export type MapSignRow = { name: string; elite: boolean; hp: number; hit: number; reward: EnemyDefinition["reward"];
  /** The map's boss: its hit is its strongest attack, and it may pay several rewards (or none). */
  boss?: { rewards: EnemyDefinition["reward"][] } };

const FONT = '"Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
/** Where the sign stands: right of the arrival point, a little behind the portals' line rather than in front of it. */
export const MAP_SIGN_OFFSET = { x: 190, behindPortals: 40 };

export function mapSignPosition(mapId: string) {
  const gateways = CAMPAIGN_GATEWAYS[mapId];
  if (!gateways) return null;
  const portalLine = gateways.portals.length ? Math.min(...gateways.portals.map(portal => portal.y)) : gateways.arrival.y - 90;
  return { x: gateways.arrival.x + MAP_SIGN_OFFSET.x, y: portalLine - MAP_SIGN_OFFSET.behindPortals };
}

/** The map's boss as an index row: its health, strongest hit and rewards, from the map's live balance. */
export function mapBossRow(mapId: string, rewardAmount: (type: RewardType, amount: number) => number): MapSignRow | null {
  const balance = runtimeMapBalance(mapId)?.boss, boss = bossForMap(mapId);
  if (!balance || !boss) return null;
  const rewards = Object.entries(balance.rewards).filter(([, amount]) => amount > 0)
    .map(([type, amount]) => ({ type: type as RewardType, amount: rewardAmount(type as RewardType, amount) }));
  return { name: boss.name, elite: false, hp: balance.hp, hit: Math.max(balance.damage, ...Object.values(balance.attacks)),
    reward: rewards[0] ?? { type: "damage", amount: 0 }, boss: { rewards } };
}

/** One row per kind of enemy on the map, weakest first. Bosses and other players' ghosts are left off. */
export function mapSignRows(enemies: readonly EnemyState[], rewardAmount: (type: RewardType, amount: number) => number): MapSignRow[] {
  const rows = new Map<EnemyKind, MapSignRow>();
  for (const enemy of enemies) {
    if (enemy.generatedBoss || enemy.remoteCombatGhost || rows.has(enemy.type)) continue;
    rows.set(enemy.type, { name: enemy.displayName ?? enemy.type, elite: Boolean((enemy.definition ?? ENEMY_TYPES[enemy.type])?.elite),
      hp: enemy.maxHp, hit: enemy.damage, reward: { ...enemy.reward, amount: rewardAmount(enemy.reward.type, enemy.reward.amount) } });
  }
  return [...rows.values()].sort((a, b) => a.hp - b.hp);
}

/** The sign's size in world units: a small board on one post. Its bottom centre stands on the ground. */
export const MAP_SIGN_SIZE = { width: 72, height: 66 };
/** Standing within this of the sign's foot opens its window. */
export const MAP_SIGN_TOUCH = { x: 52, above: 72, below: 30 };

export function touchingMapSign(sign: { x: number; y: number }, player: { x: number; y: number }) {
  return Math.abs(player.x - sign.x) <= MAP_SIGN_TOUCH.x && player.y >= sign.y - MAP_SIGN_TOUCH.above && player.y <= sign.y + MAP_SIGN_TOUCH.below;
}

/** The small wooden sign, drawn once to its own canvas at the screen's pixel ratio and then drawn as one image. */
export function createMapEnemySigns(options: { pixelRatio: () => number; createCanvas?: () => HTMLCanvasElement }) {
  const createCanvas = options.createCanvas ?? (() => document.createElement("canvas"));
  let cached: { scale: number; canvas: HTMLCanvasElement; width: number; height: number } | null = null;

  function build(scale: number) {
    const { width, height } = MAP_SIGN_SIZE;
    const canvas = createCanvas();
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const c = canvas.getContext("2d");
    if (!c) return { canvas, width, height };
    c.setTransform(scale, 0, 0, scale, 0, 0);
    // One post, then the board: dark edge, plank, grain and a lit top edge.
    c.fillStyle = "#4a3220"; c.fillRect(width / 2 - 5, 36, 10, height - 36);
    c.fillStyle = "#795437"; c.fillRect(width / 2 - 4, 36, 8, height - 37);
    c.fillStyle = "#3b2716"; c.beginPath(); c.roundRect(2, 2, width - 4, 40, 5); c.fill();
    c.fillStyle = "#a47548"; c.beginPath(); c.roundRect(4, 4, width - 8, 36, 4); c.fill();
    c.fillStyle = "#c39861"; c.fillRect(7, 5, width - 14, 1.5);
    c.font = `900 13px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
    c.strokeStyle = "#2a1b0e"; c.lineWidth = 3;
    for (const [line, y] of [["Enemy", 15], ["Index", 30]] as const) {
      c.strokeText(line, width / 2, y);
      c.fillStyle = "#fff1d2"; c.fillText(line, width / 2, y);
    }
    return { canvas, width, height };
  }

  function sign() {
    const scale = options.pixelRatio();
    if (cached?.scale !== scale) cached = { scale, ...build(scale) };
    return cached;
  }

  return { sign };
}
