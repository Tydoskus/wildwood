import { expect, it } from "vitest";
import { enemyIndexRows, liveEnemyRows, plannedEnemyRows } from "./enemy-index-rows";
import type { EnemyState } from "./types";
import { defaultBalanceSettings, resolveMapBalance } from "../../../shared/map-balance";

const enemy = (type: string, maxHp: number, extra: Partial<EnemyState> = {}) => ({
  type, maxHp, damage: maxHp / 10, reward: { type: "damage", amount: 2 }, ...extra,
}) as EnemyState;
const paid = (_type: string, amount: number) => amount * 3;

it("lists each enemy on the player's map once, weakest first, paid as the player is paid", () => {
  const rows = liveEnemyRows([
    enemy("Needle", 90), enemy("Bramble", 42), enemy("Needle", 90),
    enemy("Ghost", 5, { remoteCombatGhost: true }), enemy("Boss", 9, { generatedBoss: true }),
  ], paid);
  expect(rows.map(row => row.name)).toEqual(["Bramble", "Needle"]);
  expect(rows[0]).toMatchObject({ hp: 42, hit: 4.2, reward: { type: "damage", amount: 6 } });
});

it("lists Endless lanes that share a base kind under their own names", () => {
  const rows = liveEnemyRows([
    enemy("Bramble", 100, { displayName: "Gloom Raider" }), enemy("Bramble", 300, { displayName: "Gloom Regent" }), enemy("Bramble", 100, { displayName: "Gloom Raider" }),
  ], paid);
  expect(rows.map(row => row.name)).toEqual(["Gloom Raider", "Gloom Regent"]);
});

it("lists another map from the shipped balance, its boss last with every attack", () => {
  const rows = plannedEnemyRows("beginner_desert", paid);
  expect(rows.length).toBeGreaterThan(3);
  const boss = rows[rows.length - 1];
  expect(boss.boss).toBeTruthy();
  expect(boss.boss!.attacks.length).toBeGreaterThan(1);
  expect(boss.hit).toBe(boss.boss!.attacks[0].hit);
  expect(rows.slice(0, -1).every((row, index, all) => index === 0 || all[index - 1].hp <= row.hp)).toBe(true);
  // Live when the player stands there, planned when not.
  expect(enemyIndexRows("beginner_desert", null, paid)).toEqual(rows);
  expect(enemyIndexRows("beginner_desert", [enemy("Bramble", 42)], paid)[0].name).toBe("Bramble");
});

it("lists another map from its live balance when the server sends it", () => {
  const balance = resolveMapBalance("beginner_desert", defaultBalanceSettings(), 7);
  const firstKind = Object.keys(balance.enemies).find(kind => plannedEnemyRows("beginner_desert", paid).some(row => row.name === kind))!;
  balance.enemies[firstKind] = { ...balance.enemies[firstKind], damage: 12345 };
  balance.boss = { ...balance.boss!, hp: 987654, damage: 0, attacks: { slam: 4321, spin: 99 }, rewards: { damage: 50 } };
  const rows = enemyIndexRows("beginner_desert", null, paid, balance);
  expect(rows.find(row => row.name === firstKind)!.hit).toBe(12345);
  const boss = rows[rows.length - 1];
  expect(boss.hp).toBe(987654);
  expect(boss.boss!.attacks.map(attack => attack.name)).toEqual(["Slam", "Spin"]);
  expect(boss.boss!.rewards).toEqual([{ type: "damage", amount: paid("damage", 50) }]);
});
