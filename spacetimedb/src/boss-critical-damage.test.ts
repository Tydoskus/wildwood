import { describe, expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { createGameBootstrap } from "../../src/game/runtime/game-bootstrap";
import { MAP_IDS } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const kinds = ["dragon", "spider", "frostclaw", "magmalisk", "gloomroot", "tidewyrm", "koiShogun", "tempestKirin", "miremaw", "prismshell", "ironhorn", "dreadreaper"];
function fixture(kind: string) {
  const f = crystalFixture();
  const index = kinds.indexOf(kind), mapId = MAP_IDS[index];
  const bootstrap = createGameBootstrap() as any;
  const position = bootstrap[kind === "dragon" ? "boss" : `${kind}Boss`];
  f.patch("player", { mapId, x: position.x, y: position.y });
  f.db[`${kind}Boss`].id.delete(1);
  f.seed(`${kind}Boss`, { id: 1, encounter: 7n, alive: true, maxHp: position.maxHp, hp: 10000 });
  f.seed("playerResearch", { identity: f.ctx.sender, criticalChance: 25, criticalDamage: 10 });
  const rolls = [25, 26];
  const random = { integerInRange: vi.fn(() => rolls.shift() ?? 100) };
  Object.assign(f.ctx, { random });
  const reducer = (server as any)[`damage${kind[0].toUpperCase()}${kind.slice(1)}FromPosition`];
  const attack = (hits = 2, x = position.x, y = position.y) => f.run(reducer, { hits, x, y });
  return { ...f, random, attack, mapId };
}

describe.each(kinds)("%s server critical hits", (kind) => {
  it("rolls each accepted hit using research and credits the confirmed damage", () => {
    const f = fixture(kind);
    f.attack();
    // 1000 base damage, one 1.55x critical and one ordinary hit.
    expect(f.db[`${kind}Boss`].id.find(1).hp).toBeCloseTo(7450);
    expect(f.db[`${kind}Contribution`].identity.find(f.ctx.sender).damage).toBeCloseTo(2550);
    expect([...f.db.bossHitResult.iter()]).toMatchObject([{ mapId: f.mapId, damage: 2550, critical: true }]);
    f.attack(20);
    expect(f.random.integerInRange).toHaveBeenCalledTimes(2);
    expect(f.db.bossHitResult.count()).toBe(1n);
  });
  it("does not roll or emit damage for an out-of-range attack", () => {
    const f = fixture(kind);
    f.attack(2, 30, 30);
    expect(f.random.integerInRange).not.toHaveBeenCalled();
    expect(f.db.bossHitResult.count()).toBe(0n);
  });
});

it("zero critical chance stays ordinary", () => {
  const f = fixture("prismshell");
  f.patch("playerResearch", { criticalChance: 0 });
  f.attack(1);
  expect([...f.db.bossHitResult.iter()]).toMatchObject([{ damage: 1000, critical: false }]);
  expect(f.random.integerInRange).not.toHaveBeenCalled();
});


it("caps confirmed critical damage and contribution at the remaining boss HP", () => {
  const f = fixture("prismshell");
  const boss = f.db.prismshellBoss.id.find(1);
  f.db.prismshellBoss.id.update({ ...boss, hp: 500 });
  f.attack(1);
  expect([...f.db.bossHitResult.iter()]).toMatchObject([{ damage: 500, critical: true }]);
  const result = f.db.prismshellResult.id.find(1);
  expect(result.totalDamage).toBe(500);
});
