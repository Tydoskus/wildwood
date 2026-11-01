import { regularMapLoot } from "../../shared/regular-map-loot";
import { generateMap, isProceduralMap, proceduralMapId, proceduralMapNumber } from "../../shared/procedural-maps";
import { CAMPAIGN_GATEWAYS } from "../../shared/map-gateways";
import { MAP_IDS as CAMPAIGN_MAP_IDS } from "../../shared/rules";
import { bossForMap } from "../game/runtime/boss/boss-registry";
import { enemyIndexRows } from "../game/runtime/enemies/enemy-index-rows";
import type { EnemyState } from "../game/runtime/types";
import type { MapBalanceSnapshot } from "../../shared/map-balance-types";
import { renderEnemyIndexRows } from "./map-enemy-index";
import { canvasRenderPixelRatio } from "../game/runtime/render/render-budget";
import { ITEM_DEFINITIONS, type ItemDefinition, type ItemId } from "../../shared/items";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../../shared/rules";
// The guide shows campaign and Endless maps, every one the classic square, wherever the player stands
// (the Town's or a guild hall's own world is a different size).
const WORLD = { w: WORLD_WIDTH, h: WORLD_HEIGHT };
import { createSpawnSites, createWorldLayout, mapSpawnCamps } from "../game/world";
import { ENEMY_TYPES, REWARD_DATA, type RewardType } from "../game/enemies";
import { itemArtImage, itemPresentation } from "../game/item-presentation";
import { drawPortalMapMarker } from "../game/portal-presentation";
import { liveRewardText, type RewardLabelContext } from "../game/runtime/reward-labels";
import { recommendedMapPower } from "../game/runtime/auto-farm/auto-farm-power";
import { prestigeRequirementHint } from "../../shared/prestige";
import { formatCompactNumber, formatMultiplier } from "../../shared/compact-number";
import { baseName, unlockedBy } from "./travel-controller";
import { isTownMap, TOWN_WALK_AREA } from "../../shared/town";
import { drawTownWorldMap, TOWN_MAP_ASPECT, TOWN_MAP_PLACES, townMapFraction } from "./town-world-map";
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
  /** The village's baked ground, for the Town's own page. */
  villageGround?: () => HTMLImageElement | undefined;
  beforeOpen: () => void;
  clearPlayerInput: () => void;
  /** Whether the player has ever had this item, for the Gear Collection marks on the drops. */
  collected?: (itemId: string) => boolean;
  /** The live enemies of the player's map, for its Enemy Index; other maps read the shipped balance. */
  enemies?: readonly EnemyState[];
  /** What a kill's reward is worth to the player, as enemy labels show it. */
  rewardAmount?: (type: RewardType, amount: number) => number;
  /** What attack speed and crit rewards are worked out from, so the Enemy Index shows what a kill gives now (reward-labels.ts). */
  rewardContext?: () => RewardLabelContext;
  /** Whether the player has opened a map: browsing goes back to any map and one past the furthest open. */
  mapUnlocked?: (mapId: MapId) => boolean;
  /** Another map's live balance, for its Enemy Index (null when it cannot load). */
  mapBalance?: (mapId: MapId) => Promise<MapBalanceSnapshot | null>;
  /** The player's power, beside the shown map's recommended power. */
  power?: () => number;
  /** What the Next Goal reads for Prestige: the coop session, and whether its level cap is lifted. */
  progress?: MapGuideProgress | null;
  prestigeExpanded?: () => boolean;
  /** The Travel button: straight to the map, with the Town travel portal's checks. */
  travel?: MapGuideTravelPort;
};
export type MapGuideProgress = {
  prestige?: () => { level?: number } | null | undefined;
  prestigeCampaignComplete?: (nextLevel: number) => boolean;
  proceduralCompleted?: () => number;
};
export type MapGuideTravelPort = {
  /** The map the Travel picker opens on next. */
  prefer: (mapId: MapId) => void;
  /** Travels to the map; false when it could not. */
  travel: (mapId: MapId) => Promise<boolean>;
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
  crit: "Crit Damage",
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

/**
 * The player's next goal, from the maps they have open: the boss that opens the next campaign map, then
 * Endless, then the next Endless stage. Once the campaign is open, what Prestige needs too.
 */
export function mapGuideNextGoal(unlocked: (mapId: MapId) => boolean, mapName: (mapId: MapId) => string, progress?: MapGuideProgress | null, expanded = false) {
  const next = CAMPAIGN_MAP_IDS.findIndex((mapId, index) => index > 0 && !unlocked(mapId as MapId));
  if (next > 0) return { goal: `${unlockedBy(next - 1, mapName)} to unlock ${baseName(CAMPAIGN_MAP_IDS[next], mapName)}`, prestige: "" };
  const level = progress?.prestige?.()?.level ?? 0;
  const hint = prestigeRequirementHint(Boolean(progress?.prestigeCampaignComplete?.(level + 1)), progress?.proceduralCompleted?.() ?? 0, level + 1, undefined, expanded);
  const prestige = hint.replace(/\.$/, "") || "Prestige is ready in your Profile";
  if (!unlocked(proceduralMapId(1) as MapId)) return { goal: `${unlockedBy(CAMPAIGN_MAP_IDS.length - 1, mapName)} to unlock Endless`, prestige };
  const { maps } = mapGuideBrowseRange(unlocked);
  const stage = maps.filter(mapId => isProceduralMap(mapId) && unlocked(mapId)).length;
  return { goal: `Defeat the Endless ${stage} boss to unlock Endless ${stage + 1}`, prestige };
}

/** The Travel button for the shown map: none on the player's own map, Locked past the open ones. */
export function mapGuideTravelButton(shown: MapId, current: MapId, unlocked: boolean) {
  if (shown === current) return null;
  if (!unlocked) return { label: "Locked", disabled: true };
  return { label: "Travel", disabled: false };
}

/** What the map's regular enemies drop. Gear is not among it: that is bought at the Smith. */
export function mapGuideDrops(mapId: MapId): readonly MapGuideDrop[] {
  if (isProceduralMap(mapId)) return [];
  return regularMapLoot(mapId).map<MapGuideDrop>(({ itemId, wins, outcomes }) => ({
    itemId,
    numerator: wins,
    denominator: outcomes,
    source: "Any regular enemy",
  }));
}

/**
 * Groups the live spawn layout into readable reward zones for the enlarged map.
 * With the camps' regions given, a zone is its region; enemies fill whole
 * regions, and a circle fitted round them would overlap its neighbours.
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
  return formatMultiplier(1 + value);
}

export function mapGuideItemStats(itemId: ItemId) {
  const item: ItemDefinition = ITEM_DEFINITIONS[itemId];
  const stats: string[] = [];
  const damageBonus = item.weapon?.damageMultiplierBonus ?? item.modifiers?.damageMultiplierBonus;
  if (damageBonus !== undefined) stats.push(`Damage ${bonusLabel(damageBonus)}`);
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
  /** The maps the arrows step through; from the Town, its own page comes first. */
  function browseRange() {
    const range = mapGuideBrowseRange(unlocked);
    return isTownMap(dependencies.currentMapId()) ? { maps: ["town" as MapId, ...range.maps], last: range.last + 1 } : range;
  }
  const mapFrame = canvas.parentElement;
  const enemySection = enemyRows?.closest("section"), dropSection = dropItems.closest("section");
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
  // The Next Goal, the shown map's recommended power and its Travel button, above the map.
  const goalBlock = document.createElement("section");
  goalBlock.className = "map-guide-goal";
  goalBlock.setAttribute("aria-label", "Next Goal");
  goalBlock.innerHTML = `<h3>Next Goal</h3><p class="map-guide-goal-text"></p><p class="map-guide-goal-prestige" hidden></p>`
    + `<p class="map-guide-goal-power" hidden></p><div class="map-guide-travel" hidden><button type="button" class="map-guide-travel-button"></button>`
    + `<p class="map-guide-travel-hint" aria-live="polite" hidden></p></div>`;
  canvas.closest(".map-guide-content")?.prepend(goalBlock);
  const goalPart = <T extends HTMLElement>(selector: string) => goalBlock.querySelector<T>(selector)!;
  const travelButton = goalPart<HTMLButtonElement>(".map-guide-travel-button"), travelHint = goalPart(".map-guide-travel-hint");
  /** What the last Travel tap said, for the map it was for. */
  let travelNote: { mapId: MapId; text: string } | null = null;
  function renderGoal(mapId: MapId) {
    const { goal, prestige } = mapGuideNextGoal(unlocked, dependencies.mapName, dependencies.progress, dependencies.prestigeExpanded?.() ?? false);
    goalPart(".map-guide-goal-text").textContent = goal;
    Object.assign(goalPart(".map-guide-goal-prestige"), { textContent: prestige, hidden: !prestige });
    const recommended = dependencies.power ? recommendedMapPower(mapId) : null;
    Object.assign(goalPart(".map-guide-goal-power"), { hidden: recommended === null,
      textContent: recommended === null ? "" : `Your Power ${formatCompactNumber(dependencies.power!())} · Recommended ${formatCompactNumber(recommended)}` });
    const port = dependencies.travel;
    const button = port ? mapGuideTravelButton(mapId, dependencies.currentMapId(), unlocked(mapId)) : null;
    goalPart(".map-guide-travel").hidden = !button;
    if (!button) return;
    travelButton.textContent = button.label;
    travelButton.disabled = button.disabled;
    const note = travelNote?.mapId === mapId ? travelNote.text : "";
    Object.assign(travelHint, { textContent: note, hidden: !note });
  }
  /** Takes the player straight to the map; says so when it could not. */
  function travelTo(mapId: MapId) {
    const port = dependencies.travel;
    if (!port || !unlocked(mapId)) return;
    port.prefer(mapId);
    close();
    void port.travel(mapId).then(arrived => {
      if (arrived) return;
      open();
      viewed = mapId === dependencies.currentMapId() ? null : mapId;
      travelNote = { mapId, text: "Travel failed. Try again in a moment." };
      render();
    });
  }
  travelButton.addEventListener("click", () => travelTo(shown()));


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

  function renderTownLabels() {
    zoneLabels.replaceChildren(...TOWN_MAP_PLACES.map(place => {
      const label = document.createElement("div");
      label.className = "map-guide-zone-label is-place";
      const at = townMapFraction(place.x, place.y);
      label.style.setProperty("--map-x", String(at.x));
      label.style.setProperty("--map-y", String(at.y));
      label.setAttribute("role", "listitem");
      const name = document.createElement("strong");
      name.textContent = place.name;
      label.append(name);
      return label;
    }));
  }

  // The Gear Collection: how many of this map's drops the player has ever had, beside the drops' heading.
  const dropsHeader = dropItems.parentElement?.querySelector("header");
  const collectedCount = document.createElement("span");
  collectedCount.className = "map-guide-collected-count";
  collectedCount.hidden = true;
  dropsHeader?.querySelector("h3, h2")?.after(collectedCount);
  function renderDrops(mapId: MapId) {
    const drops = mapGuideDrops(mapId);
    const isCollected = (itemId: string) => dependencies.collected?.(itemId) ?? false;
    collectedCount.hidden = !dependencies.collected || !drops.length;
    collectedCount.textContent = `Collected ${drops.filter(drop => isCollected(drop.itemId)).length} / ${drops.length}`;
    const cards = drops.map((drop) => {
      const card = document.createElement("article");
      card.className = `map-guide-drop-card${isCollected(drop.itemId) ? " is-collected" : ""}`;
      card.dataset.itemId = drop.itemId;

      const art = document.createElement("div");
      art.className = "map-guide-drop-art";
      if (itemPresentation(drop.itemId)?.inventory.source) art.append(itemArtImage(drop.itemId));

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
      if (isCollected(drop.itemId)) {
        const mark = document.createElement("span");
        mark.className = "map-guide-collected";
        mark.textContent = "Collected";
        copy.append(mark);
      }

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
    if (!cards.length) {
      // Regular enemies drop no gear; say where it comes from instead of an empty list.
      const note = document.createElement("p");
      note.className = "enemy-index-note";
      note.style.gridColumn = "1 / -1";
      note.textContent = "No items drop here. Gear is bought from the Weapon and Armor Sellers in Town, or crafted at the Smith.";
      dropItems.replaceChildren(note);
      return;
    }
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
    if (isTownMap(mapId)) {
      const { x, y } = dependencies.player, outside = x >= TOWN_WALK_AREA.left && x <= TOWN_WALK_AREA.right && y >= TOWN_WALK_AREA.top && y <= TOWN_WALK_AREA.bottom;
      drawTownWorldMap(context, width, height, { ground: theme.ground, path: theme.path, paths: layout.paths, villageGround: dependencies.villageGround?.(),
        portals: portalsOf(mapId), player: outside ? dependencies.player : null });
      renderTownLabels();
      return;
    }
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
      context.strokeStyle = "#111111";
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
    const { maps, last } = browseRange();
    const index = maps.indexOf(mapId);
    const town = isTownMap(mapId);
    title.textContent = dependencies.mapName(mapId);
    const place = town ? "Town" : isProceduralMap(mapId) ? `Endless ${proceduralMapNumber(mapId)}` : `Map ${CAMPAIGN_MAP_IDS.indexOf(mapId as never) + 1} of ${CAMPAIGN_MAP_IDS.length}`;
    if (kicker) kicker.textContent = index > 0 && !unlocked(mapId) ? `${place} · Locked` : live() ? `${place} · You are here` : place;
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index < 0 || index >= last;
    renderGoal(mapId);
    // The Town has no enemies or drops: its page is the map alone, in the Town's own shape.
    if (mapFrame) mapFrame.style.aspectRatio = town ? TOWN_MAP_ASPECT : "";
    if (enemySection) enemySection.hidden = town;
    if (dropSection) dropSection.hidden = town;
    if (enemyRows && !town) renderEnemyRows(mapId);
    if (!town) renderDrops(mapId);
    drawMap();
  }

  // Other maps' live balances as they arrive; the table says Loading until then.
  const balances = new Map<MapId, MapBalanceSnapshot | null>();
  function renderEnemyRows(mapId: MapId) {
    if (!enemyRows) return;
    const paid = dependencies.rewardAmount ?? ((_type: RewardType, amount: number) => amount);
    const context = dependencies.rewardContext?.();
    const liveText = (reward: { type: RewardType; amount: number }) => liveRewardText(reward, context);
    if (live()) { renderEnemyIndexRows(document, enemyRows, enemyIndexRows(mapId, dependencies.enemies ?? [], paid, null, dependencies.spawnSites), liveText); return; }
    if (!dependencies.mapBalance || balances.has(mapId)) {
      renderEnemyIndexRows(document, enemyRows, enemyIndexRows(mapId, null, paid, balances.get(mapId)), liveText);
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
    const { maps, last } = browseRange();
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
    // Always opens on the player's own map (the Town has its own page); Home has none, so the furthest open one.
    const { maps } = browseRange();
    viewed = maps.includes(dependencies.currentMapId()) ? null : maps.filter((mapId, index) => index === 0 || unlocked(mapId)).pop() ?? null;
    overlay.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    render();
    requestAnimationFrame(drawMap);
    back.focus({ preventScroll: true });
  }

  function close() {
    if (overlay.hidden) return;
    travelNote = null;
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
