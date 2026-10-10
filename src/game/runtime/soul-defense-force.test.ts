import { expect, it, vi } from "vitest";
import { createSoulDefenseForce, soulDefenseForceKills, SOUL_DEFENSE_FORCE_KILLS, SOUL_DEFENSE_FORCE_NAME } from "./soul-defense-force";
import type { SpawnSite } from "../world";
import type { EnemyState, PlayerState } from "./types";

function setup(refuse = false, critMultiplier?: () => number, fullDps?: () => number) {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const player = { x: 1000, y: 1000, r: 20, hp: 100, maxHp: 100 } as PlayerState;
  const enemies: EnemyState[] = [];
  const spawnFromSite = (site: SpawnSite) => {
    if (refuse) return;
    const definition = site.definition!;
    enemies.push({ x: site.x, y: site.y, r: definition.r, hp: definition.hp, maxHp: definition.hp, dead: false, engaged: false, speed: definition.speed,
      campName: site.campName, siteId: site.id, type: site.type, facingX: 1 } as unknown as EnemyState);
  };
  const damagePlayer = vi.fn((damage: number) => { player.hp -= damage; });
  const message = vi.fn(), notice = vi.fn();
  const sendToTown = vi.fn(async () => true);
  const force = createSoulDefenseForce({ identity: () => "me", player, enemies, spawnFromSite, damagePlayer, message, notice, storage: () => storage, sendToTown, wait: async () => {}, critMultiplier, fullDps,
    strength: () => ({ dps: 100, maxHp: 100, armor: 0, regen: 0 }) });
  const killAll = (count = SOUL_DEFENSE_FORCE_KILLS) => { for (let i = 0; i < count; i++) force.countKill(); };
  return { force, player, enemies, damagePlayer, message, notice, sendToTown, killAll };
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
  // A popup once in the Town: said before the trip, the fade hid it.
  expect(s.notice).toHaveBeenCalledTimes(1);
  expect(s.notice).toHaveBeenCalledWith(`The ${SOUL_DEFENSE_FORCE_NAME} defeated you.`);
  expect(s.notice.mock.invocationCallOrder[0]).toBeGreaterThan(s.sendToTown.mock.invocationCallOrder.at(-1)!);
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

it("does not take a soul enemy for itself when its spawn is refused, and tries again", () => {
  const s = setup(true);
  const soulEnemy = { campName: "soul:damage:forest:0", dead: false, x: 0, y: 0, r: 20 } as unknown as EnemyState;
  s.enemies.push(soulEnemy);
  s.killAll(); s.force.update(.1, true);
  expect(s.message).not.toHaveBeenCalled();
  expect(s.force.active()).toBe(false);
  expect(s.force.defeated(soulEnemy)).toBe(false);
  expect(s.force.count()).toBe(SOUL_DEFENSE_FORCE_KILLS);
});

it("comes sooner the harder the player crits: every 100 kills at 100x, every 100,000 at 10x", () => {
  expect(soulDefenseForceKills(100)).toBe(100);
  expect(soulDefenseForceKills(10)).toBe(100_000);
  expect(soulDefenseForceKills(20)).toBe(12_500);
  expect(soulDefenseForceKills(1_000)).toBe(100);
  expect(soulDefenseForceKills(1.5)).toBe(10_000_000);
  expect(soulDefenseForceKills(Number.NaN)).toBe(10_000_000);
  let crit = 100;
  const s = setup(false, () => crit);
  s.killAll(99); s.force.update(.1, true);
  expect(s.enemies).toHaveLength(0);
  s.force.countKill(); s.force.update(.1, true);
  expect(s.enemies).toHaveLength(1);
  // It reads the crit as it is now: the same count is far short at 10x.
  const low = setup(false, () => crit);
  crit = 10; low.killAll(100); low.force.update(.1, true);
  expect(low.enemies).toHaveLength(0);
  expect(low.force.killsNeeded()).toBe(100_000);
});

it("takes its health from the player's full damage, perks in, and throws half of all Reflects back", () => {
  const s = setup(false, undefined, () => 300); s.killAll(); s.force.update(.1, true);
  expect(s.enemies[0].hp).toBeCloseTo(13_500);
  expect(s.enemies[0].reflectsReflect).toBe(.5);
});
