import { CAMPAIGN_PROGRESSION_ENEMIES } from './campaign-progression';
import { CAMPAIGN_MAPS } from './campaign-registry';
import { ENEMY_BASE_VALUES } from './enemy-base-values';
import { enemyDefeatDefinition } from './enemy-defeats';
import type { EnemyDefinition } from './enemy-definitions';
import type { BalanceSettings } from './map-balance-types';

const rosters = new Map<string, EnemyDefinition[]>();
const role = (enemy: EnemyDefinition) => `${enemy.elite ? 'elite' : 'regular'}:${enemy.reward.type}`;
/** Floor each stat/rarity at the largest matching reward in earlier maps. */
export function applyCampaignRewardFloor(mapId: string, settings: BalanceSettings, enemies: Record<string, EnemyDefinition>) {
  const floors = new Map<string, number>();
  for (const map of CAMPAIGN_MAPS) {
    if (map.id === mapId) break;
    let roster = rosters.get(map.id);
    if (!roster) {
      roster = Object.entries(ENEMY_BASE_VALUES).filter(([kind]) => enemyDefeatDefinition(map.id, kind)).map(([, enemy]) => enemy);
      rosters.set(map.id, roster);
    }
    for (const enemy of roster) {
      const key = role(enemy);
      const curve = settings.campaignProgressionVersion === 1 && map.id !== CAMPAIGN_MAPS[0].id ? CAMPAIGN_PROGRESSION_ENEMIES[map.id]?.[key] : undefined;
      const amount = (curve?.reward ?? enemy.reward.amount) * (settings.maps[map.id]?.enemyRewards ?? 1);
      floors.set(key, Math.max(floors.get(key) ?? 0, amount));
    }
  }
  for (const enemy of Object.values(enemies)) {
    enemy.reward.amount = Math.max(enemy.reward.amount, floors.get(role(enemy)) ?? 0);
  }
}
