import { formatCompactNumber } from "../ui/number-format";
import { ENEMY_BOW_AIM_OFFSET_RADIANS, ENEMY_SPRITE_LAYOUTS, type EnemySpriteAnimationLayout } from "./enemy-sprite-layouts.mjs";

export { ENEMY_BOW_AIM_OFFSET_RADIANS };

import { type EnemyKind, type EnemyDefinition, type RewardType } from "../../shared/enemy-definitions";
export { ENEMY_TYPES, type EnemyKind, type EnemyDefinition, type RewardType } from "../../shared/enemy-definitions";

export { CAMPS, type EnemyCamp } from "../../shared/enemy-camps";
export type EnemySpriteLayerSource = {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Optional map-family recolor applied once when the layer is cached. */
  tint?: string;
  /** Actor-local point held by the archer. The layer rotates around it while aiming. */
  aimPivot?: { x: number; y: number };
  /** Rotation needed to make the source art face actor-local right. */
  aimOffsetRadians?: number;
};
export type EnemySpriteSource =
  | { src: string; size: number }
  | { size: number; height: number; visualOffsetY?: number; layers: EnemySpriteLayerSource[]; animation?: EnemySpriteAnimationLayout };
export type LoadedSpriteLayer = EnemySpriteLayerSource & { image: HTMLImageElement };
export type LoadedEnemySprite = {
  size: number;
  height?: number;
  /** Display-only adjustment; collision and floating-label anchors stay put. */
  visualOffsetY?: number;
  image?: HTMLImageElement;
  layers?: LoadedSpriteLayer[];
  animation?: Omit<EnemySpriteAnimationLayout, "pages"> & {
    pages: (EnemySpriteAnimationLayout["pages"][number] & { image: HTMLImageElement })[];
  };
};

const ENEMY_SPRITE_SOURCES = ENEMY_SPRITE_LAYOUTS as Record<EnemyKind, EnemySpriteSource>;

export const REWARD_DATA: Record<RewardType, { color: string }> = {
  damage: { color: "#ff655a" },
  health: { color: "#66ed79" },
  speed: { color: "#ffe05d" },
  armor: { color: "#74d8ff" },
  regen: { color: "#ff7ccb" },
};


/**
 * Retry delays for an enemy sprite that fails to load. Two quick retries and
 * then giving up for good left a monster, and the stats drawn with it, missing
 * until the browser was closed; the later, slower retries keep asking while
 * the player is still on the map.
 */
export const ENEMY_SPRITE_RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 16_000] as const;

function retryEnemyImage(image: HTMLImageElement, source: string, retry: number) {
  const delay = ENEMY_SPRITE_RETRY_DELAYS_MS[Math.min(retry - 1, ENEMY_SPRITE_RETRY_DELAYS_MS.length - 1)];
  globalThis.setTimeout(() => { image.src = `${source}?asset-retry=${retry}`; }, delay);
}

function loadEnemyImage(source: string, onSettled: () => void) {
  const image = new Image();
  image.decoding = "async";
  let retry = 0;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    onSettled();
  };
  image.addEventListener("load", settle, { once: true });
  image.addEventListener("error", () => {
    if (retry >= ENEMY_SPRITE_RETRY_DELAYS_MS.length) {
      settle();
      return;
    }
    retry += 1;
    retryEnemyImage(image, source, retry);
  });
  image.src = source;
  return image;
}

type LazyEnemyImageAsset = {
  image: HTMLImageElement;
  load: () => Promise<void>;
  failed: () => boolean;
  settled: () => boolean;
};

function createLazyEnemyImage(source: string, onSettled: () => void): LazyEnemyImageAsset {
  const image = new Image();
  image.decoding = "async";
  let retry = 0;
  let started = false;
  let didSettle = false;
  let didFail = false;
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  const settle = () => {
    if (didSettle) return;
    didSettle = true;
    onSettled();
    resolve();
  };
  image.addEventListener("load", settle, { once: true });
  image.addEventListener("error", () => {
    if (retry >= ENEMY_SPRITE_RETRY_DELAYS_MS.length) {
      didFail = true;
      settle();
      return;
    }
    retry += 1;
    retryEnemyImage(image, source, retry);
  });
  return {
    image,
    load: () => {
      if (!started) {
        started = true;
        image.src = source;
      } else if (didFail) {
        // Asked for again after giving up (the player came back to this map):
        // start the retry ladder over rather than stay failed for the session.
        didFail = false;
        retry = 1;
        retryEnemyImage(image, source, retry);
      }
      return promise;
    },
    failed: () => didFail,
    settled: () => didSettle,
  };
}

