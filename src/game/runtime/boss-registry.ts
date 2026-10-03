import type { BossSimulationKind } from "../../../shared/boss-simulation";
import {
  DRAGON_RADIUS, DRAGON_VERTICAL_RADIUS, DRAGON_HITBOX_OFFSET_Y,
  SPIDER_RADIUS, SPIDER_VERTICAL_RADIUS, SPIDER_HITBOX_OFFSET_Y,
  FROSTCLAW_RADIUS, FROSTCLAW_VERTICAL_RADIUS, FROSTCLAW_HITBOX_OFFSET_Y,
  MAGMALISK_RADIUS, MAGMALISK_VERTICAL_RADIUS, MAGMALISK_HITBOX_OFFSET_Y,
  GLOOMROOT_RADIUS, GLOOMROOT_VERTICAL_RADIUS, GLOOMROOT_HITBOX_OFFSET_Y,
  TIDEWYRM_RADIUS, TIDEWYRM_VERTICAL_RADIUS, TIDEWYRM_HITBOX_OFFSET_Y,
  KOI_SHOGUN_RADIUS, KOI_SHOGUN_VERTICAL_RADIUS, KOI_SHOGUN_HITBOX_OFFSET_Y,
  TEMPEST_KIRIN_RADIUS, TEMPEST_KIRIN_VERTICAL_RADIUS, TEMPEST_KIRIN_HITBOX_OFFSET_Y,
  MIREMAW_RADIUS, MIREMAW_VERTICAL_RADIUS, MIREMAW_HITBOX_OFFSET_Y,
  PRISMSHELL_RADIUS, PRISMSHELL_VERTICAL_RADIUS, PRISMSHELL_HITBOX_OFFSET_Y,
  IRONHORN_RADIUS, IRONHORN_VERTICAL_RADIUS, IRONHORN_HITBOX_OFFSET_Y,
  DREADREAPER_RADIUS, DREADREAPER_VERTICAL_RADIUS, DREADREAPER_HITBOX_OFFSET_Y,
  VOLTWARDEN_RADIUS, VOLTWARDEN_VERTICAL_RADIUS, VOLTWARDEN_HITBOX_OFFSET_Y,
  GRAVEBLOOM_RADIUS, GRAVEBLOOM_VERTICAL_RADIUS, GRAVEBLOOM_HITBOX_OFFSET_Y,
  AEGIS_PRIME_RADIUS, AEGIS_PRIME_VERTICAL_RADIUS, AEGIS_PRIME_HITBOX_OFFSET_Y,
} from "../../../shared/boss-hitbox";
import {
  DRAGON_MAX_HP, SPIDER_MAX_HP, FROSTCLAW_MAX_HP, MAGMALISK_MAX_HP, GLOOMROOT_MAX_HP, TIDEWYRM_MAX_HP, KOI_SHOGUN_MAX_HP,
  TEMPEST_KIRIN_MAX_HP, MIREMAW_MAX_HP, PRISMSHELL_MAX_HP, IRONHORN_MAX_HP, DREADREAPER_MAX_HP, VOLTWARDEN_MAX_HP,
  GRAVEBLOOM_MAX_HP, AEGIS_PRIME_MAX_HP,
} from "../../../shared/rules";
import {
  DRAGON_DEPTH_OFFSET, SPIDER_DEPTH_OFFSET, FROSTCLAW_DEPTH_OFFSET, MAGMALISK_DEPTH_OFFSET, GLOOMROOT_DEPTH_OFFSET,
  TIDEWYRM_DEPTH_OFFSET, KOI_SHOGUN_DEPTH_OFFSET, TEMPEST_KIRIN_DEPTH_OFFSET, MIREMAW_DEPTH_OFFSET, PRISMSHELL_DEPTH_OFFSET,
  IRONHORN_DEPTH_OFFSET, DREADREAPER_DEPTH_OFFSET, VOLTWARDEN_DEPTH_OFFSET, GRAVEBLOOM_DEPTH_OFFSET, AEGIS_PRIME_DEPTH_OFFSET,
  WORLD,
} from "../constants";
import {
  ADVANCED_LAVA_WASTES_MAP_ID, BEGINNER_DESERT_MAP_ID, CLOCKWORK_RUINS_MAP_ID, CLOUDSPIRE_MAP_ID, CRYSTAL_HOLLOWS_MAP_ID,
  DUSKFALL_ORCHARD_MAP_ID, INFERNAL_DEPTHS_MAP_ID, INTERMEDIATE_SNOWLANDS_MAP_ID, ION_CITADEL_MAP_ID, MOONFEN_MAP_ID,
  NEON_BASTION_MAP_ID, SAMURAI_GARDEN_MAP_ID, TUTORIAL_FOREST_MAP_ID, VERDANT_CATACOMBS_MAP_ID, WATER_REACH_MAP_ID,
  type MapId,
} from "../world";
import { BOSS_ART } from "./boss-art";
import { CARAPACE_ANGLER_ATLAS, CARAPACE_ANGLER_USED_PAGES } from "./carapace-angler-sprite";
import { DREADREAPER_ATLAS, DREADREAPER_USED_PAGES } from "./dreadreaper-sprite";
import { AEGIS_PRIME_ART_SOURCE } from "./ion-boss-art";
import { IRONHORN_ATLAS, IRONHORN_USED_PAGES } from "./ironhorn-sprite";
import type { MapArtAssetGroup } from "./map-asset-groups";
import { VOLTWARDEN_ART_SOURCE } from "./neon-boss-art";
import { PRISMSHELL_ATLAS, PRISMSHELL_USED_PAGES } from "./prismshell-sprite";
import { SCORPION_SPRITE } from "./scorpion-sprite";
import { GRAVEBLOOM_ART_SOURCE } from "./verdant-boss-art";
import type {
  AegisPrimeBossState, AegisPrimeCrystalBurst, BossRainStrike, DragonBossState, DreadreaperBossState, DreadreaperCrystalBurst,
  FrostclawBossState, FrostclawIcefall, GloomrootBloom, GloomrootBossState, GravebloomBossState, GravebloomCrystalBurst,
  IronhornBossState, IronhornCrystalBurst, KoiShogunBossState, KoiShogunWhirlpool, MagmaliskBossState, MagmaliskEruption,
  MiremawBogBurst, MiremawBossState, PrismshellBossState, PrismshellCrystalBurst, SpiderBossState, SpiderVenomPool,
  TempestKirinBossState, TempestKirinThunderbolt, TidewyrmBossState, TidewyrmWhirlpool, VoltwardenBossState, VoltwardenCrystalBurst,
} from "./types";

