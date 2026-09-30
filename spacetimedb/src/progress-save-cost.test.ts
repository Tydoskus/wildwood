import { expect, it, vi } from "vitest";
import { PLAYER_SPEED } from "../../shared/rules";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("bounds inventory decoding during a normal combat progress save", () => {
  const f = crystalFixture();
  const base = f.db.playerProgress.identity.find(f.ctx.sender);
  const parse = vi.spyOn(JSON, "parse");
  try {
    f.run(server.savePlayerProgress, { ...base, damage: base.damage + 1, enemyKills: 2 });
    expect(parse.mock.calls.length).toBeLessThanOrEqual(12);
    expect(f.db.playerProgress.identity.find(f.ctx.sender).damage).toBe(base.damage);
  } finally { parse.mockRestore(); }
});

it("keeps server-owned inventory, unlocks, and ignores client combat stats when saving", () => {
  const f = crystalFixture();
  const inventoryJson = '["sky_bow","water_armor","sky_bow","not-an-item"]';
  f.patch("playerProgress", { inventoryJson, desertUnlocked: true, waterUnlocked: true });
  const base = f.db.playerProgress.identity.find(f.ctx.sender);
  f.run(server.savePlayerProgress, { ...base, damage: 1, maxHp: 1, enemyKills: 5,
    inventoryJson: '["samurai_bow"]', equippedRightHand: "sky_bow", equippedChest: "water_armor", desertUnlocked: false });
  const saved = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(saved.damage).toBe(base.damage);
  expect(saved.maxHp).toBe(base.maxHp);
  expect(saved.desertUnlocked).toBe(true);
  expect(JSON.parse(saved.inventoryJson).filter((id: string) => id === "sky_bow")).toHaveLength(1);
  expect(saved.inventoryJson).not.toContain("samurai_bow");
  expect(saved.inventoryJson).not.toContain("not-an-item");
  expect(saved.equippedRightHand).toBe("sky_bow");
  expect(saved.equippedChest).toBe("water_armor");
  expect(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n).toBe(0n);
});

it("makes unchanged speed requests no-ops without inventory decoding or presentation writes", () => {
  const f = crystalFixture();
  const update = vi.spyOn(f.db.player.identity, "update");
  const parse = vi.spyOn(JSON, "parse");
  try {
    f.run(server.setSpeed, { speed: 180 });
    expect(update).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
  } finally { parse.mockRestore(); }
});

it("ignores combat stat uploads without decoding inventory or resetting resting speed", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { infernalUnlocked: true, waterUnlocked: true, equippedFeet: "black_boots", inventoryJson: '["black_boots"]' });
  f.patch("player", { feetItem: "black_boots", speed: 205 });
  const base = f.db.playerProgress.identity.find(f.ctx.sender);
  const parse = vi.spyOn(JSON, "parse");
  f.run(server.savePlayerProgress, { ...base, damage: base.damage + 1, enemyKills: 3 });
  expect(parse).not.toHaveBeenCalled();
  parse.mockRestore();
  expect(f.db.player.identity.find(f.ctx.sender).speed).toBe(205);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).damage).toBe(base.damage);
});

it("does not rewrite progress or presentation for an unchanged checkpoint", () => {
  const f = crystalFixture();
  const base = f.db.playerProgress.identity.find(f.ctx.sender);
  f.run(server.savePlayerProgress, { ...base, enemyKills: 3 });
  const player = vi.spyOn(f.db.player.identity, "update");
  const progress = vi.spyOn(f.db.playerProgress.identity, "update");
  const lifetime = vi.spyOn(f.db.playerLifetime.identity, "update");
  f.run(server.savePlayerProgress, { ...base, enemyKills: 3 });
  expect(player).not.toHaveBeenCalled();
  expect(progress).not.toHaveBeenCalled();
  expect(lifetime).not.toHaveBeenCalled();
});

it("removes the temporary boots bonus when those boots are unequipped", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { infernalUnlocked: true, waterUnlocked: true, equippedFeet: "black_boots", inventoryJson: '["black_boots"]' });
  f.patch("player", { feetItem: "black_boots", speed: PLAYER_SPEED + 25 });
  const base = f.db.playerProgress.identity.find(f.ctx.sender);
  f.run(server.savePlayerProgress, { ...base, equippedFeet: "", enemyKills: 3 });
  expect(f.db.player.identity.find(f.ctx.sender).speed).toBe(PLAYER_SPEED);
});

it("preserves the active black-boots bonus during an unrelated equipment edit", () => {
  const f = crystalFixture();
  f.patch("playerProgress", { infernalUnlocked: true, waterUnlocked: true, equippedFeet: "black_boots", inventoryJson: '["black_boots","water_armor"]' });
  f.patch("player", { feetItem: "black_boots", speed: PLAYER_SPEED + 25 });
  const base = f.db.playerProgress.identity.find(f.ctx.sender);
  f.run(server.savePlayerProgress, { ...base, equippedChest: "water_armor", enemyKills: 3 });
  expect(f.db.player.identity.find(f.ctx.sender).speed).toBe(PLAYER_SPEED + 25);
  expect(f.db.playerProgress.identity.find(f.ctx.sender).equippedChest).toBe("water_armor");
});

it("does not accept forged stats, kills or boots through an equipment save", () => {
  const f = crystalFixture(), base = f.db.playerProgress.identity.find(f.ctx.sender);
  f.run(server.savePlayerProgress, { ...base, damage: 1e25, maxHp: 1e25, armor: 1e25, regen: 1e25,
    attackRate: 0.01, projectileCount: 20, enemyKills: 4_000_000_000, bootsCollected: true,
    equippedHead: "fake-item", inventoryJson: '["fake-item"]' });
  const result = f.db.playerProgress.identity.find(f.ctx.sender);
  for (const key of ["damage", "maxHp", "armor", "regen", "attackRate", "projectileCount", "bootsCollected"])
    expect(result[key]).toBe(base[key]);
  expect(f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n).toBe(0n);
});
