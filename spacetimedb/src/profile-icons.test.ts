import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("saves the added portrait sheets while rejecting indices outside the catalog", () => {
  const f = crystalFixture();
  f.seed("playerProfile", { identity: identity("2"), displayName: "Other Player", profileIcon: 42 });
  f.ctx.sender = identity("1");
  for (const profileIcon of [63, 64, 127, 128, 191, 192, 255, 256, 319]) {
    f.run(server.setProfileIcon, { profileIcon });
    expect(f.db.playerProfile.identity.find(identity("1")).profileIcon).toBe(profileIcon);
    expect(f.db.playerProfile.identity.find(identity("2")).profileIcon).toBe(42);
  }
  for (const profileIcon of [-1, 320, 1.5, 273]) {
    expect(() => f.run(server.setProfileIcon, { profileIcon })).toThrow("Choose an available profile picture.");
    expect(f.db.playerProfile.identity.find(identity("1")).profileIcon).toBe(319);
  }
});

it("saves a picture on the Black backdrop and back, and rejects unknown bits", () => {
  const f = crystalFixture();
  f.ctx.sender = identity("1");
  f.run(server.setProfileIcon, { profileIcon: 42 });
  for (const profileIcon of [42 | 0x10000, 0x10000, 255 | 0x10000, 42]) {
    f.run(server.setProfileIcon, { profileIcon });
    expect(f.db.playerProfile.identity.find(identity("1")).profileIcon).toBe(profileIcon);
  }
  for (const profileIcon of [320 | 0x10000, 0x20000, 0x20000 | 42, 0x30000, 2 ** 31, 2 ** 32 - 1]) {
    expect(() => f.run(server.setProfileIcon, { profileIcon }), String(profileIcon)).toThrow("Choose an available profile picture.");
    expect(f.db.playerProfile.identity.find(identity("1")).profileIcon).toBe(42);
  }
});

it("carries the backdrop to the leaderboard row with the picture", () => {
  const f = crystalFixture();
  f.ctx.sender = identity("1");
  f.seed("leaderboardEntry", { identity: identity("1"), displayName: "Player One", isGuest: false });
  f.run(server.setProfileIcon, { profileIcon: 7 | 0x10000 });
  expect(f.db.playerProfile.identity.find(identity("1")).profileIcon).toBe(7 | 0x10000);
  expect(f.db.leaderboardEntry.identity.find(identity("1")).profileIcon).toBe(7 | 0x10000);
});
