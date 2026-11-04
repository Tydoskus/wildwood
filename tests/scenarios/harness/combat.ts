import { afterEach, vi } from "vitest";
import { createSpawnSites, type MapId, type SpawnSite } from "../../../src/game/world";
import type { GameTab } from "./game";
import { seededRandom, type ScenarioWorld } from "./server";

afterEach(() => { vi.restoreAllMocks(); });

/** The browser's Math.random, seeded, so a fight's rolls come out the same every run. */
export function seedBrowserRandom(seed: number) {
  const random = seededRandom(seed);
  vi.spyOn(Math, "random").mockImplementation(() => random());
}

/** A camp's spawn points on a map, as every client lays them out. */
export function campSites(mapId: MapId, campName: string): SpawnSite[] {
  const sites = createSpawnSites({ x: 0, y: 0 }, mapId).filter(site => site.campName === campName);
  if (!sites.length) throw new Error(`No camp ${campName} on ${mapId}`);
  return sites;
}

/** The point nearest `to`. */
export function nearest<T extends { x: number; y: number }>(points: T[], to: { x: number; y: number }) {
  return [...points].sort((a, b) => Math.hypot(a.x - to.x, a.y - to.y) - Math.hypot(b.x - to.x, b.y - to.y))[0];
}

/** A character made on the server that last stood at `at` (where the next session puts them). */
export function characterAt(world: ScenarioWorld, name: string, at: { x: number; y: number; mapId?: string }) {
  const player = world.join(name);
  player.disconnect();
  player.patch("playerLastLocation", { ...at });
  return player;
}

/** The Reflect Only challenge under way, with Reflect at `ranks`. */
export function startReflectOnly(world: ScenarioWorld, player: { identity: unknown }, ranks: number) {
  world.setup(ctx => {
    const db = ctx.db as any;
    db.playerPrestige.insert({ identity: player.identity, level: 1, perkPoints: 0, peakPower: 0, prestigedAt: ctx.timestamp });
    db.playerPrestigePerk.insert({ identity: player.identity, keenEdge: 0, doubleStrike: 0, splitShot: 0, riposte: ranks });
    db.playerPrestigeChallenge.insert({ identity: player.identity, active: true, completed: 0 });
  });
}

/** Kill reports this tab sent that the server accepted. */
export function acceptedKillReports(tab: GameTab) {
  return tab.connection()!.fake.calls
    .filter(call => /^report(AutoFarm)?EnemyDefeats$/.test(call.reducer) && !call.error)
    .map(call => call.args as { mapId: string; simulatedMillis: number; enemies: { enemy: string; count: number }[] });
}

/** Kills the server has been told of, by enemy. */
export function reportedKills(tab: GameTab) {
  const kills: Record<string, number> = {};
  for (const report of acceptedKillReports(tab)) for (const { enemy, count } of report.enemies) kills[enemy] = (kills[enemy] ?? 0) + count;
  return kills;
}

/** The tab goes to the background and back, which sends what it has queued. */
export async function sendQueuedKills(tab: GameTab) {
  tab.setHidden(true);
  await tab.play(500);
  tab.setHidden(false);
  await tab.play(100);
}

/** The amount on the newest reward popup in the pickup log, or null when none shows. A quest's progress line is no reward. */
export function popupAmount(tab: GameTab) {
  const popup = [...tab.element("pickupLog").children].find(entry => !entry.classList.contains("quest-progress-toast"));
  const match = /\d+(?:\.\d+)?/.exec(popup?.textContent ?? "");
  return match ? Number(match[0]) : null;
}

/** What the server holds for a player that a boss's first clear pays: gold, Mastery points and which bosses are claimed. */
export function bossPayouts(world: ScenarioWorld, player: { identity: any; progress: () => any }) {
  const db = world.db as any;
  return {
    gold: Number(db.playerGold.identity.find(player.identity)?.gold ?? 0n),
    mastery: [...db.playerWeaponMastery.identity.filter(player.identity)].reduce((total: number, row: any) => total + Number(row.points), 0),
    claims: player.progress()!.bossRewardClaims,
  };
}

/** The switch a label (by id) names, as a player finds it beside the label. */
export function switchFor(tab: GameTab, labelId: string) {
  const control = tab.document.querySelector(`[aria-labelledby="${labelId}"]`) as HTMLButtonElement | null;
  if (!control) throw new Error(`No switch for #${labelId}`);
  return control;
}

/** Taps the switch beside a label; throws when it is disabled, as a finger would find it dead. */
export function tapSwitch(tab: GameTab, labelId: string) {
  const control = switchFor(tab, labelId);
  if (control.disabled) throw new Error(`The switch for #${labelId} is disabled`);
  for (const type of ["pointerdown", "pointerup", "click"]) control.dispatchEvent(new (tab.window as any).Event(type, { bubbles: true }));
}

/** The last position this tab's movement told the server. */
export function lastSentPosition(tab: GameTab) {
  const moves = tab.connection()!.fake.calls.filter(call => call.reducer === "updateMovementState");
  const last = moves[moves.length - 1]?.args as { x: number; y: number } | undefined;
  return last ? { x: last.x, y: last.y } : null;
}

/** The Map Guide's Enemy Index as the player reads it: each enemy's name and the numbers on its row. */
export function enemyIndex(tab: GameTab) {
  const rows = [...tab.element("mapGuideEnemyRows").children] as HTMLElement[];
  return new Map(rows.map(row => {
    const cells = [...row.children].map(cell => cell.textContent ?? "");
    return [cells[0].replace(/^\W+/, "").trim(), cells.slice(1).map(cell => Number(/[\d.]+/.exec(cell)?.[0]))] as const;
  }));
}