/** The hand-built world bosses, one per campaign map. */
export type BossKind = BossSimulationKind;

/** Every world boss's live state, by kind. */
export type BossStates = {
  dragon: DragonBossState;
  spider: SpiderBossState;
  frostclaw: FrostclawBossState;
  magmalisk: MagmaliskBossState;
  gloomroot: GloomrootBossState;
  tidewyrm: TidewyrmBossState;
  koiShogun: KoiShogunBossState;
  tempestKirin: TempestKirinBossState;
  miremaw: MiremawBossState;
  prismshell: PrismshellBossState;
  ironhorn: IronhornBossState;
  dreadreaper: DreadreaperBossState;
  voltwarden: VoltwardenBossState;
  gravebloom: GravebloomBossState;
  aegisPrime: AegisPrimeBossState;
};

/** Every world boss's ground hazards (rain, venom, bursts) while they play, by kind. */
export type BossHazards = {
  dragon: BossRainStrike[];
  spider: SpiderVenomPool[];
  frostclaw: FrostclawIcefall[];
  magmalisk: MagmaliskEruption[];
  gloomroot: GloomrootBloom[];
  tidewyrm: TidewyrmWhirlpool[];
  koiShogun: KoiShogunWhirlpool[];
  tempestKirin: TempestKirinThunderbolt[];
  miremaw: MiremawBogBurst[];
  prismshell: PrismshellCrystalBurst[];
  ironhorn: IronhornCrystalBurst[];
  dreadreaper: DreadreaperCrystalBurst[];
  voltwarden: VoltwardenCrystalBurst[];
  gravebloom: GravebloomCrystalBurst[];
  aegisPrime: AegisPrimeCrystalBurst[];
};

