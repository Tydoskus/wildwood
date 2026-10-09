import { expect, it, vi } from "vitest";
import { createSoulDefenseForce, SOUL_DEFENSE_FORCE_KILLS, SOUL_DEFENSE_FORCE_NAME } from "./soul-defense-force";
import type { SpawnSite } from "../world";
import type { EnemyState, PlayerState } from "./types";

function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const player = { x: 1000, y: 1000, r: 20, hp: 100, maxHp: 100 } as PlayerState;
  const enemies: EnemyState[] = [];
  const spawnFromSite = (site: SpawnSite) => {
    const definition = site.definition!;
    enemies.push({ x: site.x, y: site.y, r: definition.r, hp: definition.hp, maxHp: definition.hp, dead: false, engaged: false, speed: definition.speed,
      campName: site.campName, siteId: site.id, type: site.type, facingX: 1 } as unknown as EnemyState);
  };
  const damagePlayer = vi.fn((damage: number) => { player.hp -= damage; });
  const message = vi.fn();
  const sendToTown = vi.fn(async () => true);
  const force = createSoulDefenseForce({ identity: () => "me", player, enemies, spawnFromSite, damagePlayer, message, storage: () => storage, sendToTown, wait: async () => {},
    strength: () => ({ dps: 100, maxHp: 100, armor: 0, regen: 0 }) });
  const killAll = (count = SOUL_DEFENSE_FORCE_KILLS) => { for (let i = 0; i < count; i++) force.countKill(); };
  return { force, player, enemies, damagePlayer, message, sendToTown, killAll };
}

it("comes for the player after every thousand soul kills, and only in the Soul Dimension", () => {
  const s = setup();
  s.killAll(SOUL_DEFENSE_FORCE_KILLS - 1);
  s.force.update(.1, true);
  expect(s.enemies).toHaveLength(0);
  s.force.countKill();
  s.force.update(.1, false);
  expect(s.enemies).toHaveLength(0);
  s.force.update(.1, true);
  expect(s.enemies).toHaveLength(1);
  expect(s.enemies[0]).toMatchObject({ campName: SOUL_DEFENSE_FORCE_NAME, displayName: SOUL_DEFENSE_FORCE_NAME, engaged: true });
  // 45 seconds of the player's 100 damage a second.
  expect(s.enemies[0].hp).toBeCloseTo(4_500);
  expect(s.message).toHaveBeenCalledWith(`The ${SOUL_DEFENSE_FORCE_NAME} has noticed you`, expect.any(String));
});

it("winds up, then charges in a line, and a charge that lands takes a third of the player's health", () => {
  const s = setup(); s.killAll(); s.force.update(.1, true);
  const boss = s.enemies[0];
  boss.x = s.player.x - 300; boss.y = s.player.y;
  // Four seconds of chase, the wind-up standing still, then the dash.
  for (let t = 0; t < 4; t += .1) s.force.update(.1, true);
  const windupAt = boss.x;
  s.force.update(.5, true);
  expect(boss.x).toBe(windupAt);
  for (let t = 0; t < .5; t += .02) s.force.update(.02, true);
  expect(s.damagePlayer).toHaveBeenCalledTimes(1);
  expect(s.damagePlayer.mock.calls[0][0]).toBeCloseTo(35);
  expect(boss.x).toBeGreaterThan(s.player.x);
});

it("pays nothing for its kill and starts the count over", () => {
  const s = setup(); s.killAll(); s.force.update(.1, true);
  expect(s.force.defeated({ ...s.enemies[0] })).toBe(false);
  expect(s.force.defeated(s.enemies[0])).toBe(true);
  expect(s.force.count()).toBe(0);
  s.force.update(.1, true);
  expect(s.enemies).toHaveLength(1);
});

it("sends the player it killed to the Town after the respawn, once, retrying while the server catches up, and leaves", async () => {
  const s = setup(); s.killAll(); s.force.update(.1, true);
  s.enemies[0].x = s.player.x + 100; s.enemies[0].y = s.player.y;
  expect(s.force.playerDied()).toBe(true);
  expect(s.enemies[0].dead).toBe(true);
  expect(s.force.count()).toBe(0);
  s.sendToTown.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
  expect(await s.force.afterRespawn()).toBe(true);
  expect(s.sendToTown).toHaveBeenCalledTimes(3);
  expect(s.message).toHaveBeenCalledWith(`The ${SOUL_DEFENSE_FORCE_NAME} defeated you`, expect.any(String));
  expect(await s.force.afterRespawn()).toBe(false);
  expect(s.sendToTown).toHaveBeenCalledTimes(3);
  // A death far from it is not its doing.
  const far = setup(); far.killAll(); far.force.update(.1, true);
  far.enemies[0].x = far.player.x + 2_000; far.enemies[0].y = far.player.y;
  expect(far.force.playerDied()).toBe(false);
  expect(await far.force.afterRespawn()).toBe(false);
  expect(far.sendToTown).not.toHaveBeenCalled();
});

it("leaves with the player and comes back with the count kept", () => {
  const s = setup(); s.killAll(); s.force.update(.1, true);
  s.force.update(.1, false);
  expect(s.enemies[0].dead).toBe(true);
  expect(s.force.count()).toBe(SOUL_DEFENSE_FORCE_KILLS);
  s.enemies.length = 0;
  s.force.update(.1, true);
  expect(s.enemies).toHaveLength(1);
});
