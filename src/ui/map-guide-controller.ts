import {
  DARK_METAL_HELMET,
  DESERT_ITEM_DROP_DENOMINATOR,
  FIRE_METAL_BOW,
  FIRE_METAL_HELMET,
  FOREST_ITEM_DROP_DENOMINATOR,
  FROST_ARMOR,
  FROST_BOW,
  IRON_BOW,
  INFERNAL_ITEM_DROP_DENOMINATOR,
  NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR,
  NIGHT_FOREST_BOW_ITEM_DROP_DENOMINATOR,
  NIGHT_BOW,
  ITEM_DEFINITIONS,
  LAVA_BOSS_ITEM_DROP_DENOMINATOR,
  LAVA_BOW,
  LAVA_ITEM_DROP_DENOMINATOR,
  LAVA_HELMET_ITEM_DROP_DENOMINATOR,
  MAGMA_ARMOR,
  SNOW_BOSS_ARMOR_DROP_DENOMINATOR,
  SNOW_BOSS_ITEM_DROP_DENOMINATOR,
  SNOW_BOW,
  SNOW_ITEM_DROP_DENOMINATOR,
  STARTER_BOW,
  WOOD_FULL_HELM,
  WOODEN_ARMOR,
  type ItemDefinition,
  type ItemId,
} from "../../shared/items";
import { WORLD } from "../game/constants";
import { ENEMY_TYPES, REWARD_DATA, type RewardType } from "../game/enemies";
import { itemPresentation } from "../game/item-presentation";
import { drawPortalMapMarker } from "../game/portal-presentation";
import {
  ADVANCED_LAVA_WASTES_MAP_ID,
  BEGINNER_DESERT_MAP_ID,
  CLOUDSPIRE_MAP_ID,
  INFERNAL_DEPTHS_MAP_ID,
  INTERMEDIATE_SNOWLANDS_MAP_ID,
  MOONFEN_MAP_ID,
  CRYSTAL_HOLLOWS_MAP_ID,
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
};

export type MapGuideDrop = {
  itemId: ItemId;
  denominator: number;
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
  [TUTORIAL_FOREST_MAP_ID]: [
    { itemId: STARTER_BOW, denominator: FOREST_ITEM_DROP_DENOMINATOR, source: "Any regular forest enemy" },
    { itemId: WOODEN_ARMOR, denominator: FOREST_ITEM_DROP_DENOMINATOR, source: "Any regular forest enemy" },
  ],
  [BEGINNER_DESERT_MAP_ID]: [
    { itemId: WOOD_FULL_HELM, denominator: DESERT_ITEM_DROP_DENOMINATOR, source: "Any regular desert enemy" },
    { itemId: IRON_BOW, denominator: DESERT_ITEM_DROP_DENOMINATOR, source: "Any regular desert enemy" },
  ],
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: [
    { itemId: SNOW_BOW, denominator: SNOW_ITEM_DROP_DENOMINATOR, source: "Any regular Snowlands enemy" },
    { itemId: FROST_ARMOR, denominator: SNOW_BOSS_ARMOR_DROP_DENOMINATOR, source: "Boss" },
    { itemId: FROST_BOW, denominator: SNOW_BOSS_ITEM_DROP_DENOMINATOR, source: "Boss" },
  ],
  [ADVANCED_LAVA_WASTES_MAP_ID]: [
    { itemId: MAGMA_ARMOR, denominator: LAVA_ITEM_DROP_DENOMINATOR, source: "Any regular lava enemy" },
    { itemId: FIRE_METAL_HELMET, denominator: LAVA_HELMET_ITEM_DROP_DENOMINATOR, source: "Any regular lava enemy" },
    { itemId: LAVA_BOW, denominator: LAVA_BOSS_ITEM_DROP_DENOMINATOR, source: "Boss" },
  ],
  [INFERNAL_DEPTHS_MAP_ID]: [
    { itemId: NIGHT_BOW, denominator: NIGHT_FOREST_BOW_ITEM_DROP_DENOMINATOR, source: "Any regular Night Forest enemy" },
    { itemId: FIRE_METAL_BOW, denominator: INFERNAL_ITEM_DROP_DENOMINATOR, source: "Any regular Night Forest enemy" },
    { itemId: DARK_METAL_HELMET, denominator: NIGHT_FOREST_HELMET_ITEM_DROP_DENOMINATOR, source: "Any regular Night Forest enemy" },
  ],
  [WATER_REACH_MAP_ID]: [],
  [SAMURAI_GARDEN_MAP_ID]: [],
  [CLOUDSPIRE_MAP_ID]: [],
  [MOONFEN_MAP_ID]: [],
  [CRYSTAL_HOLLOWS_MAP_ID]: [],
};