/** The state fields that hold an attack while it plays (a cone, a web, a roar). */
export type BossAttackSlot<K extends BossKind> = {
  [P in keyof BossStates[K]]-?: P extends "encounter" ? never : null extends BossStates[K][P] ? P : never;
}[keyof BossStates[K]];

/**
 * Where a boss's artwork comes from. A sheet is drawn once into a canvas, with
 * its green backdrop keyed out first when it has one (`inline` keys it on the
 * main thread instead of the worker). An atlas is used as its page images.
 */
export type BossArtSource =
  | { sheet: string; chroma?: { greenThreshold: number; ratio: number; frameColumns?: number; repack?: boolean; inline?: boolean } }
  | { pages: readonly string[]; used: readonly number[] };

export type BossDefinitionOf<K extends BossKind> = {
  kind: K;
  mapId: MapId;
  /** Shown on the map guide. */
  name: string;
  /** Its mark on the minimap. */
  minimapColor: string;
  /** Added to the boss's y when it is sorted among trees and players. */
  depthOffset: number;
  /** Where it stands unless the map editor moved it. */
  spawn: { x: number; y: number };
  body: { radius: number; verticalRadius: number; hitboxOffsetY: number };
  /** Read when needed: a map's balance replaces these values once it loads. */
  maxHp: () => number;
  /** The attack it opens with after a reset or a respawn. */
  firstAttack: BossStates[K]["nextAttack"];
  attackSlots: readonly BossAttackSlot<K>[];
  /** The map-asset group that loads its art with the map. */
  assetGroup: MapArtAssetGroup;
  art: BossArtSource;
};

/** Any one world boss's entry. */
export type BossDefinition = { [K in BossKind]: BossDefinitionOf<K> }[BossKind];

const sheet = (file: string) => `assets/wildstat/${file}`;
const atlasPages = (atlas: { pages: readonly { src: string }[] }) => atlas.pages.map((page) => page.src);
const ARENA_CENTRE = { x: 4050, y: 4050 };

/**
 * One entry per world boss. Adding a boss means adding it here, to its
 * behaviour in boss-controller.ts and to its drawing in boss-renderer.ts;
 * the frame loop, the depth queue, the minimap, collision, map changes and
 * asset loading all find it through this table.
 */
