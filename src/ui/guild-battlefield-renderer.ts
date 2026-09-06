import { drawStartingPlayer, type PlayerAppearanceAssets } from "../game/player-appearance";
import { projectileKindForWeapon } from "../game/item-presentation";
import { paintArrowProjectile, paintRockProjectile } from "../game/runtime/weapon-projectile-renderer";
import { paintStaticTile, type StaticTileTreeBounds } from "../game/runtime/static-tile-painter";
import { mapVisualTheme } from "../game/map-design";
import type { WorldDecor } from "../game/world";
import { playerDeathPose } from "../game/runtime/player-death-animation";
import { replayEventIndex, type GuildReplayTimeline } from "./guild-replay-timeline";

export type GuildReplayAssets = { player: PlayerAppearanceAssets; prepare: () => Promise<void>; trees: HTMLImageElement; treeBounds: () => StaticTileTreeBounds[] };
const WIDTH = 1000, HEIGHT = 640;
const TEAM_COLORS = ["#b9e7ff", "#ffccb2"];

/** Ground is cached at the display's resolution. Characters and equipped weapons
 * use the live renderer directly, with continuous aiming and attack clocks. */
export function createGuildBattlefieldRenderer(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, timeline: GuildReplayTimeline, split: number, assets: GuildReplayAssets) {
  const doc = canvas.ownerDocument;
  const ground = doc.createElement("canvas");
  const groundContext = ground.getContext("2d");
  const decor: WorldDecor[] = [];
  let seed = 73421;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < 450; i++) {
    const x = random() * WIDTH, y = random() * HEIGHT;
    decor.push({ type: "grass", x, y, variant: i % 4, color: i % 3 ? "#30844d" : "#4a9a57" });
    if ((x < 80 || x > 920 || y < 80 || y > 570) && i % 3 === 0) decor.push({ type: "petal", x: x + 8, y: y + 4, variant: i % 3 });
  }
  for (const [x, y, size] of [[48, 145, .8], [955, 493, .9], [840, 588, .6], [154, 58, .7], [44, 418, .55], [925, 103, .5]]) decor.push({ type: "rock", x, y, s: size, variant: 0 });
  function resize() {
    const width = Math.max(1, canvas.clientWidth || 900), dpr = doc.defaultView?.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(width * HEIGHT / WIDTH * dpr);
    if (canvas.width === pixelWidth && canvas.height === pixelHeight && ground.width === pixelWidth) return;
    canvas.width = pixelWidth; canvas.height = pixelHeight; ground.width = pixelWidth; ground.height = pixelHeight;
    if (!groundContext) return;
    groundContext.setTransform(pixelWidth / WIDTH, 0, 0, pixelHeight / HEIGHT, 0, 0);
    paintStaticTile(groundContext, { tileSize: WIDTH, colors: mapVisualTheme("tutorial_forest"), paths: [], decor,
      treeBounds: [], treeShadowsVisible: false, snowPineAspect: 1 }, 0, 0);
    groundContext.imageSmoothingEnabled = true; groundContext.imageSmoothingQuality = "high";
    const trees = [[12, 142, 155], [965, 109, 140], [18, 365, 135], [995, 400, 165], [56, 656, 150], [972, 660, 145]];
    trees.forEach(([x, y, height], i) => {
      const source = assets.treeBounds()[i % assets.treeBounds().length];
      if (!source || !assets.trees.naturalWidth) return;
      groundContext.fillStyle = "#163c2826"; groundContext.beginPath(); groundContext.ellipse(x + 12, y + 5, height * .35, height * .11, -.2, 0, Math.PI * 2); groundContext.fill();
      const width = height * source.w / source.h;
      groundContext.drawImage(assets.trees, source.x, source.y, source.w, source.h, x - width / 2, y - height, width, height);
    });
  }
  function draw(time: number, showNames: boolean) {
    resize();
    ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(ground, 0, 0, WIDTH, HEIGHT);
    const actors = timeline.sample(time);
    const order = actors.map((_, i) => i).sort((a, b) => actors[a].y - actors[b].y);
    for (const i of order) {
      const actor = actors[i], fighter = timeline.fighters[i], diedAt = timeline.deaths[i];
      const deathAge = time - diedAt;
      if (deathAge > 1.1) continue;
      const side = i < split ? 0 : 1;
      const eventIndex = replayEventIndex(timeline.attacks[i], time - .35, event => event.launch);
      const attack = timeline.attacks[i].slice(eventIndex, eventIndex + 3).find(event => time >= event.launch - .12 && time <= event.launch + .30);
      const target = attack ? attack.to : actors[actor.target];
      const aim = target ? Math.atan2(target.y - actor.y, target.x - actor.x) : side ? Math.PI : 0;
      const throwClock = attack ? Math.max(0, .42 - (time - (attack.launch - .12))) : 0;
      ctx.fillStyle = "#0b2e2438"; ctx.beginPath(); ctx.ellipse(actor.x, actor.y + 24, 17, 5, 0, 0, Math.PI * 2); ctx.fill();
      if (deathAge < 0) {
        ctx.strokeStyle = TEAM_COLORS[side]; ctx.lineWidth = 1.5; ctx.globalAlpha = .7; ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.save();
      let alpha = 1;
      if (deathAge >= 0) {
        const pose = playerDeathPose(diedAt * 1000, time * 1000, fighter.identity);
        ctx.translate(actor.x, actor.y + 24); ctx.rotate(pose.bodyRotation); ctx.scale(1, pose.bodyScaleY); ctx.translate(-actor.x, -actor.y - 24);
        alpha = Math.max(0, 1 - Math.max(0, deathAge - .6) / .5);
      }
      drawStartingPlayer(ctx, assets.player, { ...fighter.appearance, x: actor.x, y: actor.y - 5,
        facing: aim, combatFacing: aim, moving: actor.moving && deathAge < 0, gameTime: time + i * .137,
        throwClock, alpha, smooth: true });
      ctx.restore();
      if (deathAge >= 0) continue;
      const barY = actor.y - 66;
      ctx.fillStyle = "#103727"; ctx.fillRect(actor.x - 20, barY, 40, 6);
      ctx.fillStyle = TEAM_COLORS[side]; ctx.fillRect(actor.x - 19, barY + 1, 38 * actor.hp / fighter.fighter.maxHp, 4);
      if (showNames) {
        ctx.font = "600 12px system-ui"; ctx.textAlign = "center"; ctx.lineJoin = "round"; ctx.strokeStyle = "#193f2d"; ctx.lineWidth = 3; ctx.fillStyle = "#fff";
        ctx.strokeText(fighter.name, actor.x, barY - 5); ctx.fillText(fighter.name, actor.x, barY - 5);
      }
    }
    // Launch before the authoritative hit: the projectile arrives as HP changes,
    // including simultaneous knockouts and when scrubbing backward.
    const start = replayEventIndex(timeline.shots, time - .5, event => event.launch);
    for (let i = start; i < timeline.shots.length; i++) {
      const shot = timeline.shots[i]; if (shot.launch > time) break;
      const weapon = timeline.fighters[shot.actor].appearance?.rightHandItem || timeline.fighters[shot.actor].appearance?.leftHandItem;
      const kind = projectileKindForWeapon(weapon);
      if (time < shot.impact) {
        const progress = (time - shot.launch) / (shot.impact - shot.launch);
        const x = shot.from.x + (shot.to.x - shot.from.x) * progress, y = shot.from.y + (shot.to.y - shot.from.y) * progress;
        const angle = Math.atan2(shot.to.y - shot.from.y, shot.to.x - shot.from.x);
        if (kind === "ARROW") paintArrowProjectile(ctx, x, y, angle);
        else if (kind === "ROCK") paintRockProjectile(ctx, assets.player.equipment[weapon!]?.sprite, weapon, x, y, angle + progress * Math.PI * 2);
      } else if (time - shot.impact < .16) {
        const progress = (time - shot.impact) / .16;
        ctx.globalAlpha = 1 - progress; ctx.strokeStyle = "#fff3c5"; ctx.lineWidth = 2;
        for (let ray = 0; ray < 4; ray++) { const angle = ray * Math.PI / 2 + .4; ctx.beginPath(); ctx.moveTo(shot.to.x + Math.cos(angle) * (3 + progress * 5), shot.to.y + Math.sin(angle) * (3 + progress * 5)); ctx.lineTo(shot.to.x + Math.cos(angle) * (6 + progress * 7), shot.to.y + Math.sin(angle) * (6 + progress * 7)); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
    }
    return actors;
  }
  return { draw, dispose() { ground.width = 0; ground.height = 0; } };
}