const MAP_GUIDE_THEMES: Record<MapId, { ground: string; path: string; glow: string }> = {
  [TUTORIAL_FOREST_MAP_ID]: { ground: "#31945b", path: "#8b6551", glow: "#65e889" },
  [BEGINNER_DESERT_MAP_ID]: { ground: "#d9a95f", path: "#c48b4b", glow: "#ffe09a" },
  [INTERMEDIATE_SNOWLANDS_MAP_ID]: { ground: "#bfddeb", path: "#8fb7d0", glow: "#e9fbff" },
  [ADVANCED_LAVA_WASTES_MAP_ID]: { ground: "#f5b255", path: "#df754b", glow: "#ffd077" },
  [INFERNAL_DEPTHS_MAP_ID]: { ground: "#100e17", path: "#261a26", glow: "#8f83a6" },
  [WATER_REACH_MAP_ID]: { ground: "#238c9a", path: "#d5c58e", glow: "#7af6f1" },
  [SAMURAI_GARDEN_MAP_ID]: { ground: "#78a76f", path: "#d9c8ae", glow: "#ff91c4" },
  [CLOUDSPIRE_MAP_ID]: { ground: "#537eac", path: "#dbe7ef", glow: "#8edcff" },
  [MOONFEN_MAP_ID]: { ground: "#174f50", path: "#607d6b", glow: "#79efc3" },
  [CRYSTAL_HOLLOWS_MAP_ID]: { ground: "#303347", path: "#626781", glow: "#c3a6ff" },
};

const MAP_GUIDE_REWARD_LABELS: Record<RewardType, string> = {
  damage: "Damage",
  health: "Max health",
  speed: "Attack speed",
  armor: "Armor",
  regen: "Hp/Sec",
};

export function mapGuideDrops(mapId: MapId) {
  return MAP_GUIDE_DROPS[mapId];
}

/** Groups the live spawn layout into readable reward zones for the enlarged map. */
export function mapGuideZones(spawnSites: readonly SpawnSite[]): MapGuideZone[] {
  const groups = new Map<string, SpawnSite[]>();
  for (const site of spawnSites) {
    const group = groups.get(site.campName);
    if (group) group.push(site);
    else groups.set(site.campName, [site]);
  }

  return [...groups.entries()].map(([name, sites]) => {
    const x = sites.reduce((sum, site) => sum + site.x, 0) / sites.length;
    const y = sites.reduce((sum, site) => sum + site.y, 0) / sites.length;
    const radius = Math.max(120, ...sites.map((site) => Math.hypot(site.x - x, site.y - y) + 80));
    const rewardTypes = new Set<RewardType>();
    for (const enemyType of new Set(sites.map((site) => site.type))) {
      rewardTypes.add(ENEMY_TYPES[enemyType].reward.type);
    }
    const rewards = [...rewardTypes].map((type) => ({
      type,
      label: MAP_GUIDE_REWARD_LABELS[type],
      color: REWARD_DATA[type].color,
    }));
    return { name, x, y, radius, rewards };
  });
}

export function mapGuideDropChance(denominator: number) {
  const percent = 100 / denominator;
  const precision = Number.isInteger(percent) ? 0 : percent < 1 ? 2 : 1;
  return `${percent.toFixed(precision)}%`;
}

function bonusLabel(value: number) {
  return `+${Number((value * 100).toFixed(2))}%`;
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
      chanceValue.textContent = mapGuideDropChance(drop.denominator);
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
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    const mapId = dependencies.currentMapId();
    const theme = MAP_GUIDE_THEMES[mapId];
    const scaleX = width / WORLD.w;
    const scaleY = height / WORLD.h;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    context.fillStyle = theme.ground;
    context.fillRect(0, 0, width, height);

    context.fillStyle = theme.path;
    for (const path of dependencies.paths) {
      context.fillRect(path.x * scaleX, path.y * scaleY, path.w * scaleX, path.h * scaleY);
    }

    const zones = mapGuideZones(dependencies.spawnSites);
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

    for (const portal of dependencies.portals()) {
      const x = portal.x * scaleX;
      const y = portal.y * scaleY;
      drawPortalMapMarker(context, Math.round(x), Math.round(y), portal.destination, portal.unlocked, 2);
    }

    const boss = dependencies.boss();
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

    const playerX = dependencies.player.x * scaleX;
    const playerY = dependencies.player.y * scaleY;
    context.fillStyle = "#fff";
    context.strokeStyle = "#0a1510";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(playerX, playerY, 6, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    renderZoneLabels(zones, boss);
  }

  function render() {
    const mapId = dependencies.currentMapId();
    title.textContent = dependencies.mapName(mapId);
    renderDrops(mapId);
    drawMap();
  }

  function open() {
    if (!overlay.hidden) return;
    dependencies.beforeOpen();
    dependencies.clearPlayerInput();
    overlay.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    render();
    requestAnimationFrame(drawMap);
    back.focus({ preventScroll: true });
  }

  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", open);
  back.addEventListener("click", () => {
    close();
    trigger.focus({ preventScroll: true });
  });
  new ResizeObserver(drawMap).observe(canvas);

  return { open, close, isOpen: () => !overlay.hidden, render };
}
