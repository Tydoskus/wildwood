import { PLAYER_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "../shared/rules";

export const VIRTUAL_PLAYER_LOAD_MODES = ["movement", "realistic", "dense"] as const;
export type VirtualPlayerLoadMode = typeof VIRTUAL_PLAYER_LOAD_MODES[number];

export type VirtualPlayerLoadProfile = {
  subscriptions: "none" | "full";
  saves: boolean;
  inputKind: "keyboard" | "touch";
  angularVelocity: number;
  lightMode: boolean;
  defaultSpawnRate: number;
};

const PROFILES: Record<VirtualPlayerLoadMode, VirtualPlayerLoadProfile> = {
  movement: {
    subscriptions: "none",
    saves: false,
    inputKind: "keyboard",
    angularVelocity: 0,
    lightMode: true,
    defaultSpawnRate: 300,
  },
  realistic: {
    subscriptions: "full",
    saves: true,
    inputKind: "touch",
    angularVelocity: .65,
    lightMode: false,
    defaultSpawnRate: 150,
  },
  dense: {
    subscriptions: "full",
    saves: true,
    inputKind: "touch",
    angularVelocity: 1.6,
    lightMode: false,
    defaultSpawnRate: 100,
  },
};

export function virtualPlayerLoadProfile(mode: VirtualPlayerLoadMode) {
  return PROFILES[mode];
}

export function isVirtualPlayerLoadMode(value: string): value is VirtualPlayerLoadMode {
  return VIRTUAL_PLAYER_LOAD_MODES.includes(value as VirtualPlayerLoadMode);
}

/** Keeps each Node process below common 256-file-descriptor defaults. */
export function virtualPlayerLoadWorkerCount(count: number, requested?: number) {
  const safeCount = Math.max(1, Math.floor(count));
  const automatic = Math.ceil(safeCount / 200);
  const desired = requested === undefined ? automatic : Math.max(1, Math.floor(requested));
  return Math.min(32, safeCount, Math.max(automatic, desired));
}

export function virtualPlayerWorkerIndices(total: number, workerIndex: number, workerCount: number) {
  const indices: number[] = [];
  for (let index = workerIndex; index < total; index += workerCount) indices.push(index);
  return indices;
}

/** Distributed modes cover the world; dense mode deliberately stays in one 1,000-unit zone. */
export function virtualPlayerLoadSpawnPoint(mode: VirtualPlayerLoadMode, index: number, count: number) {
  const safeCount = Math.max(1, Math.floor(count));
  const safeIndex = Math.max(0, Math.min(safeCount - 1, Math.floor(index)));
  if (mode === "dense") {
    const zoneSize = 1_000;
    const centerX = Math.min(WORLD_WIDTH - PLAYER_RADIUS - 200, Math.floor(WORLD_WIDTH / 2 / zoneSize) * zoneSize + zoneSize / 2);
    const centerY = Math.min(WORLD_HEIGHT - PLAYER_RADIUS - 200, Math.floor(WORLD_HEIGHT / 2 / zoneSize) * zoneSize + zoneSize / 2);
    const distance = Math.sqrt((safeIndex + .5) / safeCount) * 180;
    const angle = safeIndex * 2.399963229728653;
    return { x: centerX + Math.cos(angle) * distance, y: centerY + Math.sin(angle) * distance };
  }

  const margin = PLAYER_RADIUS + 60;
  const usableWidth = WORLD_WIDTH - margin * 2;
  const usableHeight = WORLD_HEIGHT - margin * 2;
  const columns = Math.max(1, Math.ceil(Math.sqrt(safeCount * usableWidth / usableHeight)));
  const rows = Math.max(1, Math.ceil(safeCount / columns));
  const column = safeIndex % columns;
  const row = Math.floor(safeIndex / columns);
  return {
    x: margin + (column + .5) * usableWidth / columns,
    y: margin + (row + .5) * usableHeight / rows,
  };
}