export const BOSSES = {
  dragon: {
    kind: "dragon", mapId: TUTORIAL_FOREST_MAP_ID, name: "Dragon", minimapColor: "#ff6b52", depthOffset: DRAGON_DEPTH_OFFSET,
    spawn: { x: WORLD.w - 760, y: WORLD.h - 560 },
    body: { radius: DRAGON_RADIUS, verticalRadius: DRAGON_VERTICAL_RADIUS, hitboxOffsetY: DRAGON_HITBOX_OFFSET_Y },
    maxHp: () => DRAGON_MAX_HP,
    firstAttack: "cone", attackSlots: ["cone"],
    assetGroup: "forestBoss", art: { sheet: sheet(BOSS_ART.DRAGON.sheet), chroma: { greenThreshold: 145, ratio: 1.45 } },
  },
  spider: {
    kind: "spider", mapId: BEGINNER_DESERT_MAP_ID, name: "Desert Scorpion", minimapColor: "#e9ac4e", depthOffset: SPIDER_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: SPIDER_RADIUS, verticalRadius: SPIDER_VERTICAL_RADIUS, hitboxOffsetY: SPIDER_HITBOX_OFFSET_Y },
    maxHp: () => SPIDER_MAX_HP,
    firstAttack: "web", attackSlots: ["web"],
    assetGroup: "desertBoss", art: { sheet: SCORPION_SPRITE.source, chroma: { greenThreshold: 135, ratio: 1.35, frameColumns: SCORPION_SPRITE.frames } },
  },
  frostclaw: {
    kind: "frostclaw", mapId: INTERMEDIATE_SNOWLANDS_MAP_ID, name: "Frostclaw", minimapColor: "#67dcff", depthOffset: FROSTCLAW_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: FROSTCLAW_RADIUS, verticalRadius: FROSTCLAW_VERTICAL_RADIUS, hitboxOffsetY: FROSTCLAW_HITBOX_OFFSET_Y },
    maxHp: () => FROSTCLAW_MAX_HP,
    firstAttack: "roar", attackSlots: ["roar", "rift"],
    assetGroup: "snowBoss", art: { sheet: sheet(BOSS_ART.FROSTCLAW.sheet), chroma: { greenThreshold: 145, ratio: 1.45, frameColumns: 4 } },
  },
  magmalisk: {
    kind: "magmalisk", mapId: ADVANCED_LAVA_WASTES_MAP_ID, name: "Magmalisk", minimapColor: "#ff752f", depthOffset: MAGMALISK_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: MAGMALISK_RADIUS, verticalRadius: MAGMALISK_VERTICAL_RADIUS, hitboxOffsetY: MAGMALISK_HITBOX_OFFSET_Y },
    maxHp: () => MAGMALISK_MAX_HP,
    firstAttack: "bite", attackSlots: ["bite"],
    assetGroup: "lavaBoss", art: { sheet: sheet(BOSS_ART.MAGMALISK.sheet), chroma: { greenThreshold: 145, ratio: 1.45, frameColumns: 4, repack: true } },
  },
  gloomroot: {
    kind: "gloomroot", mapId: INFERNAL_DEPTHS_MAP_ID, name: "Gloomroot", minimapColor: "#69f0e7", depthOffset: GLOOMROOT_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: GLOOMROOT_RADIUS, verticalRadius: GLOOMROOT_VERTICAL_RADIUS, hitboxOffsetY: GLOOMROOT_HITBOX_OFFSET_Y },
    maxHp: () => GLOOMROOT_MAX_HP,
    firstAttack: "sweep", attackSlots: ["sweep"],
    assetGroup: "nightBoss", art: { sheet: sheet(BOSS_ART.GLOOMROOT.sheet), chroma: { greenThreshold: 145, ratio: 1.45, inline: true } },
  },
  tidewyrm: {
    kind: "tidewyrm", mapId: WATER_REACH_MAP_ID, name: "Tidewyrm", minimapColor: "#55ddf4", depthOffset: TIDEWYRM_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: TIDEWYRM_RADIUS, verticalRadius: TIDEWYRM_VERTICAL_RADIUS, hitboxOffsetY: TIDEWYRM_HITBOX_OFFSET_Y },
    maxHp: () => TIDEWYRM_MAX_HP,
    firstAttack: "surge", attackSlots: ["surge"],
    assetGroup: "waterBoss", art: { pages: atlasPages(CARAPACE_ANGLER_ATLAS), used: CARAPACE_ANGLER_USED_PAGES },
  },
  koiShogun: {
    kind: "koiShogun", mapId: SAMURAI_GARDEN_MAP_ID, name: "Koi Shogun", minimapColor: "#e48a35", depthOffset: KOI_SHOGUN_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: KOI_SHOGUN_RADIUS, verticalRadius: KOI_SHOGUN_VERTICAL_RADIUS, hitboxOffsetY: KOI_SHOGUN_HITBOX_OFFSET_Y },
    maxHp: () => KOI_SHOGUN_MAX_HP,
    firstAttack: "slash", attackSlots: ["slash"],
    assetGroup: "samuraiBoss", art: { sheet: sheet(BOSS_ART.KOI_SHOGUN.sheet), chroma: { greenThreshold: 145, ratio: 1.45, frameColumns: 4 } },
  },
  tempestKirin: {
    kind: "tempestKirin", mapId: CLOUDSPIRE_MAP_ID, name: "Tempest Kirin", minimapColor: "#7fd8ff", depthOffset: TEMPEST_KIRIN_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: TEMPEST_KIRIN_RADIUS, verticalRadius: TEMPEST_KIRIN_VERTICAL_RADIUS, hitboxOffsetY: TEMPEST_KIRIN_HITBOX_OFFSET_Y },
    maxHp: () => TEMPEST_KIRIN_MAX_HP,
    firstAttack: "charge", attackSlots: ["charge"],
    assetGroup: "cloudspireBoss", art: { sheet: sheet(BOSS_ART.TEMPEST_KIRIN.sheet) },
  },
  miremaw: {
    kind: "miremaw", mapId: MOONFEN_MAP_ID, name: "Miremaw", minimapColor: "#79efc3", depthOffset: MIREMAW_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: MIREMAW_RADIUS, verticalRadius: MIREMAW_VERTICAL_RADIUS, hitboxOffsetY: MIREMAW_HITBOX_OFFSET_Y },
    maxHp: () => MIREMAW_MAX_HP,
    firstAttack: "tongue", attackSlots: ["tongue"],
    assetGroup: "moonfenBoss", art: { sheet: sheet(BOSS_ART.MIREMAW.sheet) },
  },
  prismshell: {
    kind: "prismshell", mapId: CRYSTAL_HOLLOWS_MAP_ID, name: "Prismshell", minimapColor: "#c3a6ff", depthOffset: PRISMSHELL_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: PRISMSHELL_RADIUS, verticalRadius: PRISMSHELL_VERTICAL_RADIUS, hitboxOffsetY: PRISMSHELL_HITBOX_OFFSET_Y },
    maxHp: () => PRISMSHELL_MAX_HP,
    firstAttack: "shatter", attackSlots: ["shatter"],
    assetGroup: "crystalHollowsBoss", art: { pages: atlasPages(PRISMSHELL_ATLAS), used: PRISMSHELL_USED_PAGES },
  },
  ironhorn: {
    kind: "ironhorn", mapId: CLOCKWORK_RUINS_MAP_ID, name: "Ironhorn", minimapColor: "#c3a6ff", depthOffset: IRONHORN_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: IRONHORN_RADIUS, verticalRadius: IRONHORN_VERTICAL_RADIUS, hitboxOffsetY: IRONHORN_HITBOX_OFFSET_Y },
    maxHp: () => IRONHORN_MAX_HP,
    firstAttack: "shatter", attackSlots: ["shatter"],
    assetGroup: "clockworkRuinsBoss", art: { pages: atlasPages(IRONHORN_ATLAS), used: IRONHORN_USED_PAGES },
  },
  dreadreaper: {
    kind: "dreadreaper", mapId: DUSKFALL_ORCHARD_MAP_ID, name: "Dreadreaper", minimapColor: "#c3a6ff", depthOffset: DREADREAPER_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: DREADREAPER_RADIUS, verticalRadius: DREADREAPER_VERTICAL_RADIUS, hitboxOffsetY: DREADREAPER_HITBOX_OFFSET_Y },
    maxHp: () => DREADREAPER_MAX_HP,
    firstAttack: "shatter", attackSlots: ["shatter"],
    assetGroup: "duskfallOrchardBoss", art: { pages: atlasPages(DREADREAPER_ATLAS), used: DREADREAPER_USED_PAGES },
  },
  voltwarden: {
    kind: "voltwarden", mapId: NEON_BASTION_MAP_ID, name: "Voltwarden", minimapColor: "#c3a6ff", depthOffset: VOLTWARDEN_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: VOLTWARDEN_RADIUS, verticalRadius: VOLTWARDEN_VERTICAL_RADIUS, hitboxOffsetY: VOLTWARDEN_HITBOX_OFFSET_Y },
    maxHp: () => VOLTWARDEN_MAX_HP,
    firstAttack: "laserGrid", attackSlots: ["shatter"],
    assetGroup: "neonBastionBoss", art: { pages: [VOLTWARDEN_ART_SOURCE], used: [0] },
  },
  gravebloom: {
    kind: "gravebloom", mapId: VERDANT_CATACOMBS_MAP_ID, name: "Gravebloom", minimapColor: "#c3a6ff", depthOffset: GRAVEBLOOM_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: GRAVEBLOOM_RADIUS, verticalRadius: GRAVEBLOOM_VERTICAL_RADIUS, hitboxOffsetY: GRAVEBLOOM_HITBOX_OFFSET_Y },
    maxHp: () => GRAVEBLOOM_MAX_HP,
    firstAttack: "rootGrasp", attackSlots: ["shatter"],
    assetGroup: "verdantCatacombsBoss", art: { pages: [GRAVEBLOOM_ART_SOURCE], used: [0] },
  },
  aegisPrime: {
    kind: "aegisPrime", mapId: ION_CITADEL_MAP_ID, name: "Aegis Prime", minimapColor: "#c3a6ff", depthOffset: AEGIS_PRIME_DEPTH_OFFSET,
    spawn: ARENA_CENTRE,
    body: { radius: AEGIS_PRIME_RADIUS, verticalRadius: AEGIS_PRIME_VERTICAL_RADIUS, hitboxOffsetY: AEGIS_PRIME_HITBOX_OFFSET_Y },
    maxHp: () => AEGIS_PRIME_MAX_HP,
    firstAttack: "shieldSweep", attackSlots: ["shatter"],
    assetGroup: "ionCitadelBoss", art: { pages: [AEGIS_PRIME_ART_SOURCE], used: [0] },
  },
} satisfies { [K in BossKind]: BossDefinitionOf<K> };

