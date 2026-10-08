/**
 * The builds the growth forecast is calibrated on: each a virtual player on
 * its map and, where there is one, the same build on the map after it.
 * Campaign builds start from the Balance Lab's build on arrival at their map
 * (reference-builds.ts), scaled, as profiles.ts makes its players.
 */
import { MAP_IDS as CAMPAIGN_MAP_IDS, DEFAULT_ATTACK_INTERVAL, PLAYER_BASE_DAMAGE, PLAYER_BASE_HP, PLAYER_BASE_REGEN } from '../../../../shared/rules';
import { proceduralMapId } from '../../../../shared/procedural-maps';
import { SOUL_MAP_ID } from '../../../../shared/soul-dimension';
import type { ReferenceBuild } from './reference-builds';
import type { VirtualPlayerProfile } from './virtual-player';

export type CalibrationBuild = {
  name: string;
  /** What the build is for, in a few words, for the report. */
  note: string;
  profile: VirtualPlayerProfile;
  /** The map after `profile.startMap`, or null (the Soul Dimension). */
  nextMap: string | null;
  /** Soul Dimension tier, for its camps. */
  soulTier?: number;
};

type Scale = { damage?: number; maxHp?: number; armor?: number; regen?: number };

export function calibrationBuilds(references: readonly ReferenceBuild[]): CalibrationBuild[] {
  const map = (number: number) => CAMPAIGN_MAP_IDS[number - 1];
  const reference = (mapId: string) => references.find(entry => entry.mapId === mapId)!;
  function campaign(name: string, note: string, seed: number, mapNumber: number, scale: Scale, extra: Partial<VirtualPlayerProfile> = {}): CalibrationBuild {
    const build = reference(map(mapNumber));
    return {
      name, note, nextMap: map(mapNumber + 1) ?? proceduralMapId(1),
      profile: {
        name, seed, startMap: map(mapNumber), highestUnlocked: mapNumber - 1, bossBeaten: true, push: 'normal', advance: false,
        base: { damage: build.stats.damage * (scale.damage ?? 1), maxHp: build.stats.maxHp * (scale.maxHp ?? 1),
          armor: build.stats.armor * (scale.armor ?? 1), regen: build.stats.regen * (scale.regen ?? 1), attackRate: build.stats.attackRate },
        weapon: build.equipped.weapon || 'starter_bow', head: build.equipped.head, chest: build.equipped.chest, ...extra,
      },
    };
  }
  const last = reference(map(15));
  const endlessBase = last.exit ? { base: last.exit.stats, weapon: last.exit.equipped.weapon, head: last.exit.equipped.head, chest: last.exit.equipped.chest }
    : { base: { ...last.stats, damage: last.stats.damage * 3, maxHp: last.stats.maxHp * 3, armor: last.stats.armor * 3, regen: last.stats.regen * 3 } };
  const endless: CalibrationBuild = {
    name: 'endless-entrant', note: 'Endless 1, map 15 cleared', nextMap: proceduralMapId(2),
    profile: { ...campaign('endless-entrant', '', 7, 15, {}).profile, ...endlessBase, startMap: proceduralMapId(1), highestUnlocked: 15, endlessCompleted: 0 },
  };
  const soulReference = reference(map(8));
  const soul: CalibrationBuild = {
    name: 'soul', note: 'Soul Dimension, tier 5, map 8 build', nextMap: null, soulTier: 5,
    profile: { name: 'soul', seed: 13, startMap: SOUL_MAP_ID, highestUnlocked: 15, push: 'normal', advance: false,
      base: { ...soulReference.stats }, weapon: soulReference.equipped.weapon || 'starter_bow', head: soulReference.equipped.head, chest: soulReference.equipped.chest },
  };
  const glass = { damage: 1.5, maxHp: .6, armor: .6 };
  return [
    { name: 'fresh', note: 'map 1, starting stats', nextMap: map(2),
      profile: { name: 'fresh', seed: 1, startMap: map(1), highestUnlocked: 0, bossBeaten: true, weapon: 'starter_bow', push: 'normal', advance: false,
        base: { damage: PLAYER_BASE_DAMAGE, maxHp: PLAYER_BASE_HP, armor: 0, regen: PLAYER_BASE_REGEN, attackRate: DEFAULT_ATTACK_INTERVAL } } },
    campaign('early', 'map 3, Lab entry build', 14, 3, {}),
    campaign('glass-cannon', 'map 5, damage 1.5x, defence 0.6x', 2, 5, glass),
    campaign('tank', 'map 5, damage 0.6x, defence 1.5x', 3, 5, { damage: .6, maxHp: 1.5, armor: 1.5, regen: 1.5 }),
    campaign('overpowered', 'map 6, every stat 6x', 12, 6, { damage: 6, maxHp: 6, armor: 6, regen: 6 }),
    campaign('research-crits', 'map 7, research incl. crits and respawn', 15, 7, {}, {
      research: { warcraft: 25, vitality: 20, precision: 20, regeneration: 20, criticalChance: 25, criticalDamage: 20, moveSpeed: 10, foraging: 10, prosperity: 5, enemyRespawn: 6 } }),
    campaign('multishot-skills', 'map 8, 3 arrows, bow skills 6% each', 4, 8, { damage: .85, maxHp: .85, armor: .85, regen: .85 },
      { projectileCount: 3, bowSkills: { arrowStorm: 6, ricochet: 6, piercingShot: 6 } }),
    campaign('under-geared', 'map 9, every stat 0.5x', 8, 9, { damage: .5, maxHp: .5, armor: .5, regen: .5 }),
    campaign('perks', 'map 10, prestige 10 with perks', 5, 10, { damage: .8, maxHp: .8, armor: .8, regen: .8 },
      { prestigeLevel: 10, perks: { riposte: 3, secondWind: 2, bossSlayer: 2, doubleStrike: 2, splitShot: 1, keenEdge: 2 } }),
    campaign('late-balanced', 'map 13, Lab entry build', 6, 13, {}),
    campaign('final', 'map 15, Lab entry build x1.5', 16, 15, { damage: 1.5, maxHp: 1.5, armor: 1.5, regen: 1.5 }),
    // Reflect Only: Reflect does all the damage (the profile's own, profiles.ts).
    campaign('reflect-only', 'map 4, Reflect Only, Reflect 5', 11, 4, { maxHp: 1.2, armor: 1.2, regen: 1.2 }, { reflectOnly: true, perks: { riposte: 5 }, prestigeLevel: 5 }),
    endless,
    soul,
  ];
}

