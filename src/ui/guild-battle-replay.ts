import { simulateGuildBattle, type GuildBattleResult, type GuildCombatFrame } from "../../shared/guild-combat";
import { drawStartingPlayer, type PlayerAppearanceAssets } from "../game/player-appearance";

export type GuildReplayAssets = { player: PlayerAppearanceAssets; prepare: () => Promise<void>; background: HTMLImageElement; arena: HTMLImageElement };

/** A single fitted canvas; deterministic frames are computed once, never from
 * the render loop. No world simulation, network polling, or per-actor DOM. */
export function createGuildBattleReplay(parent: HTMLElement, battle: GuildBattleResult, names: [string, string], assets?: GuildReplayAssets) {
  const doc = parent.ownerDocument, win = doc.defaultView;
  const root = doc.createElement("section"); root.className = "guild-replay";
  const title = doc.createElement("h3"); title.textContent = `[${names[0]}] vs [${names[1]}]`;
  const status = doc.createElement("p"); status.setAttribute("role", "status"); status.textContent = "Loading battlefield…";
  const canvas = doc.createElement("canvas"); canvas.setAttribute("aria-label", `${names[0]} versus ${names[1]} guild battle replay`);
  const controls = doc.createElement("div"); controls.className = "guild-replay-controls";
  const play = doc.createElement("button"); play.type = "button"; play.className = "guild-button"; play.textContent = "Pause";
  const restart = doc.createElement("button"); restart.type = "button"; restart.className = "guild-button"; restart.textContent = "Restart";
  const speed = doc.createElement("button"); speed.type = "button"; speed.className = "guild-button"; speed.textContent = "1×"; speed.setAttribute("aria-label", "Replay speed");
  let showNames = battle.attackers.length + battle.defenders.length <= 12;
  const labels = doc.createElement("button"); labels.type = "button"; labels.className = "guild-button"; labels.textContent = "Names"; labels.setAttribute("aria-pressed", String(showNames));
  const seek = doc.createElement("input"); seek.type = "range"; seek.min = "0"; seek.max = String(battle.duration); seek.step = ".1"; seek.value = "0"; seek.setAttribute("aria-label", "Replay time");
  controls.append(play, restart, speed, labels, seek); root.append(title, status, canvas, controls); parent.append(root);
  const fighters = [...battle.attackers, ...battle.defenders], split = battle.attackers.length;
  const appearanceKeys = fighters.map(member => JSON.stringify(member.appearance ?? {}));
  const frames: GuildCombatFrame[] = [];
  let disposed = false, ready = false, playing = true, elapsed = 0, rate = 1, request = 0, last = 0, lastDraw = 0;
  const sprites = new Map<string, HTMLCanvasElement>();
  let ctx: CanvasRenderingContext2D | null = null;
  try { ctx = canvas.getContext("2d"); } catch { /* Non-canvas hosts still show report text. */ }
  function schedule() { if (!disposed && ready && playing && !doc.hidden && !request && win?.requestAnimationFrame) request = win.requestAnimationFrame(tick); }
  function draw() {
    if (!ready || !ctx) return;
    const index = Math.min(frames.length - 1, Math.floor(elapsed * 10)), frame = frames[index], next = frames[Math.min(index + 1, frames.length - 1)];
    const mix = Math.min(1, Math.max(0, elapsed * 10 - index));
    const width = Math.max(320, canvas.clientWidth || 900), height = width * .64, dpr = Math.min(1.5, win?.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    ctx.setTransform(canvas.width / 1000, 0, 0, canvas.height / 640, 0, 0); ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "#101d29"; ctx.fillRect(0, 0, 1000, 640);
    if (assets?.background.naturalWidth) ctx.drawImage(assets.background, 0, 0, 1000, 640);
    if (assets?.arena.naturalWidth) ctx.drawImage(assets.arena, 45, 65, 910, 530);
    else { ctx.fillStyle = "#33483e"; ctx.beginPath(); ctx.ellipse(500, 330, 455, 270, 0, 0, Math.PI * 2); ctx.fill(); }
    const positions = frame.actors.map((actor, i) => ({ x: actor.x + (next.actors[i].x - actor.x) * mix, y: actor.y + (next.actors[i].y - actor.y) * mix }));
    // Depth order is only forty integers; cosmetics never affect combat state.
    const order = frame.actors.map((_, i) => i).sort((a, b) => positions[a].y - positions[b].y);
    for (const i of order) {
      const actor = frame.actors[i], at = positions[i], color = i < split ? "#79d7ff" : "#ff9c99";
      if (actor.hp <= 0) {
        ctx.globalAlpha = .28; ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(at.x - 6, at.y - 6); ctx.lineTo(at.x + 6, at.y + 6); ctx.moveTo(at.x + 6, at.y - 6); ctx.lineTo(at.x - 6, at.y + 6); ctx.stroke(); ctx.globalAlpha = 1; continue;
      }
      const target = positions[actor.target], facing = target && target.x < at.x ? Math.PI : 0;
      const moving = Math.hypot(next.actors[i].x - actor.x, next.actors[i].y - actor.y) > .1;
      const attack = elapsed - actor.hitAt < .22;
      ctx.fillStyle = "#0006"; ctx.beginPath(); ctx.ellipse(at.x, at.y + 11, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      if (assets) {
        const phase = attack ? 4 : moving ? Math.floor(elapsed * 10) % 3 + 1 : 0;
        const key = `${appearanceKeys[i]}:${facing}:${phase}`;
        let sprite = sprites.get(key);
        if (!sprite) {
          sprite = doc.createElement("canvas"); sprite.width = 96; sprite.height = 112;
          const paint = sprite.getContext("2d");
          if (paint) drawStartingPlayer(paint, assets.player, { ...fighters[i].appearance, x: 48, y: 76, facing, moving: phase > 0 && phase < 4, gameTime: phase / 10, throwClock: attack ? .28 : 0, scale: .5 });
          sprites.set(key, sprite);
        }
        ctx.drawImage(sprite, at.x - 36, at.y - 68, 72, 84);
      } else { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(at.x, at.y - 8, 12, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#091015"; ctx.fillRect(at.x - 19, at.y - 49, 38, 5);
      ctx.fillStyle = color; ctx.fillRect(at.x - 18, at.y - 48, 36 * actor.hp / fighters[i].fighter.maxHp, 3);
      ctx.font = "600 11px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#091015"; ctx.lineWidth = 3;
      const name = fighters[i].name.length > 14 ? `${fighters[i].name.slice(0, 12)}…` : fighters[i].name;
      if (showNames) { ctx.strokeText(name, at.x, at.y - 56); ctx.fillText(name, at.x, at.y - 56); }
      if (attack && target) {
        const progress = (elapsed - actor.hitAt) / .22;
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(at.x + (target.x - at.x) * Math.max(0, progress - .2), at.y - 15 + (target.y - at.y) * Math.max(0, progress - .2));
        ctx.lineTo(at.x + (target.x - at.x) * progress, at.y - 15 + (target.y - at.y) * progress); ctx.stroke();
      }
    }
    const alive = (from: number, to: number) => frame.actors.slice(from, to).filter(actor => actor.hp > 0).length;
    const done = elapsed >= battle.duration;
    status.textContent = done ? `${battle.outcome === "DRAW" ? "Draw" : `[${battle.outcome === "VICTORY" ? names[0] : names[1]}] wins`} · ${battle.attackerSurvivors}–${battle.defenderSurvivors} survivors` : `[${names[0]}] ${alive(0, split)}/${split}  ·  ${elapsed.toFixed(1)}s  ·  [${names[1]}] ${alive(split, fighters.length)}/${fighters.length - split}`;
    seek.value = String(elapsed); play.textContent = playing ? "Pause" : done ? "Replay" : "Play";
  }
  function tick(timestamp: number) {
    request = 0;
    if (disposed || !playing || doc.hidden) { last = 0; return; }
    if (last) elapsed = Math.min(battle.duration, elapsed + Math.min(.1, (timestamp - last) / 1000) * rate);
    last = timestamp;
    if (elapsed >= battle.duration) playing = false;
    if (timestamp - lastDraw >= 1000 / 30 || !playing) { draw(); lastDraw = timestamp; }
    schedule();
  }
  play.onclick = () => { if (elapsed >= battle.duration) elapsed = 0; playing = !playing; last = 0; draw(); schedule(); };
  restart.onclick = () => { elapsed = 0; playing = true; last = 0; draw(); schedule(); };
  speed.onclick = () => { rate = rate === 1 ? 2 : rate === 2 ? 4 : 1; speed.textContent = `${rate}×`; };
  labels.onclick = () => { showNames = !showNames; labels.setAttribute("aria-pressed", String(showNames)); draw(); };
  seek.oninput = () => { elapsed = Number(seek.value); last = 0; draw(); };
  const visibility = () => { last = 0; schedule(); }; doc.addEventListener("visibilitychange", visibility);
  const resize = () => draw(); win?.addEventListener("resize", resize);
  void (assets?.prepare() ?? Promise.resolve()).then(() => {
    if (disposed) return;
    simulateGuildBattle(battle.attackers, battle.defenders, frame => frames.push(frame));
    ready = true;
    if (!ctx) { status.textContent = `${battle.attackers.length} vs ${battle.defenders.length} · ${battle.duration.toFixed(1)}s`; controls.hidden = true; return; }
    draw(); schedule();
  }).catch(() => { if (!disposed) status.textContent = "Could not load the replay. Close it and try again."; });
  return { dispose() { disposed = true; if (request) win?.cancelAnimationFrame(request); doc.removeEventListener("visibilitychange", visibility); win?.removeEventListener("resize", resize); sprites.clear(); frames.length = 0; root.remove(); } };
}
