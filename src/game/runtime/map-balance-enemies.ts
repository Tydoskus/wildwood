import type { MapBalanceSnapshot } from '../../../shared/map-balance-types';
import { generateMap, isProceduralMap } from '../../../shared/procedural-maps';
import { ENEMY_TYPES } from '../../../shared/enemy-definitions';
import type { SpawnSite } from '../world';
import type { EnemyState } from './types';
/** A map can be constructed while its network reply is arriving. Combat stays
 * gated until these already-created spawn records receive the resolved values. */
export function refreshMapBalanceEnemies(snapshot: MapBalanceSnapshot, sites: SpawnSite[], enemies: EnemyState[]) {
  const map = isProceduralMap(snapshot.mapId) ? generateMap(snapshot.mapId) : null;
  for (const site of sites) {
    let base = snapshot.enemies[site.type];
    if (!base) continue;
    if (map) {
      let index = site.id;
      for (const camp of map.camps) {
        if (index < camp.count) {
          const lane = camp.stat === 'damage' && index >= 6 ? 'Dread Warden' : camp.lane;
          base = { ...base, ...snapshot.lanes[lane], elite: false };
          break;
        }
        index -= camp.count;
      }
      site.definition = base;
    }
    for (const enemy of enemies) {
      if (enemy.generatedBoss || enemy.dead || enemy.siteId !== site.id) continue;
      const definition = map ? base : ENEMY_TYPES[site.type];
      enemy.hp = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp)) * definition.hp;
      enemy.maxHp = definition.hp; enemy.damage = definition.damage; enemy.speed = definition.speed;
      enemy.reward = definition.reward;
      if (map) enemy.definition = definition;
    }
  }
}
