// Times the game's own world drawing on real maps, as the game draws it (its canvas runtime and WebGL world layer),
// walking the player in a circle. perf.mjs runs it in Chrome and prints the table; ?maps= and ?frames= narrow it.
import { realNow } from "./determinism";
import { mapView } from "./game-world";
import { GUILD_HALL_PARTS, guildHallMapId, isGuildHallMap, type GuildHallLevels } from "../../shared/guild-hall";
import { guildHallDecor } from "../../src/game/guild-hall";
import { resetCameraZoomPreference, stepCameraZoom } from "../../src/game/runtime/render/camera-zoom-preference";
import type { MapId } from "../../src/game/world";

declare global {
  interface Window { __perfResults?: PerfResult[] }
}

export type PerfResult = {
  map: string; zoom: number; variant: string; renderer: string; cameraZoom: number;
  workMs: number; workP95: number; frameMs: number; frameP95: number; frames: number;
};

const MAPS = ["tutorial_forest", "beginner_desert", "town", "moonfen", "ion_citadel", guildHallMapId(1)];
/** Tall props: what each frame places and sorts by depth, unlike the baked ground. */
const TALL = new Set(["tree", "cactus", "snowPine", "station", "charredTree", "soulProp", "oreRock", "woodTree", "starterChest"]);
const VARIANTS: readonly { name: string; zoom: number; arrange?: (state: { enemies: unknown[]; decor: { type: string }[] }) => void }[] = [
  { name: "full", zoom: 0 },
  { name: "full", zoom: -10 },
  { name: "no tall props", zoom: -10, arrange: state => { state.decor.splice(0, state.decor.length, ...state.decor.filter(item => !TALL.has(item.type))); } },
  { name: "no enemies", zoom: -10, arrange: state => { state.enemies.length = 0; } },
];

/** A guild hall is timed fully upgraded: every prop its courtyard can show. */
const MAX_HALL = Object.fromEntries(GUILD_HALL_PARTS.map(part => [part.id, part.levels.length - 1])) as GuildHallLevels;
const furnish = (mapId: string, decor: { type: string; sheet?: string }[]) => {
  if (!isGuildHallMap(mapId)) return;
  decor.splice(0, decor.length, ...decor.filter(item => item.sheet !== "hall"), ...guildHallDecor(MAX_HALL) as never[]);
};

const frame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};
const round = (value: number) => Math.round(value * 100) / 100;

export async function perf() {
  const params = new URLSearchParams(location.search);
  const maps = params.get("maps")?.split(",").filter(Boolean) ?? MAPS;
  const frames = Number(params.get("frames") ?? 150);
  const results: PerfResult[] = [];
  for (const mapId of maps) {
    for (const variant of VARIANTS) {
      const view = await mapView({
        mapId: mapId as MapId, width: innerWidth, height: innerHeight, title: `${mapId} · ${variant.name}`, gameRuntime: true,
        minimap: null, arrange: state => { furnish(mapId, state.decor as never); variant.arrange?.(state as never); },
      });
      await view.draw();
      for (let step = 0; step < Math.abs(variant.zoom); step += 1) stepCameraZoom(Math.sign(variant.zoom) as 1 | -1);
      const player = view.state.player;
      const centre = { x: player.x, y: player.y };
      const work: number[] = [], intervals: number[] = [];
      let last = await frame();
      for (let index = 0; index < frames + 20; index += 1) {
        const angle = index / 60 * 250 / 300;
        player.x = centre.x + Math.cos(angle) * 300;
        player.y = centre.y + Math.sin(angle) * 300;
        const started = realNow();
        view.renderFrame();
        const spent = realNow() - started;
        const now = await frame();
        // The first frames load and bake what the walk first meets.
        if (index >= 20) { work.push(spent); intervals.push(now - last); }
        last = now;
      }
      results.push({
        map: mapId, zoom: variant.zoom, variant: variant.name, renderer: view.renderer(), cameraZoom: round(view.camera.zoom),
        workMs: round(quantile(work, .5)), workP95: round(quantile(work, .95)),
        frameMs: round(quantile(intervals, .5)), frameP95: round(quantile(intervals, .95)), frames: work.length,
      });
      resetCameraZoomPreference();
      localStorage.clear();
      // ?keep leaves the last view on the page, to see what was timed.
      if (!(params.has("keep") && mapId === maps.at(-1) && variant === VARIANTS.at(-1))) view.dispose();
    }
  }
  window.__perfResults = results;
}