export function enemySpriteAssetSources(source: EnemySpriteSource) {
  return "layers" in source
    ? [...source.layers.map((layer) => layer.src), ...(source.animation?.pages.map((page) => page.src) ?? [])]
    : [source.src];
}

/**
 * Builds the renderer's complete sprite lookup without requesting every map's
 * files. A source receives its first `src` assignment only when one of the
 * maps that uses it is prepared.
 */
export function createMapScopedEnemySpriteAssets<Kind extends string, MapKey extends string>(
  spriteSources: Record<Kind, EnemySpriteSource>,
  enemyKindsByMap: Record<MapKey, readonly Kind[]>,
  onAssetSettled: () => void = () => {},
) {
  const uniqueAssetSources = [...new Set(Object.values<EnemySpriteSource>(spriteSources).flatMap(enemySpriteAssetSources))];
  const imageAssets = new Map(uniqueAssetSources.map((source) => [source, createLazyEnemyImage(source, onAssetSettled)]));
  const sprites = Object.fromEntries(Object.entries<EnemySpriteSource>(spriteSources).map(([kind, source]) => {
    if ("layers" in source) {
      const layers = source.layers.map((layer) => ({ ...layer, image: imageAssets.get(layer.src)!.image }));
      const animation = source.animation ? {
        ...source.animation,
        pages: source.animation.pages.map((page) => ({ ...page, image: imageAssets.get(page.src)!.image })),
      } : undefined;
      return [kind, { size: source.size, height: source.height, visualOffsetY: source.visualOffsetY, layers, ...(animation ? { animation } : {}) }];
    }
    return [kind, { size: source.size, image: imageAssets.get(source.src)!.image }];
  })) as Record<Kind, LoadedEnemySprite>;
  const assetsByMap = new Map<MapKey, ReturnType<typeof createLazyEnemyImage>[]>();
  function mapAssets(mapId: MapKey) {
    const cached = assetsByMap.get(mapId);
    if (cached) return cached;
    const kinds = enemyKindsByMap[mapId];
    if (!kinds) throw new Error(`Missing enemy sprite group for ${mapId}.`);
    const mapSources = new Set<string>();
    for (const kind of kinds) {
      const source = spriteSources[kind];
      if (!source) throw new Error(`Missing enemy sprite layout for ${kind}.`);
      for (const assetSource of enemySpriteAssetSources(source)) mapSources.add(assetSource);
    }
    const assets = [...mapSources].map(source => imageAssets.get(source)!);
    if (assetsByMap.size >= 32) assetsByMap.delete(assetsByMap.keys().next().value!);
    assetsByMap.set(mapId, assets);
    return assets;
  }

  return {
    sprites,
    ensureMapSprites: (mapId: MapKey) => Promise.all(mapAssets(mapId).map((asset) => asset.load())).then(() => undefined),
    mapSpriteLoadFailed: (mapId: MapKey) => mapAssets(mapId).some((asset) => asset.failed()),
    mapSpritesReady: (mapId: MapKey) => mapAssets(mapId).every((asset) => asset.settled()),
    ready: () => [...imageAssets.values()].every((asset) => asset.settled()),
  };
}

export function loadEnemySprites<MapKey extends string>(
  enemyKindsByMap: Record<MapKey, readonly EnemyKind[]>,
  onAssetSettled: () => void = () => {},
) {
  return createMapScopedEnemySpriteAssets(ENEMY_SPRITE_SOURCES, enemyKindsByMap, onAssetSettled);
}

export function loadActorShadowSprite(onAssetSettled: () => void = () => {}) {
  return loadEnemyImage("assets/wildstat/2D Character - Casual Monsters/_PNG/slime/shadow.webp", onAssetSettled);
}

export function rewardLabel(reward: EnemyDefinition["reward"]) {
  return `${rewardAmountLabel(reward)} ${rewardStatLabel(reward)}`;
}

export function rewardAmountLabel(reward: EnemyDefinition["reward"]) {
  if (reward.type === "speed") return `+${reward.amount.toFixed(2)}`;
  if (Math.abs(reward.amount) < 1_000 && !Number.isInteger(reward.amount)) return `+${reward.amount.toFixed(2)}`;
  return `+${formatCompactNumber(reward.amount)}`;
}

export function rewardStatLabel(reward: EnemyDefinition["reward"]) {
  if (reward.type === "damage") return "DAMAGE";
  if (reward.type === "health") return "MAX HEALTH";
  if (reward.type === "speed") return "ATK/SEC";
  if (reward.type === "armor") return "ARMOR";
  return "HP/SEC";
}
