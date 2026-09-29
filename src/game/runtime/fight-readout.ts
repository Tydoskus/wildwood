/**
 * Local builds only: a readout of each regular fight as it ends, for balance
 * testing. A fight runs from the first blow either side lands to the kill:
 * how long it took, how many of your hits it took, how many of its hits you
 * took, and what they cost of your health. The last few stay on screen and
 * each is logged to the console.
 */
type Fight = { startedAt: number; hitsDealt: number; hitsTaken: number; damageTaken: number; maxHp: number };
type Enemy = { type: string };

const SHOWN = 5;
const fights = new WeakMap<Enemy, Fight>();
const lines: string[] = [];
let panel: HTMLElement | null = null;

export function fightReadoutEnabled(location: Pick<Location, "hostname"> | undefined = globalThis.location) {
  return location?.hostname === "localhost" || location?.hostname === "127.0.0.1";
}

function fightFor(enemy: Enemy, maxHp: number, now: number) {
  let fight = fights.get(enemy);
  if (!fight) fights.set(enemy, fight = { startedAt: now, hitsDealt: 0, hitsTaken: 0, damageTaken: 0, maxHp });
  return fight;
}

export function noteHitDealt(enemy: Enemy, maxHp: number, now = performance.now()) {
  if (!fightReadoutEnabled()) return;
  fightFor(enemy, maxHp, now).hitsDealt += 1;
}

export function noteHitTaken(enemy: Enemy, damage: number, maxHp: number, now = performance.now()) {
  if (!fightReadoutEnabled()) return;
  const fight = fightFor(enemy, maxHp, now);
  fight.hitsTaken += 1;
  fight.damageTaken += damage;
}

/** The line for a finished fight; exported for tests. */
export function fightLine(type: string, fight: Fight, now: number) {
  const seconds = Math.max(0, now - fight.startedAt) / 1_000;
  const share = fight.maxHp > 0 ? fight.damageTaken / fight.maxHp * 100 : 0;
  return `${type}: ${fight.hitsDealt} hits, ${seconds.toFixed(1)}s · took ${fight.hitsTaken} hits, ${share.toFixed(0)}% hp`;
}

export function noteKill(enemy: Enemy, now = performance.now()) {
  if (!fightReadoutEnabled()) return;
  const fight = fights.get(enemy);
  if (!fight) return;
  fights.delete(enemy);
  const line = fightLine(enemy.type, fight, now);
  console.info(`[fight] ${line}`);
  lines.unshift(line);
  lines.length = Math.min(lines.length, SHOWN);
  if (!panel) {
    panel = document.createElement("div");
    panel.setAttribute("aria-hidden", "true");
    Object.assign(panel.style, {
      position: "fixed", left: "8px", bottom: "96px", zIndex: "9999", pointerEvents: "none",
      font: "12px/1.35 ui-monospace, monospace", color: "#fff", background: "rgba(0,0,0,.6)",
      padding: "6px 8px", borderRadius: "6px", whiteSpace: "pre",
    });
    document.body.append(panel);
  }
  panel.textContent = lines.join("\n");
}
