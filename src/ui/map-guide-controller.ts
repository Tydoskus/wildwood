import { regularMapLoot } from "../../shared/regular-map-loot";
import { generateMap, isProceduralMap, proceduralMapId, proceduralMapNumber } from "../../shared/procedural-maps";
import { CAMPAIGN_GATEWAYS } from "../../shared/map-gateways";
import { MAP_IDS as CAMPAIGN_MAP_IDS } from "../../shared/rules";
import { bossForMap } from "../game/runtime/boss-registry";
import { enemyIndexRows } from "../game/runtime/enemy-index-rows";
import type { EnemyState } from "../game/runtime/types";
import type { MapBalanceSnapshot } from "../../shared/map-balance-types";
import { renderEnemyIndexRows } from "./map-enemy-index";
import { canvasRenderPixelRatio } from "../game/runtime/render-budget";
import {
  FROST_ARMOR,
  FROST_BOW,
  ITEM_DEFINITIONS,
  LAVA_BOSS_ITEM_DROP_DENOMINATOR,
  LAVA_BOW,
  SNOW_BOSS_ARMOR_DROP_DENOMINATOR,
  SNOW_BOSS_ITEM_DROP_DENOMINATOR,
  type ItemDefinition,
  type ItemId,
} from "../../shared/items";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../../shared/rules";
// The guide shows campaign and Endless maps, every one the classic square, wherever the player stands
// (the Town's or a guild hall's own world is a different size).
const WORLD = { w: WORLD_WIDTH, h: WORLD_HEIGHT };
import { createSpawnSites, createWorldLayout, mapSpawnCamps } from "../game/world";
import { ENEMY_TYPES, REWARD_DATA, type RewardType } from "../game/enemies";
import { itemPresentation } from "../game/item-presentation";
import { drawPortalMapMarker } from "../game/portal-presentation";
import { createLootFilterWindow, type LootFilterPort } from "./loot-filter-window";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  MOONFEN_MAP_ID,
  CRYSTAL_HOLLOWS_MAP_ID, CLOCKWORK_RUINS_MAP_ID, DUSKFALL_ORCHARD_MAP_ID, NEON_BASTION_MAP_ID, VERDANT_CATACOMBS_MAP_ID, ION_CITADEL_MAP_ID,
  SAMURAI_GARDEN_MAP_ID,
  TUTORIAL_FOREST_MAP_ID,
  WATER_REACH_MAP_ID,
  type MapId,
  type SpawnSite,
  type WorldPath,
} from "../game/world";

type MapGuideElements = {
  trigger: HTMLButtonElement;
  overlay: HTMLElement;
  title: HTMLElement;
  canvas: HTMLCanvasElement;
  zoneLabels: HTMLElement;
  dropItems: HTMLElement;
  back: HTMLButtonElement;
};

type MapGuidePoint = { x: number; y: number };
type MapGuideBoss = (MapGuidePoint & { name: string; dead?: boolean }) | null;
type MapGuidePortal = MapGuidePoint & { destination: MapId; unlocked: boolean };

type MapGuideDependencies = {
  currentMapId: () => MapId;
  mapName: (mapId: MapId) => string;
  paths: WorldPath[];
  spawnSites: SpawnSite[];
  player: MapGuidePoint;
  boss: () => MapGuideBoss;
  portals: () => MapGuidePortal[];
  beforeOpen: () => void;
  clearPlayerInput: () => void;
  /** The coop session, for the account's loot filter. Without it the map has no Loot filter button. */
  lootFilter?: LootFilterPort | null;
  /** The live enemies of the player's map, for its Enemy Index; other maps read the shipped balance. */
  enemies?: readonly EnemyState[];
  /** What a kill's reward is worth to the player, as enemy labels show it. */
  rewardAmount?: (type: RewardType, amount: number) => number;
  /** Whether the player has opened a map: browsing goes back to any map and one past the furthest open. */
  mapUnlocked?: (mapId: MapId) => boolean;
  /** Another map's live balance, for its Enemy Index (null when it cannot load). */
  mapBalance?: (mapId: MapId) => Promise<MapBalanceSnapshot | null>;
};

