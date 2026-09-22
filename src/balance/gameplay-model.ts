import { enemyDefeatDefinition } from "../../shared/enemy-defeats";
import { regularMapLoot } from "../../shared/regular-map-loot";
import type { EnemyKind } from "../../shared/enemy-definitions";
import { BLACK_BOOTS_SPEED_BONUS, type ItemId } from "../../shared/items";
import { PLAYER_SPEED, MOVE_SPEED_RESEARCH_BONUS_PER_RANK } from "../../shared/rules";

/** Use the server's catalog and eligibility, including fractional drop odds. */
export function simulationRegularDrops(mapId: string): {
  itemId: ItemId; numerator: number; denominator: number; eligible: (enemy: EnemyKind) => boolean;
}[] {
  const eligibility = new Map<EnemyKind, boolean>();
  const eligible = (enemy: EnemyKind) => {
    if (!eligibility.has(enemy)) eligibility.set(enemy, enemyDefeatDefinition(mapId, enemy)?.loot === true);
    return eligibility.get(enemy)!;
  };
  return regularMapLoot(mapId).map(drop => ({
    itemId: drop.itemId, numerator: drop.wins, denominator: drop.outcomes, eligible,
  }));
}

/** Black Boots are a flat bonus, so travel no longer waits out a combat delay. */
export function simulationTravelSeconds(distance: number, moveSpeedRank: number, blackBoots: boolean) {
  const base = PLAYER_SPEED * (1 + moveSpeedRank * MOVE_SPEED_RESEARCH_BONUS_PER_RANK);
  return Math.max(0, distance) / (base + (blackBoots ? BLACK_BOOTS_SPEED_BONUS : 0));
}
