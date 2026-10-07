import { MAP_IDS as CAMPAIGN_MAP_IDS, DEFAULT_ATTACK_INTERVAL, PLAYER_BASE_DAMAGE, PLAYER_BASE_HP, PLAYER_BASE_REGEN } from '../../../../shared/rules';
import type { ReferenceBuild } from './reference-builds';
import type { VirtualPlayerProfile } from './virtual-player';

type Scale = { damage?: number; maxHp?: number; armor?: number; regen?: number };

/**
 * The virtual players. Campaign players start from the Balance Lab's build on
 * arrival at their map (reference-builds.ts), each stat scaled, wearing the
 * gear the Lab had found by then. "Map n" counts from 1 = Forest.
 */
export function virtualPlayers(references: readonly ReferenceBuild[]): VirtualPlayerProfile[] {
  const map = (number: number) => CAMPAIGN_MAP_IDS[number - 1];
  const reference = (mapId: string) => references.find(entry => entry.mapId === mapId)!;
  function campaignPlayer(name: string, seed: number, mapNumber: number, scale: Scale, extra: Partial<VirtualPlayerProfile> = {}): VirtualPlayerProfile {
    const build = reference(map(mapNumber));
    return {
      name, seed, startMap: map(mapNumber), highestUnlocked: mapNumber - 1, push: 'normal', advance: true,
      base: { damage: build.stats.damage * (scale.damage ?? 1), maxHp: build.stats.maxHp * (scale.maxHp ?? 1),
        armor: build.stats.armor * (scale.armor ?? 1), regen: build.stats.regen * (scale.regen ?? 1), attackRate: build.stats.attackRate },
      weapon: build.equipped.weapon || 'starter_bow', head: build.equipped.head, chest: build.equipped.chest, ...extra,
    };
  }
  const glass = { damage: 1.5, maxHp: .6, armor: .6 };
  const last = reference(map(15));
  const endless: VirtualPlayerProfile = {
    ...campaignPlayer('endless-entrant', 7, 15, {}), bossBeaten: true,
    // Map 15 cleared: the Lab's build leaving it, or three times its entry where the Lab never left.
    ...(last.exit ? { base: last.exit.stats, weapon: last.exit.equipped.weapon, head: last.exit.equipped.head, chest: last.exit.equipped.chest }
      : { base: { ...last.stats, damage: last.stats.damage * 3, maxHp: last.stats.maxHp * 3, armor: last.stats.armor * 3, regen: last.stats.regen * 3 } }),
  };
  return [
    { name: 'fresh', seed: 1, startMap: map(1), highestUnlocked: 0, weapon: 'starter_bow', push: 'normal', advance: true,
      base: { damage: PLAYER_BASE_DAMAGE, maxHp: PLAYER_BASE_HP, armor: 0, regen: PLAYER_BASE_REGEN, attackRate: DEFAULT_ATTACK_INTERVAL } },
    campaignPlayer('glass-cannon', 2, 5, glass),
    campaignPlayer('tank', 3, 5, { damage: .6, maxHp: 1.5, armor: 1.5, regen: 1.5 }),
    // Multishot and all three bow skills, on the Lab's bow (a skill bow at this tier).
    campaignPlayer('multishot-skills', 4, 8, { damage: .85, maxHp: .85, armor: .85, regen: .85 },
      { projectileCount: 3, bowSkills: { arrowStorm: 6, ricochet: 6, piercingShot: 6 } }),
    campaignPlayer('perks', 5, 10, { damage: .8, maxHp: .8, armor: .8, regen: .8 },
      { prestigeLevel: 10, perks: { riposte: 3, secondWind: 2, bossSlayer: 2, doubleStrike: 2, splitShot: 1 } }),
    campaignPlayer('late-balanced', 6, 13, {}),
    // Far stronger than its map: it should beat every boss in turn and keep moving on, never settle.
    campaignPlayer('overpowered', 12, 6, { damage: 6, maxHp: 6, armor: 6, regen: 6 }),
    endless,
    campaignPlayer('under-geared-wall', 8, 9, { damage: .5, maxHp: .5, armor: .5, regen: .5 }),
    campaignPlayer('glass-bold', 9, 5, glass, { push: 'bold' }),
    campaignPlayer('glass-safe', 10, 5, glass, { push: 'safe' }),
    // Reflect Only: Reflect does all the damage; the boss and next map are left to the player.
    campaignPlayer('reflect-only', 11, 4, { maxHp: 1.2, armor: 1.2, regen: 1.2 }, { reflectOnly: true, perks: { riposte: 5 }, prestigeLevel: 5 }),
  ];
}