export type MapGuideDrop = {
  itemId: ItemId;
  denominator: number;
  numerator?: number;
  source: string;
};

export type MapGuideZone = {
  name: string;
  x: number;
  y: number;
  radius: number;
  rewards: { type: RewardType; label: string; color: string }[];
};

const MAP_GUIDE_DROPS: Record<MapId, readonly MapGuideDrop[]> = {
  first_steps: [],
  home_exterior: [],
  soul_dimension: [],
  town: [],
  [TUTORIAL_FOREST_MAP_ID]: [
  ],
  [BEGINNER_DESERT_MAP_ID]: [
  ],
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: [
    { itemId: FROST_ARMOR, denominator: SNOW_BOSS_ARMOR_DROP_DENOMINATOR, source: "Boss" },
    { itemId: FROST_BOW, denominator: SNOW_BOSS_ITEM_DROP_DENOMINATOR, source: "Boss" },
  ],
  [ADVANCED_LAVA_WASTES_MAP_ID]: [
    { itemId: LAVA_BOW, denominator: LAVA_BOSS_ITEM_DROP_DENOMINATOR, source: "Boss" },
  ],
  [INFERNAL_DEPTHS_MAP_ID]: [
  ],
  [WATER_REACH_MAP_ID]: [],
  [SAMURAI_GARDEN_MAP_ID]: [],
  [CLOUDSPIRE_MAP_ID]: [],
  [MOONFEN_MAP_ID]: [],
  [CRYSTAL_HOLLOWS_MAP_ID]: [], [CLOCKWORK_RUINS_MAP_ID]: [], [DUSKFALL_ORCHARD_MAP_ID]: [], [NEON_BASTION_MAP_ID]: [], [VERDANT_CATACOMBS_MAP_ID]: [], [ION_CITADEL_MAP_ID]: [],
};

const MAP_GUIDE_THEMES: Record<MapId, { ground: string; path: string; glow: string }> = {
  first_steps: { ground: "#31945b", path: "#8b6551", glow: "#65e889" },
  home_exterior: { ground: "#488761", path: "#b29a78", glow: "#82e9ff" },
  soul_dimension: { ground: "#1f1733", path: "#3b2b55", glow: "#c48cff" },
  town: { ground: "#61864e", path: "#b89070", glow: "#ffd27a" },
  [TUTORIAL_FOREST_MAP_ID]: { ground: "#31945b", path: "#8b6551", glow: "#65e889" },
  [BEGINNER_DESERT_MAP_ID]: { ground: "#d9a95f", path: "#c48b4b", glow: "#ffe09a" },
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: { ground: "#bfddeb", path: "#8fb7d0", glow: "#e9fbff" },
  [ADVANCED_LAVA_WASTES_MAP_ID]: { ground: "#f5b255", path: "#df754b", glow: "#ffd077" },
  [INFERNAL_DEPTHS_MAP_ID]: { ground: "#100e17", path: "#261a26", glow: "#8f83a6" },
  [WATER_REACH_MAP_ID]: { ground: "#238c9a", path: "#d5c58e", glow: "#7af6f1" },
  [SAMURAI_GARDEN_MAP_ID]: { ground: "#78a76f", path: "#d9c8ae", glow: "#ff91c4" },
  [CLOUDSPIRE_MAP_ID]: { ground: "#537eac", path: "#dbe7ef", glow: "#8edcff" },
  [MOONFEN_MAP_ID]: { ground: "#174f50", path: "#607d6b", glow: "#79efc3" },
  [CRYSTAL_HOLLOWS_MAP_ID]: { ground: "#303347", path: "#626781", glow: "#c3a6ff" }, [CLOCKWORK_RUINS_MAP_ID]: { ground: "#303347", path: "#626781", glow: "#c3a6ff" }, [DUSKFALL_ORCHARD_MAP_ID]: { ground: "#303347", path: "#626781", glow: "#c3a6ff" }, [NEON_BASTION_MAP_ID]: { ground: "#101528", path: "#23324b", glow: "#4ef7ff" }, [VERDANT_CATACOMBS_MAP_ID]: { ground: "#101528", path: "#23324b", glow: "#4ef7ff" }, [ION_CITADEL_MAP_ID]: { ground: "#101528", path: "#23324b", glow: "#4ef7ff" },
};