/** Every world boss, in campaign order. */
export const BOSS_KINDS = Object.keys(BOSSES) as BossKind[];

const BOSS_BY_MAP = new Map<string, BossDefinition>(BOSS_KINDS.map((kind) => [BOSSES[kind].mapId, BOSSES[kind]]));

/** The world boss that lives on `mapId`, if any. Generated maps have none. */
export function bossForMap(mapId: string): BossDefinition | null {
  return BOSS_BY_MAP.get(mapId) ?? null;
}

/** The live state of the world boss on `mapId`, if that map has one. */
export function bossStateForMap(bosses: BossStates, mapId: string): BossStates[BossKind] | null {
  const boss = bossForMap(mapId);
  return boss ? bosses[boss.kind] : null;
}

/** Builds one value per boss kind, in campaign order. */
export function perBoss<T>(build: <K extends BossKind>(kind: K) => T): Record<BossKind, T> {
  return Object.fromEntries(BOSS_KINDS.map((kind) => [kind, build(kind)])) as Record<BossKind, T>;
}

/** Ends the attack a boss is playing, without touching its ground hazards. */
export function clearBossAttack<K extends BossKind>(kind: K, state: BossStates[K]) {
  for (const slot of BOSSES[kind].attackSlots as unknown as readonly BossAttackSlot<K>[]) {
    (state as Record<BossAttackSlot<K>, unknown>)[slot] = null;
  }
}

/** Sheet art is a processed canvas; atlas art is its page images. */
export type BossSheetArt = { canvas: HTMLCanvasElement; ready: () => boolean };
export type BossPageArt = { pages: HTMLImageElement[]; ready: () => boolean };
export type BossArtAssets = {
  [K in BossKind]: (typeof BOSSES)[K]["art"] extends { pages: readonly string[] } ? BossPageArt : BossSheetArt;
};
