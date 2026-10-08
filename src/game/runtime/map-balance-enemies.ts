import type { MapBalanceSnapshot } from '../../../shared/map-balance-types';
import { generateMap, isProceduralMap } from '../../../shared/procedural-maps';
import { ENEMY_TYPES, type EnemyDefinition } from '../../../shared/enemy-definitions';
import type { SpawnSite } from '../world';
import type { EnemyState } from './types';

/**
 * What a site's enemy is under a map's balance: an Endless camp's lane over
 * the generated art, a campaign kind's row as map-balance-loader.ts installs it.
 * Null when the balance has no row for it. Reads no installed state, so another
 * map's balance can be priced too (the growth forecast's next map).
 */
export function balancedSiteDefinition(snapshot: MapBalanceSnapshot, site: Pick<SpawnSite, 'id' | 'type'>,
  camps = isProceduralMap(snapshot.mapId) ? generateMap(snapshot.mapId).camps : null): EnemyDefinition | null {
  const base = snapshot.enemies[site.type];
  if (!base) return null;
  if (!camps) return { ...ENEMY_TYPES[site.type], regen: 0, armor: 0, ...base };
  let index = site.id;
  for (const camp of camps) {
    if (index < camp.count) {
      const lane = camp.stat === 'damage' && index >= 6 ? 'Dread Warden' : camp.lane;
      return { ...base, ...snapshot.lanes[lane], elite: false };
    }
    index -= camp.count;
  }
  return base;
}

/** A map can be constructed while its network reply is arriving. Combat stays
 * gated until these already-created spawn records receive the resolved values. */
export function refreshMapBalanceEnemies(snapshot: MapBalanceSnapshot, sites: SpawnSite[], enemies: EnemyState[]) {
  const camps = isProceduralMap(snapshot.mapId) ? generateMap(snapshot.mapId).camps : null, procedural = Boolean(camps);
  for (const site of sites) {
    if (!snapshot.enemies[site.type]) continue;
    const base = camps ? balancedSiteDefinition(snapshot, site, camps)! : snapshot.enemies[site.type];
    if (procedural) site.definition = base;
    for (const enemy of enemies) {
      if (enemy.generatedBoss || enemy.dead || enemy.siteId !== site.id) continue;
      const definition = procedural ? base : ENEMY_TYPES[site.type];
      enemy.hp = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp)) * definition.hp;
      enemy.maxHp = definition.hp; enemy.damage = definition.damage; enemy.speed = definition.speed;
      enemy.reward = definition.reward;
      if (procedural) enemy.definition = definition;
    }
  }
}
