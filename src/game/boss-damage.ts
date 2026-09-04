import { ENEMY_TYPES, type EnemyKind } from "./enemies";
import { LATE_BOSS_HIT_MULTIPLIERS } from "../../shared/incoming-damage";

type DamageMultipliers = Record<string, number>;

function strongestEnemyDamage(kinds: readonly EnemyKind[]) {
  return Math.max(...kinds.map((kind) => ENEMY_TYPES[kind].damage));
}

function scaledProfile<const Multipliers extends DamageMultipliers>(
  referenceDamage: number,
  multipliers: Multipliers,
) {
  return Object.fromEntries(Object.entries(multipliers).map(([attack, multiplier]) => [
    attack,
    Math.round(referenceDamage * multiplier),
  ])) as { readonly [Attack in keyof Multipliers]: number };
}

/**
 * Boss damage is anchored to the strongest regular enemy in the boss's map.
 *
 * The old fixed values survived several progression rebalances and eventually
 * became thousands to millions of times larger than their own map tiers. These
 * profiles keep a boss threatening at the end of its map without allowing its
 * damage to silently drift away from the regular-enemy curve again.
 */
export const BOSS_DAMAGE_REFERENCE = {
  dragon: strongestEnemyDamage(["Bramble", "Needle", "Mossback", "Spitter", "Brood", "Cindermaw", "King Slime", "Dread Warden"]),
  spider: strongestEnemyDamage(["Dune Raider", "Dune Archer", "Venom Guard", "Wastes Reaper", "Blight Oracle"]),
  frostclaw: strongestEnemyDamage(["Frost Raider", "Glacier Archer", "Rime Guard", "Whiteout Reaper", "Aurora Oracle"]),
  magmalisk: strongestEnemyDamage(["Ember Raider", "Cinder Archer", "Magma Guard", "Ash Reaper", "Inferno Oracle"]),
  gloomroot: strongestEnemyDamage(["Depth Raider", "Abyss Archer", "Obsidian Colossus", "Doom Reaper", "Nether Oracle"]),
  tidewyrm: strongestEnemyDamage(["Tide Raider", "Reef Archer", "Coral Colossus", "Drowned Reaper", "Tidal Oracle"]),
  koiShogun: strongestEnemyDamage(["Sakura Ronin", "Petal Archer", "Bamboo Guardian", "Moonblade Reaper", "Shrine Oracle"]),
  tempestKirin: strongestEnemyDamage(["Gale Prowler", "Nimbus Archer", "Skyguard Colossus", "Thunder Reaper", "Tempest Oracle"]),
  miremaw: strongestEnemyDamage(["Fen Prowler", "Glowcap Archer", "Bog Colossus", "Moonmire Reaper", "Wisp Oracle"]),
  prismshell: strongestEnemyDamage(["Shard Hopper", "Crystal Spitter", "Geode Guardian", "Prism Reaver", "Hollow Oracle"]),
} as const;

export const BOSS_DAMAGE_PROFILES = {
  // Preserve the familiar Forest fight while bringing every later boss onto
  // the same readable scale. Area hazards can overlap, so they stay below the
  // single heavy telegraphed strike for their encounter.
  dragon: scaledProfile(BOSS_DAMAGE_REFERENCE.dragon, {
    rain: .73,
    cone: 3.64,
    contact: 7.27,
  }),
  spider: scaledProfile(BOSS_DAMAGE_REFERENCE.spider, {
    web: 10,
    venom: 14,
    contact: 8,
  }),
  frostclaw: scaledProfile(BOSS_DAMAGE_REFERENCE.frostclaw, {
    roar: 10,
    icefall: 14,
    rift: 20,
    contact: 9,
  }),
  magmalisk: scaledProfile(BOSS_DAMAGE_REFERENCE.magmalisk, {
    bite: 30,
    eruption: 20,
    contact: 12,
  }),
  gloomroot: scaledProfile(BOSS_DAMAGE_REFERENCE.gloomroot, {
    sweep: 20,
    bloom: 14,
    contact: 10,
  }),
  tidewyrm: scaledProfile(BOSS_DAMAGE_REFERENCE.tidewyrm, {
    surge: 20,
    whirlpool: 14,
    contact: 10,
  }),
  // Regular enemies now target meaningful post-armor hits. Late bosses use
  // that same curve, with smaller ability ratios than the old 20x weak hits.
  koiShogun: scaledProfile(BOSS_DAMAGE_REFERENCE.koiShogun, {
    slash: LATE_BOSS_HIT_MULTIPLIERS.heavy,
    whirlpool: LATE_BOSS_HIT_MULTIPLIERS.area,
    contact: LATE_BOSS_HIT_MULTIPLIERS.contact,
  }),
  tempestKirin: scaledProfile(BOSS_DAMAGE_REFERENCE.tempestKirin, {
    charge: LATE_BOSS_HIT_MULTIPLIERS.heavy,
    thunder: LATE_BOSS_HIT_MULTIPLIERS.area,
    contact: LATE_BOSS_HIT_MULTIPLIERS.contact,
  }),
  miremaw: scaledProfile(BOSS_DAMAGE_REFERENCE.miremaw, {
    tongue: LATE_BOSS_HIT_MULTIPLIERS.heavy,
    bogBurst: LATE_BOSS_HIT_MULTIPLIERS.area,
    contact: LATE_BOSS_HIT_MULTIPLIERS.contact,
  }),
  prismshell: scaledProfile(BOSS_DAMAGE_REFERENCE.prismshell, {
    shatter: LATE_BOSS_HIT_MULTIPLIERS.heavy,
    crystalBurst: LATE_BOSS_HIT_MULTIPLIERS.area,
    contact: LATE_BOSS_HIT_MULTIPLIERS.contact,
  }),
} as const;
