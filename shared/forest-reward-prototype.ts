import { DEFAULT_ATTACK_INTERVAL } from "./rules";

/** Isolated fixed-target experiment, not a replacement for live enemy combat. */
export const FOREST_REWARD_PROTOTYPE = {
  enemy: "Spitter", enemyHp: 24, damageReward: 1, initialDamage: 10,
  attackIntervalMicros: BigInt(Math.round(DEFAULT_ATTACK_INTERVAL * 1_000_000)),
  windupMicros: 120_000n, respawnMicros: 5_000_000n, maxBatch: 3,
} as const;

export type ForestPrototypeState = {
  encounter: bigint;
  enemyHp: number;
  damage: number;
  kills: bigint;
  lastAttack: bigint;
  nextAttackAt: bigint;
  respawnAt: bigint;
};

export type ForestPrototypeAttack = { encounter: bigint; firstAttack: bigint; count: number };
