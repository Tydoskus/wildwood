import { guildEntrancePosition, type GuildReplayEntrance } from "./guild-replay-entrance";
import { GUILD_MOVE_SPEED } from "../../shared/guild-entrance";
import { createGuildReplayLabels } from "./guild-replay-labels";
import { formatCompactNumber } from "./number-format";
import { WORLD_HEALTH_BAR_HEIGHT } from "../game/runtime/game-settings";
import { healthBarTextY } from "../game/runtime/health-bar-layout";
import { canvasRenderPixelRatio } from "../game/runtime/render-budget";
import { drawStartingPlayer, type PlayerAppearanceAssets } from "../game/player-appearance";
import { PLAYER_WORLD_SCALE } from "../game/player-render-scale";
import { projectileKindForWeapon } from "../game/item-presentation";
import { paintArrowProjectile, paintRockProjectile } from "../game/runtime/weapon-projectile-renderer";
import { paintStaticTile, type StaticTileTreeBounds } from "../game/runtime/static-tile-painter";
import { mapVisualTheme } from "../game/map-design";
import type { WorldDecor } from "../game/world";
import { playerDeathPose } from "../game/runtime/player-death-animation";
import { replayEventIndex, type GuildReplayTimeline } from "./guild-replay-timeline";

export type GuildReplayAssets = { player: PlayerAppearanceAssets; prepare: () => Promise<void>; trees: HTMLImageElement; treeBounds: () => StaticTileTreeBounds[] };
const WIDTH = 1000, HEIGHT = 640;
const DAMAGE_POPUP_SECONDS = .8;
const ARENA_ZOOM = .86;

/** Ground is cached at the display's resolution. Characters and equipped weapons
 * use the live renderer directly, with continuous aiming and attack clocks. */
