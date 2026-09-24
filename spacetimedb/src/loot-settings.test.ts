import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { eraseIdentityRows } from "./account-erasure";
import { lootSettingsFor } from "./loot-settings";
import { ATTACK_BALANCE_VERSION, BOSS_REWARD_CLAIM_BITS, SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

type Fixture = ReturnType<typeof crystalFixture>;
const row = (f: Fixture, who = f.ctx.sender) => f.db.playerLootSetting.identity.find(who);

it("is on for both until the player chooses, and reads back through the caller's own view", () => {
  const f = crystalFixture();
  expect(lootSettingsFor(f.ctx, f.ctx.sender)).toEqual({ autoKeepBest: true, autoEquipBest: true });
  expect((server.myLootSettings as any)(f.ctx)).toEqual([]);
  f.run(server.setLootSettings, { autoKeepBest: false, autoEquipBest: true });
  expect(row(f)).toMatchObject({ autoKeepBest: false, autoEquipBest: true, updatedAt: f.ctx.timestamp });
  expect(lootSettingsFor(f.ctx, f.ctx.sender)).toEqual({ autoKeepBest: false, autoEquipBest: true });
  expect((server.myLootSettings as any)(f.ctx)).toHaveLength(1);
  expect((server.myLootSettings as any)({ ...f.ctx, sender: identity("3") })).toEqual([]);
});

it("writes only when a value changes, and refuses anything but on or off", () => {
  const f = crystalFixture();
  f.run(server.setLootSettings, { autoKeepBest: true, autoEquipBest: false });
  const update = vi.spyOn(f.db.playerLootSetting.identity, "update");
  f.run(server.setLootSettings, { autoKeepBest: true, autoEquipBest: false });
  expect(update).not.toHaveBeenCalled();
  expect(() => f.run(server.setLootSettings, { autoKeepBest: "yes" as never, autoEquipBest: false })).toThrow("on or off");
  f.run(server.setLootSettings, { autoKeepBest: false, autoEquipBest: false });
  expect(update).toHaveBeenCalledTimes(1);
  expect([...f.db.playerLootSetting.iter()]).toHaveLength(1);
});

it("needs the player's controlling session", () => {
  const f = crystalFixture();
  f.db.playerController.identity.delete(f.ctx.sender);
  expect(() => f.run(server.setLootSettings, { autoKeepBest: false, autoEquipBest: false })).toThrow();
  expect(row(f)).toBeNull();
});

it("survives prestige and reset, like the volumes", () => {
  for (const reducer of ["prestigeAccount", "resetPlayerProgress"] as const) {
    const f = crystalFixture();
    f.patch("playerProgress", { bossRewardClaims: BOSS_REWARD_CLAIM_BITS.aegisPrime });
    f.seed("proceduralProgress", { identity: f.ctx.sender, completed: 1 });
    f.run(server.setLootSettings, { autoKeepBest: false, autoEquipBest: false });
    f.run(server[reducer], {});
    expect(row(f)).toMatchObject({ autoKeepBest: false, autoEquipBest: false });
  }
});

function linkGuest(f: Fixture, guest: ReturnType<typeof identity>) {
  f.db.playerProgress.identity.delete(f.ctx.sender);
  f.progress(guest);
  f.seed("playerBalanceVersion", { identity: guest, version: ATTACK_BALANCE_VERSION });
  f.seed("accountLink", { code: "loot-link", guest, createdAt: f.ctx.timestamp });
  f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
  f.run(server.claimGuestAccount, { code: "loot-link" });
}

it("keeps the account's choice when a guest links, and moves the guest's to an account without one", () => {
  const guest = identity("2");
  const both = crystalFixture();
  both.seed("playerLootSetting", { identity: guest, autoKeepBest: false, autoEquipBest: false, updatedAt: both.ctx.timestamp });
  both.seed("playerLootSetting", { identity: both.ctx.sender, autoKeepBest: true, autoEquipBest: false, updatedAt: both.ctx.timestamp });
  linkGuest(both, guest);
  expect(row(both)).toMatchObject({ autoKeepBest: true, autoEquipBest: false });
  expect(row(both, guest)).toBeNull();

  const guestOnly = crystalFixture();
  guestOnly.seed("playerLootSetting", { identity: guest, autoKeepBest: false, autoEquipBest: true, updatedAt: guestOnly.ctx.timestamp });
  linkGuest(guestOnly, guest);
  expect(row(guestOnly)).toMatchObject({ autoKeepBest: false, autoEquipBest: true });
  expect(row(guestOnly, guest)).toBeNull();

  const neither = crystalFixture();
  linkGuest(neither, guest);
  expect([...neither.db.playerLootSetting.iter()]).toHaveLength(0);
});

it("is erased with the account and removed wherever a player's rows are removed", () => {
  const f = crystalFixture();
  const other = identity("3");
  f.run(server.setLootSettings, { autoKeepBest: false, autoEquipBest: false });
  f.seed("playerLootSetting", { identity: other, autoKeepBest: false, autoEquipBest: true, updatedAt: f.ctx.timestamp });
  eraseIdentityRows(f.ctx, [f.ctx.sender]);
  expect(row(f)).toBeNull();
  expect(row(f, other)).not.toBeNull();
  const lifecycle = readFileSync(new URL("./account-lifecycle.ts", import.meta.url), "utf8");
  const section = (start: string, end: string) => lifecycle.slice(lifecycle.indexOf(start), lifecycle.indexOf(end, lifecycle.indexOf(start)));
  expect(section("function removeVirtualPlayerData", "function removePlayerIdentityData")).toContain("removeLootSettings(ctx, identity)");
  expect(section("function removePlayerIdentityData", "return {")).toContain("removeLootSettings(ctx, identity)");
});