const MAP_GUIDE_REWARD_LABELS: Record<RewardType, string> = {
  damage: "Damage",
  health: "Max Health",
  speed: "Atk Speed",
  armor: "Armor",
  regen: "Regen",
};

/**
 * The maps the window can show, in order: the campaign, then every Endless map
 * opened and the one after it. It shows back to the first and forward to one
 * past the furthest the player has opened (that one marked Locked).
 */
export function mapGuideBrowseRange(unlocked: (mapId: MapId) => boolean) {
  const maps: MapId[] = [...CAMPAIGN_MAP_IDS] as MapId[];
  for (let number = 1; number <= 100_000; number += 1) {
    maps.push(proceduralMapId(number) as MapId);
    if (!unlocked(proceduralMapId(number) as MapId)) break;
  }
  let furthest = 0;
  maps.forEach((mapId, index) => { if (index === 0 || unlocked(mapId)) furthest = index; });
  return { maps, last: Math.min(maps.length - 1, furthest + 1) };
}

export function mapGuideDrops(mapId: MapId): readonly MapGuideDrop[] {
  if (isProceduralMap(mapId)) return [];
  const regularDrops = regularMapLoot(mapId).map<MapGuideDrop>(({ itemId, wins, outcomes }) => ({
    itemId,
    numerator: wins,
    denominator: outcomes,
    source: "Any regular enemy",
  }));
  return [...regularDrops, ...(MAP_GUIDE_DROPS[mapId] ?? [])];
}

/**
 * Groups the live spawn layout into readable reward zones for the enlarged map.
 * With the camps' regions given, a zone is its region; enemies fill whole
 * regions now, and a circle fitted round them overlapped its neighbours.
 */
export function mapGuideZones(spawnSites: readonly SpawnSite[], regions: readonly { name: string; x: number; y: number; radius: number }[] = []): MapGuideZone[] {
  const groups = new Map<string, SpawnSite[]>();
  for (const site of spawnSites) {
    const group = groups.get(site.campName);
    if (group) group.push(site);
    else groups.set(site.campName, [site]);
  }

  return [...groups.entries()].map(([name, sites]) => {
    const region = regions.find((camp) => camp.name === name);
    const x = region?.x ?? sites.reduce((sum, site) => sum + site.x, 0) / sites.length;
    const y = region?.y ?? sites.reduce((sum, site) => sum + site.y, 0) / sites.length;
    const radius = region ? Math.max(120, region.radius)
      : Math.max(120, ...sites.map((site) => Math.hypot(site.x - x, site.y - y) + 80));
    const rewardTypes = new Set<RewardType>();
    for (const site of sites) rewardTypes.add((site.definition ?? ENEMY_TYPES[site.type]).reward.type);
    const rewards = [...rewardTypes].map((type) => ({
      type,
      label: MAP_GUIDE_REWARD_LABELS[type],
      color: REWARD_DATA[type].color,
    }));
    return { name, x, y, radius, rewards };
  });
}

export function mapGuideDropChance(denominator: number, numerator = 1) {
  const percent = 100 * numerator / denominator;
  const precision = Number.isInteger(percent) ? 0 : percent < 1 ? 2 : 1;
  return `${percent.toFixed(precision)}%`;
}

function bonusLabel(value: number) {
  return `+${Math.round(value * 10000) / 100}%`;
}

export function mapGuideItemStats(itemId: ItemId) {
  const item: ItemDefinition = ITEM_DEFINITIONS[itemId];
  const stats: string[] = [];
  const damageBonus = item.weapon?.damageMultiplierBonus ?? item.modifiers?.damageMultiplierBonus;
  if (damageBonus !== undefined) stats.push(`Damage +${Math.round(damageBonus * 10000) / 100}%`);
  if (item.modifiers?.maxHealthMultiplierBonus !== undefined) stats.push(`Max Health ${bonusLabel(item.modifiers.maxHealthMultiplierBonus)}`);
  if (item.modifiers?.regenerationMultiplierBonus !== undefined) stats.push(`Regen ${bonusLabel(item.modifiers.regenerationMultiplierBonus)}`);
  return stats;
}

