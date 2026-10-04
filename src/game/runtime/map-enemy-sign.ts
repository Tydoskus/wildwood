import { CAMPAIGN_GATEWAYS } from "../../../shared/map-gateways";
import { REWARD_DATA, rewardAmountLabel, type EnemyDefinition, type EnemyKind, type RewardType } from "../enemies";
import { formatCompactNumber } from "../../ui/number-format";
import type { EnemyState } from "./types";

/**
 * A wooden sign beside each campaign map's arrival point listing the enemies
 * that live there: health, one hit before armor, and what a kill pays (as the
 * enemies' own labels show it). It is drawn once to its own canvas and then
 * drawn as one image, rebuilt only when the numbers on it change.
 */
export type MapSignRow = { name: string; elite: boolean; hp: number; hit: number; reward: EnemyDefinition["reward"] };

const FONT = '"Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
const WIDTH = 304;
/** Short stat names: the reward column is narrow, and its colour already says which stat. */
const SHORT_STAT: Record<RewardType, string> = { damage: "Atk", health: "HP", armor: "Armor", regen: "Regen", speed: "Spd" };
const ROW = 17;
const HEAD = 44;
const POST = 34;
/** Where the sign stands from the arrival point: to the right, clear of the portals behind it. */
export const MAP_SIGN_OFFSET = { x: 190, y: 30 };

export function mapSignPosition(mapId: string) {
  const arrival = CAMPAIGN_GATEWAYS[mapId]?.arrival;
  return arrival ? { x: arrival.x + MAP_SIGN_OFFSET.x, y: arrival.y + MAP_SIGN_OFFSET.y } : null;
}

/** One row per kind of enemy on the map, weakest first. Bosses and other players' ghosts are left off. */
export function mapSignRows(enemies: readonly EnemyState[], rewardAmount: (type: RewardType, amount: number) => number): MapSignRow[] {
  const rows = new Map<EnemyKind, MapSignRow>();
  for (const enemy of enemies) {
    if (enemy.generatedBoss || enemy.remoteCombatGhost || rows.has(enemy.type)) continue;
    rows.set(enemy.type, { name: enemy.displayName ?? enemy.type, elite: Boolean(enemy.definition?.elite),
      hp: enemy.maxHp, hit: enemy.damage, reward: { ...enemy.reward, amount: rewardAmount(enemy.reward.type, enemy.reward.amount) } });
  }
  return [...rows.values()].sort((a, b) => a.hp - b.hp);
}

export function createMapEnemySigns(options: { pixelRatio: () => number; createCanvas?: () => HTMLCanvasElement }) {
  const createCanvas = options.createCanvas ?? (() => document.createElement("canvas"));
  let cached: { key: string; canvas: HTMLCanvasElement; width: number; height: number } | null = null;

  function build(rows: readonly MapSignRow[], scale: number) {
    const boardH = HEAD + rows.length * ROW + 10;
    const width = WIDTH + 8, height = boardH + POST;
    const canvas = createCanvas();
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const c = canvas.getContext("2d");
    if (!c) return { canvas, width, height };
    c.setTransform(scale, 0, 0, scale, 4 * scale, 0);
    // Posts, then the board: dark edge, planks, grain lines and a lit top edge.
    c.fillStyle = "#4a3220";
    for (const x of [26, WIDTH - 36]) c.fillRect(x - 1, boardH - 6, 12, POST + 6);
    c.fillStyle = "#795437";
    for (const x of [26, WIDTH - 36]) c.fillRect(x, boardH - 6, 10, POST + 4);
    c.fillStyle = "#3b2716";
    c.beginPath(); c.roundRect(0, 0, WIDTH, boardH, 6); c.fill();
    c.fillStyle = "#a47548";
    c.beginPath(); c.roundRect(3, 3, WIDTH - 6, boardH - 6, 4); c.fill();
    c.fillStyle = "#8d6440";
    for (let y = 3 + 22; y < boardH - 6; y += 22) c.fillRect(4, y, WIDTH - 8, 2);
    c.fillStyle = "#c39861";
    c.fillRect(6, 5, WIDTH - 12, 2);
    // Heading and column labels.
    c.textBaseline = "middle";
    c.lineJoin = "round";
    const text = (value: string, x: number, y: number, color: string, font: string, align: CanvasTextAlign = "left", maxWidth?: number) => {
      c.font = font; c.textAlign = align;
      c.strokeStyle = "#2a1b0e"; c.lineWidth = 3;
      c.strokeText(value, x, y, maxWidth); c.fillStyle = color; c.fillText(value, x, y, maxWidth);
    };
    text("ENEMIES HERE", WIDTH / 2, 15, "#fff1d2", `900 13px ${FONT}`, "center");
    const columns = { name: 12, hp: 170, hit: 214, reward: WIDTH - 12 };
    const label = `900 9px ${FONT}`;
    text("HP", columns.hp, 33, "#e8d3ad", label, "right");
    text("ATK", columns.hit, 33, "#e8d3ad", label, "right");
    text("REWARD", columns.reward, 33, "#e8d3ad", label, "right");
    rows.forEach((row, index) => {
      const y = HEAD + index * ROW + 2;
      const body = `900 11px ${FONT}`;
      text(`${row.elite ? "★ " : ""}${row.name}`, columns.name, y, row.elite ? "#ffe08a" : "#fff7e6", body, "left", 118);
      text(formatCompactNumber(row.hp), columns.hp, y, "#ff9c9c", body, "right");
      text(formatCompactNumber(row.hit), columns.hit, y, "#ffd29c", body, "right");
      text(`${rewardAmountLabel(row.reward)} ${SHORT_STAT[row.reward.type]}`, columns.reward, y, REWARD_DATA[row.reward.type].color, body, "right", 76);
    });
    return { canvas, width, height };
  }

  /** The sign for these rows, built when they change. Its bottom centre stands on the ground. */
  function sign(rows: readonly MapSignRow[]) {
    if (!rows.length) return null;
    const scale = options.pixelRatio();
    const key = `${scale}|${rows.map(row => `${row.name}:${row.hp}:${row.hit}:${row.reward.type}:${row.reward.amount}`).join("|")}`;
    if (cached?.key !== key) cached = { key, ...build(rows, scale) };
    return cached;
  }

  return { sign };
}
