import storedMapDesigns from "./map-designs.json";
import type { EnemyKind } from "./enemies";
import type { MapId, SpawnCamp, WorldDecor, WorldPath } from "./world";

export const MAP_DECOR_TYPES = [
  "tree",
  "grass",
  "petal",
  "cherryPetal",
  "cactus",
  "rock",
  "desertGrass",
  "snowPine",
  "snowTuft",
  "upgradeBench",
  "lavaPool",
  "lavaRock",
  "charredTree",
  "coral",
  "shell",
  "cloud",
  "skyShard",
  "gear",
  "pumpkin",
  "glowMushroom",
  "lilyPad",
] as const;

export type MapDecorType = typeof MAP_DECOR_TYPES[number];

export type MapVisualTheme = {
  ground: string;
  path: string;
  pathDetail: string;
  decorColors: Partial<Record<MapDecorType, string[]>>;
};

export type MapDesignPortal = {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  destination: string;
};

export type MapDesignGameplay = {
  arrival: { x: number; y: number };
  boss: { x: number; y: number };
  bootsPickup?: { x: number; y: number };
  portals: MapDesignPortal[];
};

export type SavedMapDesign = {
  id: string;
  name: string;
  templateId: string;
  status: "live" | "draft";
  updatedAt: string;
  theme: MapVisualTheme;
  paths: WorldPath[];
  decor: WorldDecor[];
  spawnCamps: SpawnCamp[];
  gameplay: MapDesignGameplay;
  gameplayEdited?: boolean;
};

type StoredMapDesignDocument = {
  schemaVersion: number;
  maps: Record<string, SavedMapDesign>;
  drafts: Record<string, SavedMapDesign>;
};

const document = storedMapDesigns as unknown as StoredMapDesignDocument;
const resolvedThemeCache = new Map<string, MapVisualTheme>();

const DEFAULT_MAP_THEMES: Record<MapId, MapVisualTheme> = {
  home_exterior: { ground: "#488761", path: "#b29a78", pathDetail: "rgba(68,38,29,.12)", decorColors: {} },
  tutorial_forest: {
    ground: "#31945b",
    path: "#8b6551",
    pathDetail: "rgba(68,38,29,.12)",
    decorColors: {
      grass: ["#267f4c", "#237b49"],
      petal: ["#d9f4df", "#f3f0c6", "#ccebea"],
    },
  },
  beginner_desert: {
    ground: "#d9a95f",
    path: "#c48b4b",
    pathDetail: "rgba(111,65,32,.15)",
    decorColors: {
      cactus: ["#3f8050", "#245a36", "#70a961"],
      rock: ["#79543d", "#b77b4b"],
      desertGrass: ["#a28a43", "#8b7b3d"],
    },
  },
  intermediate_snowlands: {
    ground: "#bfddeb",
    path: "#8fb7d0",
    pathDetail: "rgba(61,104,137,.18)",
    decorColors: {
      snowTuft: ["rgba(221,242,255,.76)", "rgba(255,255,255,.78)"],
    },
  },
  advanced_lava_wastes: {
    ground: "#f5b255",
    path: "#df754b",
    pathDetail: "rgba(104,31,26,.24)",
    decorColors: {},
  },
  infernal_depths: {
    ground: "#100e17",
    path: "#261a26",
    pathDetail: "rgba(138,70,76,.2)",
    decorColors: {},
  },
  water_reach: {
    ground: "#238c9a",
    path: "#d5c58e",
    pathDetail: "rgba(255,248,198,.26)",
    decorColors: {
      coral: ["#ff7f87", "#f2a15f", "#b47be8"],
      shell: ["#f0bed0", "#f6d9b8"],
    },
  },
  samurai_garden: {
    ground: "#78a76f",
    path: "#d9c8ae",
    pathDetail: "rgba(102,69,75,.2)",
    decorColors: {
      tree: ["#f47fb2", "#ff94c2", "#e96ca7"],
      cherryPetal: ["#ffd0e5", "#ff9fc9", "#f477ad", "#fff0f7"],
    },
  },
  cloudspire: {
    ground: "#537eac",
    path: "#dbe7ef",
    pathDetail: "rgba(52,76,122,.24)",
    decorColors: {
      cloud: ["rgba(214,239,255,.82)", "rgba(235,248,255,.86)"],
      skyShard: ["#8de5ff", "#f3d778", "#c9b8ff"],
    },
  },
  moonfen: {
    ground: "#174f50",
    path: "#607d6b",
    pathDetail: "rgba(190,255,224,.18)",
    decorColors: {
      glowMushroom: ["#7b54c7", "#9b68e3", "#5f46ad", "#b174df"],
      lilyPad: ["#3a8e68", "#45a66f"],
    },
  },
  crystal_hollows: {
    ground: "#303347",
    path: "#626781",
    pathDetail: "rgba(207,217,255,.2)",
    decorColors: {
      skyShard: ["#85e7ec", "#c0a1f3", "#f1c790"],
      rock: ["#4c526b", "#64627c", "#526477", "#706879"],
    },
  }, clockwork_ruins: {
    ground: "#333c3d",
    path: "#897250",
    pathDetail: "rgba(245,207,117,.2)",
    decorColors: {
      gear: ["#b58b47", "#839695", "#cfad63"],
      rock: ["#4c526b", "#64627c", "#526477", "#706879"],
    },
  }, duskfall_orchard: {
    ground: "#29263e",
    path: "#68506b",
    pathDetail: "rgba(248,174,86,.18)",
    decorColors: {
      pumpkin: ["#df8139", "#b95935", "#e5a855"],
      rock: ["#4c526b", "#64627c", "#526477", "#706879"],
    },
  },
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function savedMapDesign(mapId: string): SavedMapDesign | null {
  const saved = document.maps?.[mapId];
  return saved?.status === "live" ? clone(saved) : null;
}

export function storedDraftMapDesigns() {
  return clone(document.drafts ?? {});
}

export function savedMapName(mapId: string) {
  const saved = document.maps?.[mapId];
  return saved?.status === "live" && saved.name ? saved.name : null;
}

export function mapVisualTheme(mapId: MapId): MapVisualTheme {
  const cached = resolvedThemeCache.get(mapId);
  if (cached) return cached;
  const defaults = DEFAULT_MAP_THEMES[mapId];
  const saved = document.maps?.[mapId]?.status === "live" ? document.maps[mapId].theme : null;
  const resolved = !saved ? clone(defaults) : {
    ground: saved.ground || defaults.ground,
    path: saved.path || defaults.path,
    pathDetail: saved.pathDetail || defaults.pathDetail,
    decorColors: { ...clone(defaults.decorColors), ...clone(saved.decorColors ?? {}) },
  };
  resolvedThemeCache.set(mapId, resolved);
  return resolved;
}

export function decorPaletteColor(
  theme: MapVisualTheme,
  type: MapDecorType,
  variant: number,
  fallback: readonly string[],
) {
  const colors = theme.decorColors[type];
  const palette = colors?.length ? colors : fallback;
  return palette[Math.abs(Math.trunc(variant)) % palette.length];
}

export function isSavedEnemyKind(value: string, enemyKinds: ReadonlySet<string>): value is EnemyKind {
  return enemyKinds.has(value);
}