function displayItemName(itemId: ItemId) {
  return ITEM_DEFINITIONS[itemId].name.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Owns the clickable minimap help surface and its compact full-window guide. */
export function createMapGuideController(elements: MapGuideElements, dependencies: MapGuideDependencies) {
  const { trigger, overlay, title, canvas, zoneLabels, dropItems, back } = elements;
  const prev = overlay.querySelector<HTMLButtonElement>("#mapGuidePrev");
  const next = overlay.querySelector<HTMLButtonElement>("#mapGuideNext");
  const kicker = overlay.querySelector<HTMLElement>("#mapGuideKicker");
  const enemyRows = overlay.querySelector<HTMLElement>("#mapGuideEnemyRows");
  const unlocked = (mapId: MapId) => dependencies.mapUnlocked?.(mapId) ?? true;
  /** The map being shown: the player's own when the window opens, then wherever the arrows go. */
  let viewed: MapId | null = null;
  const shown = () => viewed ?? dependencies.currentMapId();
  const live = () => shown() === dependencies.currentMapId();
  // Another map's layout, built once: its paths and camps never change while it is not loaded.
  const layouts = new Map<MapId, { paths: WorldPath[]; sites: SpawnSite[] }>();
  function layoutOf(mapId: MapId) {
    if (live()) return { paths: dependencies.paths, sites: dependencies.spawnSites };
    let layout = layouts.get(mapId);
    if (!layout) layouts.set(mapId, layout = { paths: createWorldLayout({ x: 0, y: 0 }, mapId).paths, sites: createSpawnSites({ x: 0, y: 0 }, mapId) });
    return layout;
  }
  function portalsOf(mapId: MapId): MapGuidePortal[] {
    if (live()) return dependencies.portals();
    const gateways = CAMPAIGN_GATEWAYS[mapId] ?? (isProceduralMap(mapId) ? generateMap(mapId) : null);
    return (gateways?.portals ?? []).map(portal => ({ x: portal.x, y: portal.y, destination: portal.destination as MapId, unlocked: unlocked(portal.destination as MapId) }));
  }
  function bossOf(mapId: MapId): MapGuideBoss {
    if (live()) return dependencies.boss();
    if (isProceduralMap(mapId)) return { ...generateMap(mapId).boss, name: "Boss" };
    const boss = bossForMap(mapId);
    return boss ? { ...boss.spawn, name: boss.name } : null;
  }
  const dropsHeader = dropItems.parentElement?.querySelector("header");
  const lootFilter = dropsHeader
    ? createLootFilterWindow({ anchor: dropsHeader, cards: dropItems, port: () => dependencies.lootFilter })
    : null;

  function renderZoneLabels(zones: MapGuideZone[], boss: MapGuideBoss) {
    const labels = zones.map((zone) => {
      const label = document.createElement("div");
      label.className = "map-guide-zone-label";
      label.style.setProperty("--map-x", String(zone.x / WORLD.w));
      label.style.setProperty("--map-y", String(zone.y / WORLD.h));
      label.setAttribute("role", "listitem");
      label.setAttribute("aria-label", zone.rewards.map((reward) => reward.label).join(", "));
      const rewards = document.createElement("span");
      rewards.className = "map-guide-zone-rewards";
      zone.rewards.forEach((reward, index) => {
        if (index > 0) rewards.append(document.createTextNode(" · "));
        const rewardLabel = document.createElement("span");
        rewardLabel.style.color = reward.color;
        rewardLabel.textContent = reward.label;
        rewards.append(rewardLabel);
      });
      label.append(rewards);
      return label;
    });
    if (boss) {
      const bossLabel = document.createElement("div");
      bossLabel.className = `map-guide-boss-label${boss.dead ? " is-defeated" : ""}`;
      bossLabel.style.setProperty("--map-x", String(boss.x / WORLD.w));
      bossLabel.style.setProperty("--map-y", String(boss.y / WORLD.h));
      bossLabel.textContent = "Boss";
      bossLabel.setAttribute("role", "listitem");
      labels.push(bossLabel);
    }
    zoneLabels.replaceChildren(...labels);
  }

  function renderDrops(mapId: MapId) {
    const cards = mapGuideDrops(mapId).map((drop) => {
      const card = document.createElement("article");
      card.className = "map-guide-drop-card";
      card.dataset.itemId = drop.itemId;

      const art = document.createElement("div");
      art.className = "map-guide-drop-art";
      const artSource = itemPresentation(drop.itemId)?.inventory.source;
      if (artSource) {
        const image = document.createElement("img");
        image.src = artSource;
        image.alt = "";
        image.draggable = false;
        art.append(image);
      }

      const copy = document.createElement("div");
      copy.className = "map-guide-drop-copy";
      const heading = document.createElement("h4");
      heading.textContent = displayItemName(drop.itemId);
      const source = document.createElement("p");
      source.textContent = `From: ${drop.source}`;
      const stats = document.createElement("div");
      stats.className = "map-guide-drop-stats";
      for (const stat of mapGuideItemStats(drop.itemId)) {
        const statLabel = document.createElement("span");
        statLabel.textContent = stat;
        stats.append(statLabel);
      }
      copy.append(heading, source, stats);

      const chance = document.createElement("div");
      chance.className = "map-guide-drop-chance";
      const chanceLabel = document.createElement("span");
      chanceLabel.textContent = "Drop Chance";
      const chanceValue = document.createElement("strong");
      chanceValue.textContent = mapGuideDropChance(drop.denominator, drop.numerator);
      chance.append(chanceLabel, chanceValue);

      card.append(art, copy, chance);
      return card;
    });
    dropItems.replaceChildren(...cards);
  }

  function drawMap() {
    if (overlay.hidden) return;
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const dpr = canvasRenderPixelRatio(globalThis.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    const mapId = shown();
    const layout = layoutOf(mapId);
    const theme = isProceduralMap(mapId) ? { ...generateMap(mapId).palette, glow: generateMap(mapId).palette.accent } : MAP_GUIDE_THEMES[mapId] ?? MAP_GUIDE_THEMES.town;
    const scaleX = width / WORLD.w;
    const scaleY = height / WORLD.h;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    context.fillStyle = theme.ground;
    context.fillRect(0, 0, width, height);

    context.fillStyle = theme.path;
    for (const path of layout.paths) {
      context.fillRect(path.x * scaleX, path.y * scaleY, path.w * scaleX, path.h * scaleY);
    }

    const zones = mapGuideZones(layout.sites, mapSpawnCamps(mapId));
    for (const zone of zones) {
      const radius = Math.max(16, zone.radius * Math.min(scaleX, scaleY));
      const color = zone.rewards[0]?.color ?? theme.glow;
      context.save();
      context.fillStyle = `${color}24`;
      context.strokeStyle = `${color}b8`;
      context.lineWidth = 2;
      context.setLineDash([5, 4]);
      context.beginPath();
      context.arc(zone.x * scaleX, zone.y * scaleY, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }

    for (const portal of portalsOf(mapId)) {
      const x = portal.x * scaleX;
      const y = portal.y * scaleY;
      drawPortalMapMarker(context, Math.round(x), Math.round(y), portal.destination, portal.unlocked, 2);
    }

    const boss = bossOf(mapId);
    if (boss) {
      const isGloomroot = mapId === INFERNAL_DEPTHS_MAP_ID;
      const isTempestKirin = mapId === CLOUDSPIRE_MAP_ID;
      context.save();
      context.globalAlpha = boss.dead ? .45 : 1;
      context.fillStyle = isGloomroot ? "#69f0e7" : isTempestKirin ? "#72d4ff" : "#ff765c";
      context.strokeStyle = isGloomroot || isTempestKirin ? "#e5fbff" : "#38100d";
      context.lineWidth = 3;
      context.beginPath();
      context.arc(boss.x * scaleX, boss.y * scaleY, isGloomroot || isTempestKirin ? 12 : 9, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }

    // The player's dot only on the map they stand on.
    if (live()) {
      context.fillStyle = "#fff";
      context.strokeStyle = "#0a1510";
      context.lineWidth = 3;
      context.beginPath();
      context.arc(dependencies.player.x * scaleX, dependencies.player.y * scaleY, 6, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }

    renderZoneLabels(zones, boss);
  }

  function render() {
    const mapId = shown();
    const { maps, last } = mapGuideBrowseRange(unlocked);
    const index = maps.indexOf(mapId);
    title.textContent = dependencies.mapName(mapId);
    const place = isProceduralMap(mapId) ? `Endless ${proceduralMapNumber(mapId)}` : `Map ${CAMPAIGN_MAP_IDS.indexOf(mapId as never) + 1} of ${CAMPAIGN_MAP_IDS.length}`;
    if (kicker) kicker.textContent = index > 0 && !unlocked(mapId) ? `${place} · Locked` : live() ? `${place} · You are here` : place;
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index < 0 || index >= last;
    if (enemyRows) renderEnemyRows(mapId);
    renderDrops(mapId);
    lootFilter?.setMap(dependencies.mapName(mapId), mapGuideDrops(mapId).map((drop) => drop.itemId));
    drawMap();
  }

  // Other maps' live balances as they arrive; the table says Loading until then.
  const balances = new Map<MapId, MapBalanceSnapshot | null>();
  function renderEnemyRows(mapId: MapId) {
    if (!enemyRows) return;
    const paid = dependencies.rewardAmount ?? ((_type: RewardType, amount: number) => amount);
    if (live()) { renderEnemyIndexRows(document, enemyRows, enemyIndexRows(mapId, dependencies.enemies ?? [], paid, null, dependencies.spawnSites)); return; }
    if (!dependencies.mapBalance || balances.has(mapId)) {
      renderEnemyIndexRows(document, enemyRows, enemyIndexRows(mapId, null, paid, balances.get(mapId)));
      return;
    }
    const loading = document.createElement("tr");
    loading.append(Object.assign(document.createElement("td"), { colSpan: 4, className: "enemy-index-loading", textContent: "Loading…" }));
    enemyRows.replaceChildren(loading);
    void dependencies.mapBalance(mapId).then(balance => {
      balances.set(mapId, balance);
      if (shown() === mapId && !overlay.hidden) renderEnemyRows(mapId);
    });
  }

  /** Shows the map `step` along: back to any map, forward to one past the furthest open. */
  function browse(step: number) {
    const { maps, last } = mapGuideBrowseRange(unlocked);
    const index = maps.indexOf(shown());
    const target = index < 0 ? 0 : Math.max(0, Math.min(last, index + step));
    if (target === index) return;
    viewed = maps[target];
    render();
  }

  function open() {
    if (!overlay.hidden) return;
    dependencies.beforeOpen();
    dependencies.clearPlayerInput();
    // Always opens on the player's own map; Home has no map of its own, so the furthest open one.
    const { maps } = mapGuideBrowseRange(unlocked);
    viewed = maps.includes(dependencies.currentMapId()) ? null : maps.filter((mapId, index) => index === 0 || unlocked(mapId)).pop() ?? null;
    overlay.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    render();
    requestAnimationFrame(drawMap);
    back.focus({ preventScroll: true });
  }

  function close() {
    if (overlay.hidden) return;
    lootFilter?.close();
    overlay.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", open);
  prev?.addEventListener("click", () => browse(-1));
  next?.addEventListener("click", () => browse(1));
  // Arrow keys browse too, on a keyboard.
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); browse(-1); }
    else if (event.key === "ArrowRight") { event.preventDefault(); browse(1); }
  });
  back.addEventListener("click", () => {
    close();
    trigger.focus({ preventScroll: true });
  });
  new ResizeObserver(drawMap).observe(canvas);

  return { open, close, isOpen: () => !overlay.hidden, render };
}