export function createGuildBattlefieldRenderer(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, timeline: GuildReplayTimeline, split: number, assets: GuildReplayAssets, entrance?: GuildReplayEntrance) {
  const doc = canvas.ownerDocument;
  const ground = doc.createElement("canvas");
  const groundContext = ground.getContext("2d");
  const labels = createGuildReplayLabels(doc);
  const decor: WorldDecor[] = [];
  // Keep historical presentation, but new fights render actual combat positions:
  // cosmetic offsets used to make attacks appear outside their weapon's reach.
  const offsets = timeline.fighters.map((fighter, i) => {
    const index = i < split ? i : i - split;
    const count = i < split ? split : timeline.fighters.length - split;
    const rows = Math.min(5, count), columns = Math.ceil(count / rows);
    const row = index % rows, column = Math.floor(index / rows);
    let seed = 0;
    for (const letter of fighter.identity) seed = (Math.imul(seed, 31) + letter.charCodeAt(0)) >>> 0;
    return fighter.moveSpeed !== undefined || count === 1 ? { x: 0, y: 0 } : {
      x: (row % 2 ? 24 : -24) + seed % 13 - 6,
      y: (column - (columns - 1) / 2) * 104 / columns + (seed >>> 8) % 11 - 5,
    };
  });
  const stagger = (point: { x: number; y: number }, index: number) => ({
    x: point.x + offsets[index].x, y: point.y + offsets[index].y,
  });
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const frame of timeline.frames) for (const [i, position] of frame.actors.entries()) {
    const actor = stagger(position, i);
    bounds.minX = Math.min(bounds.minX, actor.x); bounds.maxX = Math.max(bounds.maxX, actor.x);
    bounds.minY = Math.min(bounds.minY, actor.y); bounds.maxY = Math.max(bounds.maxY, actor.y);
  }
  let viewWidth = 900, viewHeight = 576, ratio = 1;
  let horizontalScale = 1;
  const actorScale = 1;
  let project = (point: { x: number; y: number }) => point;

  let seed = 73421;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < 450; i++) {
    const x = random() * WIDTH, y = random() * HEIGHT;
    decor.push({ type: "grass", x, y, variant: i % 4, color: i % 3 ? "#30844d" : "#4a9a57" });
    if ((x < 80 || x > 920 || y < 80 || y > 570) && i % 3 === 0) decor.push({ type: "petal", x: x + 8, y: y + 4, variant: i % 3 });
  }
  for (const [x, y, size] of [[48, 145, .8], [955, 493, .9], [840, 588, .6], [154, 58, .7], [44, 418, .55], [925, 103, .5]]) decor.push({ type: "rock", x, y, s: size, variant: 0 });
  function resize() {
    const width = Math.max(1, canvas.clientWidth || 900), height = Math.max(1, canvas.clientHeight || width * HEIGHT / WIDTH);
    const dpr = canvasRenderPixelRatio(doc.defaultView?.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
    if (canvas.width === pixelWidth && canvas.height === pixelHeight && ground.width === pixelWidth) return;
    viewWidth = width; viewHeight = height; ratio = dpr;
    const parent = canvas.parentElement;
    const safeTop = parent && doc.defaultView ? parseFloat(doc.defaultView.getComputedStyle(parent).paddingTop) || 0 : 0;
    const left = Math.min(54, width * .14), top = Math.min(155 + safeTop, height * .4);
    const fieldW = Math.max(1, width - left * 2), fieldH = Math.max(1, height - top - Math.min(180, height * .32));
    // Keep attackers left and defenders right at every screen orientation.
    const spanX = Math.max(620, bounds.maxX - bounds.minX);
    const spanY = Math.max(344, bounds.maxY - bounds.minY);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    // Fit the battlefield to the available screen, not the character art.
    // Portrait replays use their height rather than squeezing the whole fight
    // into a short strip. This projection is fixed for the entire replay and
    // shared by movement, aiming, projectiles, and hit effects.
    horizontalScale = fieldW / spanX * ARENA_ZOOM;
    const verticalScale = fieldH / spanY * ARENA_ZOOM;
    project = point => ({ x: width / 2 + (point.x - centerX) * horizontalScale,
      y: top + fieldH / 2 + (point.y - centerY) * verticalScale });
    canvas.width = pixelWidth; canvas.height = pixelHeight; ground.width = pixelWidth; ground.height = pixelHeight;
    if (!groundContext) return;
    const groundScale = Math.max(pixelWidth / WIDTH, pixelHeight / HEIGHT);
    groundContext.setTransform(groundScale, 0, 0, groundScale, (pixelWidth - WIDTH * groundScale) / 2, (pixelHeight - HEIGHT * groundScale) / 2);
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
  function draw(time: number, showNames: boolean, entranceTime?: number) {
    resize();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(ground, 0, 0, viewWidth, viewHeight);
    const entering = entrance !== undefined && entranceTime !== undefined && entranceTime < entrance.duration;
    const actors = timeline.sample(time).map((actor, i) => {
      const position = project(stagger(actor, i));
      const walkSpeed = (timeline.fighters[i].moveSpeed ?? GUILD_MOVE_SPEED) * horizontalScale;
      const entry = entering ? guildEntrancePosition(entrance.arrivals[i], entranceTime, position, i < split ? 0 : 1, viewWidth, entrance.walking ? walkSpeed : undefined)
        : { ...position, visible: true, entering: false };
      return { ...actor, ...entry, moving: entry.entering || actor.moving };
    });
    const order = actors.map((_, i) => i).sort((a, b) => actors[a].y - actors[b].y);
    for (const i of order) {
      const actor = actors[i], fighter = timeline.fighters[i], diedAt = timeline.deaths[i];
      const deathAge = time - diedAt;
      if (!actor.visible || deathAge > 1.1) continue;
      const side = i < split ? 0 : 1;
      const eventIndex = replayEventIndex(timeline.attacks[i], time - .35, event => event.launch);
      const attack = actor.entering ? undefined : timeline.attacks[i].slice(eventIndex, eventIndex + 3).find(event => time >= event.launch - .12 && time <= event.launch + .30);
      const target = attack ? project(stagger(attack.to, attack.target)) : actors[actor.target];
      const aim = target ? Math.atan2(target.y - actor.y, target.x - actor.x) : side ? Math.PI : 0;
      const throwClock = attack ? Math.max(0, .42 - (time - (attack.launch - .12))) : 0;
      ctx.fillStyle = "#0b2e2438"; ctx.beginPath(); ctx.ellipse(actor.x, actor.y + 24 * actorScale, 17 * PLAYER_WORLD_SCALE * actorScale, 5 * PLAYER_WORLD_SCALE * actorScale, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      let alpha = 1;
      if (deathAge >= 0) {
        const pose = playerDeathPose(diedAt * 1000, time * 1000, fighter.identity);
        ctx.translate(actor.x, actor.y + 24 * actorScale); ctx.rotate(pose.bodyRotation); ctx.scale(1, pose.bodyScaleY); ctx.translate(-actor.x, -actor.y - 24 * actorScale);
        alpha = Math.max(0, 1 - Math.max(0, deathAge - .6) / .5);
      }
      drawStartingPlayer(ctx, assets.player, { ...fighter.appearance, x: actor.x, y: actor.y - 5 * actorScale,
        facing: aim, combatFacing: aim, moving: actor.moving && deathAge < 0, gameTime: (entranceTime ?? time) + i * .137,
        throwClock, alpha, scale: PLAYER_WORLD_SCALE * actorScale, smooth: true });
      ctx.restore();
    }
    // Paint labels after every character so neighboring sprites cannot cover them.
    for (const [i, actor] of actors.entries()) {
      if (!actor.visible || actor.hp <= 0) continue;
      const fighter = timeline.fighters[i];
      const barW = Math.min(80, Math.max(48, viewWidth / 5 - 14)), barH = WORLD_HEALTH_BAR_HEIGHT;
      const barY = actor.y - Math.max(24, 50 * actorScale), barX = actor.x - barW / 2;
      const fill = Math.round(barW * Math.max(0, Math.min(1, actor.hp / fighter.fighter.maxHp)));
      ctx.fillStyle = "rgba(0,0,0,.88)"; ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
      ctx.fillStyle = "#000"; ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = "#19d64b"; ctx.fillRect(barX, barY, fill, barH);
      ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(barX, barY, fill, 1);
      const health = `${formatCompactNumber(Math.ceil(actor.hp))} / ${formatCompactNumber(Math.ceil(fighter.fighter.maxHp))}`;
      labels.draw(ctx, `hp:${i}`, health, actor.x, healthBarTextY(barY, barH), barW - 2, 10, 2, ratio);
      if (showNames) {
        labels.draw(ctx, `name:${i}`, fighter.name, actor.x, barY - 10, barW + 12, 11, 3, ratio);
      }
    }
    // Launch before the authoritative hit: the projectile arrives as HP changes,
    // including simultaneous knockouts and when scrubbing backward.
    const start = replayEventIndex(timeline.shots, time - .5, event => event.launch);
    for (let i = start; i < timeline.shots.length; i++) {
      const shot = timeline.shots[i]; if (shot.launch > time) break;
      const from = project(stagger(shot.from, shot.actor)), to = project(stagger(shot.to, shot.target));
      const weapon = timeline.fighters[shot.actor].appearance?.rightHandItem || timeline.fighters[shot.actor].appearance?.leftHandItem;
      const kind = projectileKindForWeapon(timeline.fighters[shot.actor].weaponItem || weapon);
      if (time < shot.impact) {
        const progress = (time - shot.launch) / (shot.impact - shot.launch);
        const x = from.x + (to.x - from.x) * progress, y = from.y + (to.y - from.y) * progress;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        if (kind === "ARROW") paintArrowProjectile(ctx, x, y, angle);
        else if (kind === "ROCK") paintRockProjectile(ctx, assets.player.equipment[weapon!]?.sprite, weapon, x, y, angle + progress * Math.PI * 2);
      } else if (time - shot.impact < .16) {
        const progress = (time - shot.impact) / .16;
        ctx.globalAlpha = 1 - progress; ctx.strokeStyle = "#fff3c5"; ctx.lineWidth = 2;
        for (let ray = 0; ray < 4; ray++) { const angle = ray * Math.PI / 2 + .4; ctx.beginPath(); ctx.moveTo(to.x + Math.cos(angle) * (3 + progress * 5), to.y + Math.sin(angle) * (3 + progress * 5)); ctx.lineTo(to.x + Math.cos(angle) * (6 + progress * 7), to.y + Math.sin(angle) * (6 + progress * 7)); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
    }
    // Time-based events remain correct when seeking, restarting, or skipping frames.
    const damageStart = replayEventIndex(timeline.damage, time - DAMAGE_POPUP_SECONDS, event => event.time);
    ctx.save();
    ctx.font = '900 14px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
    for (let i = damageStart; i < timeline.damage.length; i++) {
      const hit = timeline.damage[i]; if (hit.time > time) break;
      const age = (time - hit.time) / DAMAGE_POPUP_SECONDS;
      const point = project(stagger(hit, hit.target));
      const x = point.x + ((hit.target % 3) - 1) * 9;
      const y = point.y - 28 - age * 30;
      ctx.globalAlpha = Math.min(1, (1 - age) * 3);
      const label = formatCompactNumber(Math.round(hit.amount));
      ctx.strokeText(label, x, y); ctx.fillText(label, x, y);
    }
    ctx.restore();
    return actors;
  }
  return { draw, dispose() { labels.dispose(); ground.width = 0; ground.height = 0; } };
}
