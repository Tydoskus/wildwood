import { ENEMY_TYPES, type EnemyDefinition, type RewardType } from "../enemies";
import { runtimeMapBalance } from "../../../shared/map-balance-runtime";
import { offlineEnemyRoster } from "../../../shared/offline-progress";
import { BOSS_DAMAGE_PROFILES } from "../../../shared/boss-damage";
import { BOSSES, bossForMap } from "./boss-registry";
import type { EnemyState } from "./types";
import type { SpawnSite } from "../world";
import { isProceduralMap } from "../../../shared/procedural-maps";
import type { MapBalanceSnapshot } from "../../../shared/map-balance-types";

/**
 * The Enemy Index's rows for a map, shown in the map window: each kind of
 * enemy with its health, one hit before armor and what a kill pays (as the
 * enemies' own labels show it), weakest first, then the map's boss with every
 * attack it has. The map the player is on reads its live enemies and balance;
 * any other map reads its live balance from the server (get_map_index_balance),
 * and only without it the copy the game ships, which lags the balance editor.
 */
export type EnemyIndexRow = { name: string; elite: boolean; hp: number; hit: number; reward: EnemyDefinition["reward"];
  /** The map's boss: its hit is its strongest attack, and it may pay several rewards (or none). */
  boss?: { rewards: EnemyDefinition["reward"][]; attacks: { name: string; hit: number }[] } };
type Paid = (type: RewardType, amount: number) => number;

/** "laserGrid" → "Laser Grid". */
const attackName = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, letter => letter.toUpperCase());
const paidRewards = (rewards: EnemyDefinition["reward"][], paid: Paid) => rewards.filter(reward => reward.amount > 0)
  .map(reward => ({ type: reward.type, amount: paid(reward.type, reward.amount) }));

function bossRow(name: string, hp: number, attackHits: Record<string, number>, contact: number, rewards: EnemyDefinition["reward"][]): EnemyIndexRow {
  const attacks = Object.entries(attackHits).filter(([, hit]) => hit > 0).map(([key, hit]) => ({ name: attackName(key), hit }));
  if (contact > 0 && !attacks.some(attack => attack.name === "Contact")) attacks.push({ name: "Contact", hit: contact });
  attacks.sort((a, b) => b.hit - a.hit);
  return { name, elite: false, hp, hit: attacks[0]?.hit ?? 0, reward: rewards[0] ?? { type: "damage", amount: 0 }, boss: { rewards, attacks } };
}

/** An Endless map's boss, as it is named when it spawns ("Warden - 9"). */
const endlessBossName = (mapId: string) => isProceduralMap(mapId) ? `Warden - ${mapId.replace(/^\D+/, "")}` : "Endless Boss";

/** The boss of the map the player is on: a campaign boss from the live balance, an Endless boss from its own stats (or its balance while it is dead). */
export function liveBossRow(mapId: string, paid: Paid, enemies: readonly EnemyState[] = []): EnemyIndexRow | null {
  const balance = runtimeMapBalance(mapId)?.boss, boss = bossForMap(mapId);
  const fromBalance = (name: string) => bossRow(name, balance!.hp, balance!.attacks, balance!.damage,
    paidRewards(Object.entries(balance!.rewards).map(([type, amount]) => ({ type: type as RewardType, amount })), paid));
  if (balance && boss) return fromBalance(boss.name);
  const generated = enemies.find(enemy => enemy.generatedBoss && !enemy.remoteCombatGhost);
  if (!generated) return balance && isProceduralMap(mapId) ? fromBalance(endlessBossName(mapId)) : null;
  const rewards = paidRewards(generated.bossRewards ?? [], paid);
  return { name: generated.displayName ?? generated.campName, elite: false, hp: generated.maxHp, hit: generated.damage,
    reward: rewards[0] ?? { type: "damage", amount: 0 }, boss: { rewards, attacks: [{ name: "Hit", hit: generated.damage }] } };
}

/**
 * One row per enemy on the map the player is on, weakest first. Bosses and
 * other players' ghosts are left off. A killed enemy leaves `enemies` until it
 * respawns, so the map's spawn sites add every kind with none alive just now.
 */
export function liveEnemyRows(enemies: readonly EnemyState[], paid: Paid, sites: readonly Pick<SpawnSite, "type" | "definition">[] = []): EnemyIndexRow[] {
  // One row per name: Endless gives several lanes the same base kind under their own names and stats.
  const rows = new Map<string, EnemyIndexRow>();
  for (const enemy of enemies) {
    const key = enemy.displayName ?? enemy.type;
    if (enemy.generatedBoss || enemy.remoteCombatGhost || rows.has(key)) continue;
    rows.set(key, { name: key, elite: Boolean((enemy.definition ?? ENEMY_TYPES[enemy.type])?.elite),
      hp: enemy.maxHp, hit: enemy.damage, reward: { ...enemy.reward, amount: paid(enemy.reward.type, enemy.reward.amount) } });
  }
  for (const site of sites) {
    const base = site.definition ?? ENEMY_TYPES[site.type as keyof typeof ENEMY_TYPES];
    if (!base || rows.has(site.type)) continue;
    rows.set(site.type, { name: site.type, elite: Boolean(base.elite), hp: base.hp, hit: base.damage,
      reward: { ...base.reward, amount: paid(base.reward.type, base.reward.amount) } });
  }
  return [...rows.values()].sort((a, b) => a.hp - b.hp);
}

/** Another map's enemies and boss: from its live balance when given, else the copy the game ships. */
export function plannedEnemyRows(mapId: string, paid: Paid, balance?: MapBalanceSnapshot | null): EnemyIndexRow[] {
  const rows = offlineEnemyRoster(mapId, balance ?? undefined).map(entry => ({ name: entry.enemy, elite: Boolean(ENEMY_TYPES[entry.enemy as keyof typeof ENEMY_TYPES]?.elite),
    hp: entry.hp, hit: entry.damage, reward: { type: entry.reward.type as RewardType, amount: paid(entry.reward.type as RewardType, entry.reward.amount) } }))
    .sort((a, b) => a.hp - b.hp);
  const boss = bossForMap(mapId);
  if (balance?.boss) {
    const rewards = paidRewards(Object.entries(balance.boss.rewards).map(([type, amount]) => ({ type: type as RewardType, amount })), paid);
    return [...rows, bossRow(boss?.name ?? endlessBossName(mapId), balance.boss.hp, balance.boss.attacks, balance.boss.damage, rewards)];
  }
  const profile = boss ? BOSS_DAMAGE_PROFILES[boss.kind as keyof typeof BOSS_DAMAGE_PROFILES] : undefined;
  return boss && profile ? [...rows, bossRow(boss.name, BOSSES[boss.kind].maxHp(), profile, 0, [])] : rows;
}

/** The index for a map: live on the player's own map (with its spawn sites), its fetched balance elsewhere. */
export function enemyIndexRows(mapId: string, liveEnemies: readonly EnemyState[] | null, paid: Paid, balance?: MapBalanceSnapshot | null,
  sites: readonly Pick<SpawnSite, "type" | "definition">[] = []): EnemyIndexRow[] {
  if (!liveEnemies) return plannedEnemyRows(mapId, paid, balance);
  const boss = liveBossRow(mapId, paid, liveEnemies);
  return [...liveEnemyRows(liveEnemies, paid, sites), ...boss ? [boss] : []];
}
