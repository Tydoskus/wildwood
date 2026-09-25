import type { MapBalanceSnapshot } from '../../../shared/map-balance-types';
import { installMapBalance } from '../../../shared/map-balance-runtime';
import { installBossRuleValues } from '../../../shared/rules';
import { ENEMY_TYPES, type EnemyKind } from '../../../shared/enemy-definitions';
import { BOSS_DAMAGE_PROFILES } from '../../../shared/boss-damage';
export function applyMapBalance(snapshot: MapBalanceSnapshot) {
  if (snapshot.schema !== 1) throw new Error('Unsupported map balance. Update WildStat.');
  installMapBalance(snapshot);
  for (const [kind, row] of Object.entries(snapshot.enemies)) if (Object.prototype.hasOwnProperty.call(ENEMY_TYPES, kind)) Object.assign(ENEMY_TYPES[kind as EnemyKind], row);
  installBossRuleValues(snapshot.rules);
  if (snapshot.boss && Object.prototype.hasOwnProperty.call(BOSS_DAMAGE_PROFILES, snapshot.boss.kind)) {
    Object.assign(BOSS_DAMAGE_PROFILES[snapshot.boss.kind as keyof typeof BOSS_DAMAGE_PROFILES], snapshot.boss.attacks);
  }
}
/** Coalesces frame-by-frame loading checks; never installs a stale response. */
export function createMapBalanceLoader(options: { identity: () => string; mapId: () => string; fetch: (mapId: string) => Promise<MapBalanceSnapshot>; changed: (snapshot: MapBalanceSnapshot) => void }) {
  let readyKey = '', pendingKey = '', generation = 0, retryAt = 0;
  let pending: Promise<void> | null = null;
  const keyFor = (mapId: string) => `${options.identity()}:${mapId}`;
  return {
    ready(mapId: string) { return readyKey === keyFor(mapId); },
    reset() { generation++; readyKey = ''; pendingKey = ''; pending = null; retryAt = 0; installMapBalance(null); },
    async ensure(mapId: string) {
      if (!options.identity() || options.mapId() !== mapId) return;
      const key = keyFor(mapId);
      if (readyKey === key) return;
      if (pendingKey === key && pending) return pending;
      if (Date.now() < retryAt) throw new Error('Retrying map balance.');
      const attempt = ++generation;
      pendingKey = key;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      pending = Promise.race([options.fetch(mapId), new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Map balance timed out. Retrying…')), 12_000);
      })]).then(snapshot => {
        if (attempt !== generation || options.mapId() !== mapId || keyFor(mapId) !== key) return;
        if (snapshot.mapId !== mapId) throw new Error('Wrong map balance response.');
        applyMapBalance(snapshot); readyKey = key; retryAt = 0; options.changed(snapshot);
      }).catch(error => { if (attempt === generation) retryAt = Date.now() + 1500; throw error; })
        .finally(() => { clearTimeout(timeout); if (attempt === generation) { pendingKey = ''; pending = null; } });
      return pending;
    },
  };
}
