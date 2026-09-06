import type { GuildBattleResult } from "../../shared/guild-combat";
import { createGuildBattlefieldRenderer, type GuildReplayAssets } from "./guild-battlefield-renderer";
import { buildGuildReplayTimeline, type GuildReplayTimeline } from "./guild-replay-timeline";
export type { GuildReplayAssets } from "./guild-battlefield-renderer";

/** A single fitted canvas; deterministic frames are computed once, never from
 * the render loop. No world simulation, network polling, or per-actor DOM. */
export function createGuildBattleReplay(parent: HTMLElement, battle: GuildBattleResult, names: [string, string], assets?: GuildReplayAssets, onBack?: () => void) {
  const doc = parent.ownerDocument, win = doc.defaultView;
  const root = doc.createElement("section"); root.className = "guild-replay";
  const title = doc.createElement("h3"); title.textContent = `[${names[0]}] vs [${names[1]}]`;
  const status = doc.createElement("p"); status.setAttribute("role", "status"); status.textContent = "Loading battlefield…";
  const canvas = doc.createElement("canvas"); canvas.setAttribute("aria-label", `${names[0]} versus ${names[1]} guild battle replay`);
  const controls = doc.createElement("div"); controls.className = "guild-replay-controls";
  const back = doc.createElement("button"); back.type = "button"; back.className = "guild-button guild-button--secondary"; back.textContent = "Back to battles";
  back.onclick = () => onBack?.();
  const play = doc.createElement("button"); play.type = "button"; play.className = "guild-button"; play.textContent = "Pause";
  const restart = doc.createElement("button"); restart.type = "button"; restart.className = "guild-button"; restart.textContent = "Restart";
  const speed = doc.createElement("button"); speed.type = "button"; speed.className = "guild-button"; speed.textContent = "1×"; speed.setAttribute("aria-label", "Replay speed");
  let showNames = battle.attackers.length + battle.defenders.length <= 12;
  const labels = doc.createElement("button"); labels.type = "button"; labels.className = "guild-button"; labels.textContent = "Names"; labels.setAttribute("aria-pressed", String(showNames));
  const seek = doc.createElement("input"); seek.type = "range"; seek.min = "0"; seek.max = String(Math.round((battle.duration + 1.1) * 10) / 10); seek.step = ".1"; seek.value = "0"; seek.setAttribute("aria-label", "Replay time");
  controls.append(back, play, restart, speed, labels, seek); root.append(title, status, controls, canvas); parent.append(root);
  const fighters = [...battle.attackers, ...battle.defenders], split = battle.attackers.length;
  let timeline: GuildReplayTimeline | undefined;
  let renderer: ReturnType<typeof createGuildBattlefieldRenderer> | undefined;
  let disposed = false, ready = false, playing = true, elapsed = 0, rate = 1, request = 0, last = 0;
  const endTime = Math.round((battle.duration + 1.1) * 10) / 10;
  let ctx: CanvasRenderingContext2D | null = null;
  try { ctx = canvas.getContext("2d"); } catch { /* Non-canvas hosts still show report text. */ }
  function schedule() { if (!disposed && ready && playing && !doc.hidden && !request && win?.requestAnimationFrame) request = win.requestAnimationFrame(tick); }
  function draw() {
    if (!ready || !ctx) return;
    const actors = renderer?.draw(elapsed, showNames) ?? timeline!.sample(elapsed);
    const alive = (from: number, to: number) => actors.slice(from, to).filter(actor => actor.hp > 0).length;
    const done = elapsed >= endTime;
    status.textContent = done ? `${battle.outcome === "DRAW" ? "Draw" : `[${battle.outcome === "VICTORY" ? names[0] : names[1]}] wins`} · ${battle.attackerSurvivors}–${battle.defenderSurvivors} survivors` : `[${names[0]}] ${alive(0, split)}/${split}  ·  ${Math.min(battle.duration, elapsed).toFixed(1)}s  ·  [${names[1]}] ${alive(split, fighters.length)}/${fighters.length - split}`;
    seek.value = String(elapsed); play.textContent = playing ? "Pause" : done ? "Replay" : "Play";
  }
  function tick(timestamp: number) {
    request = 0;
    if (disposed || !playing || doc.hidden) { last = 0; return; }
    if (last) elapsed = Math.min(endTime, elapsed + Math.min(.25, (timestamp - last) / 1000) * rate);
    last = timestamp;
    if (elapsed >= endTime) playing = false;
    draw();
    schedule();
  }
  play.onclick = () => { if (elapsed >= endTime) elapsed = 0; playing = !playing; last = 0; draw(); schedule(); };
  restart.onclick = () => { elapsed = 0; playing = true; last = 0; draw(); schedule(); };
  speed.onclick = () => { rate = rate === 1 ? 2 : rate === 2 ? 4 : 1; speed.textContent = `${rate}×`; };
  labels.onclick = () => { showNames = !showNames; labels.setAttribute("aria-pressed", String(showNames)); draw(); };
  seek.oninput = () => { elapsed = Number(seek.value); last = 0; draw(); };
  const visibility = () => { last = 0; schedule(); }; doc.addEventListener("visibilitychange", visibility);
  const resize = () => draw(); win?.addEventListener("resize", resize);
  void (assets?.prepare() ?? Promise.resolve()).then(() => {
    if (disposed) return;
    timeline = buildGuildReplayTimeline(battle);
    if (ctx && assets) renderer = createGuildBattlefieldRenderer(canvas, ctx, timeline, split, assets);
    ready = true;
    if (!ctx) { status.textContent = `${battle.attackers.length} vs ${battle.defenders.length} · ${battle.duration.toFixed(1)}s`; controls.hidden = true; return; }
    draw(); schedule();
  }).catch(() => { if (!disposed) status.textContent = "Could not load the replay. Close it and try again."; });
  return { dispose() { disposed = true; if (request) win?.cancelAnimationFrame(request); doc.removeEventListener("visibilitychange", visibility); win?.removeEventListener("resize", resize); renderer?.dispose(); timeline = undefined; root.remove(); } };
}
