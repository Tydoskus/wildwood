import { runtimeMapBalance } from '../../../shared/map-balance-runtime';
import { bossRegenFractionFor } from "../../../shared/boss-regeneration";
import { personalBossDefinition } from "../../../shared/personal-bosses";
import type { RespawnMemory } from './respawn-memory';
import type { BossFightMemory } from './boss-fight-memory';

/** Local combat owns HP. Only the completed defeat is sent to the reward queue. */
export function createPersonalBosses(options: {
  mapId: () => string; identity: () => string; alive: () => boolean; now: () => number;
  defeated: (mapId: string) => void;
  respawns?: RespawnMemory;
  fights?: BossFightMemory;
  ready?: () => boolean;
}) {
  type State = { key: string; mapId: string; encounter: bigint; hp: number; maxHp: number; alive: boolean; respawnAtMs: number; respawnAtMicros: bigint };
  type Result = { encounter: bigint; totalDamage: number; createdAtMs: number; contributors: { identity: string; name: string; gender: 0; damage: number; percentage: number }[] };
  const states = new Map<string, State>(), results = new Map<string, Result>();
  let owner = "", activeMap = "", encounter = BigInt(Date.now()) * 1000n;
  function refresh() {
    if (owner !== options.identity()) { owner = options.identity(); states.clear(); results.clear(); activeMap = ""; }
    const mapId = options.mapId();
    // Death leaves the encounter and its HP intact; only deliberate travel resets it.
    if (activeMap !== mapId) {
      if (activeMap) options.fights?.clear();
      const old = states.get(activeMap);
      if (old?.alive) { old.hp = old.maxHp; old.encounter = ++encounter; }
      activeMap = mapId;
    }
  }
  function state(mapId: string): State | null {
    if (options.ready?.() === false) return null;
    refresh();
    if (mapId !== activeMap) return null;
    const definition = personalBossDefinition(mapId);
    if (!definition) return null;
    let row = states.get(mapId);
    if (row && row.maxHp !== definition.hp) { row.hp = row.hp / row.maxHp * definition.hp; row.maxHp = definition.hp; }
    if (!row || (!row.alive && options.now() >= row.respawnAtMs)) {
      row = { key: `${owner}:${mapId}`, mapId, encounter: ++encounter, hp: definition.hp, maxHp: definition.hp, alive: true, respawnAtMs: 0, respawnAtMicros: 0n };
      const remaining = options.respawns?.remaining(`boss:${mapId}`) ?? 0;
      if (remaining > 0) {
        row.alive = false; row.hp = 0;
        row.respawnAtMs = options.now() + remaining;
        row.respawnAtMicros = BigInt(Math.round(row.respawnAtMs * 1000));
      } else {
        row.hp = options.fights?.restore(mapId, definition.hp) ?? row.hp;
      }
      // Only a handful of recently visited maps need local respawn clocks.
      if (states.size >= 8 && !states.has(mapId)) { const key = states.keys().next().value!; states.delete(key); results.delete(key); }
      states.set(mapId, row);
    }
    return { ...row };
  }
  return {
    state,
    update(dt: number) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      const current = state(options.mapId());
      if (!current?.alive || current.hp >= current.maxHp) return;
      const row = states.get(current.mapId)!;
      row.hp = Math.min(row.maxHp, row.hp + row.maxHp * (runtimeMapBalance(row.mapId)?.boss?.regenFraction ?? bossRegenFractionFor(row.mapId)) * dt);
      if (row.hp >= row.maxHp) options.fights?.clear();
      else options.fights?.remember(row.mapId, row.hp, row.maxHp);
    },
    proceduralState: state,
    result(mapId: string) { if (options.ready?.() === false) return null; refresh(); return results.get(mapId) ?? null; },
    hit(mapId: string, damage: number) {
      const current = state(mapId);
      if (!current?.alive || !options.alive() || !Number.isFinite(damage) || damage <= 0) return;
      const row = states.get(mapId)!;
      row.hp = Math.max(0, row.hp - damage);
      if (row.hp > 0) { options.fights?.remember(mapId, row.hp, row.maxHp); return; }
      options.fights?.clear();
      row.alive = false;
      row.respawnAtMs = options.now() + personalBossDefinition(mapId)!.respawnSeconds * 1000;
      row.respawnAtMicros = BigInt(Math.round(row.respawnAtMs * 1000));
      options.respawns?.remember(`boss:${mapId}`, row.respawnAtMs - options.now());
      results.set(mapId, { encounter: row.encounter, totalDamage: row.maxHp, createdAtMs: options.now(),
        contributors: [{ identity: owner, name: "You", gender: 0, damage: row.maxHp, percentage: 100 }] });
      options.defeated(mapId);
    },
  };
}