/** The same build on the map after its own: unlocked, its boss unbeaten. */
export function nextMapProfile(build: CalibrationBuild): VirtualPlayerProfile | null {
  if (!build.nextMap) return null;
  const index = CAMPAIGN_MAP_IDS.indexOf(build.nextMap);
  const endless = /^endless_(\d+)$/.exec(build.nextMap);
  return { ...build.profile, startMap: build.nextMap, bossBeaten: false,
    highestUnlocked: index >= 0 ? index : 15, endlessCompleted: endless ? Number(endless[1]) - 1 : build.profile.endlessCompleted };
}

/**
 * One build with one thing changed at a time, for what each adds to the damage
 * it deals: map 8's Lab build, defence six times over so nothing dies and the
 * kills alone say how fast it kills (single targets and pulled crowds alike).
 */
export function ablationBuilds(references: readonly ReferenceBuild[]): CalibrationBuild[] {
  const reference = references.find(entry => entry.mapId === CAMPAIGN_MAP_IDS[7])!;
  const base = { ...reference.stats, maxHp: reference.stats.maxHp * 6, armor: reference.stats.armor * 6, regen: reference.stats.regen * 6 };
  const variant = (name: string, seed: number, extra: Partial<VirtualPlayerProfile>): CalibrationBuild => ({
    name: `ablation-${name}`, note: `map 8, defence 6x: ${name}`, nextMap: null,
    profile: { name: `ablation-${name}`, seed, startMap: CAMPAIGN_MAP_IDS[7], highestUnlocked: 7, bossBeaten: true, push: 'normal', advance: false,
      base, weapon: reference.equipped.weapon || 'starter_bow', head: reference.equipped.head, chest: reference.equipped.chest, ...extra },
  });
  return [
    variant('plain', 21, {}),
    variant('arrows3', 22, { projectileCount: 3 }),
    variant('arrows5', 23, { projectileCount: 5 }),
    variant('storm', 24, { bowSkills: { arrowStorm: 12 } }),
    variant('ricochet', 25, { bowSkills: { ricochet: 12 } }),
    variant('pierce', 26, { bowSkills: { piercingShot: 12 } }),
    variant('double-strike', 27, { prestigeLevel: 0, perks: { doubleStrike: 5 } }),
    variant('split-shot', 28, { prestigeLevel: 0, perks: { splitShot: 5 } }),
    variant('crits', 29, { research: { criticalChance: 40, criticalDamage: 30 } }),
    variant('reflect-second-wind', 30, { prestigeLevel: 0, perks: { riposte: 5, secondWind: 5 } }),
  ];
}
