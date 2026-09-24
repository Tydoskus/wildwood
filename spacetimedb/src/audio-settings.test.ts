import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { eraseIdentityRows } from "./account-erasure";
import { ATTACK_BALANCE_VERSION, SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const row = (f: ReturnType<typeof crystalFixture>, who = f.ctx.sender) => f.db.playerAudioSetting.identity.find(who);

it("stores the account's volumes and reads them back through its own view", () => {
  const f = crystalFixture();
  f.run(server.setAudioSettings, { musicVolume: .2, sfxVolume: .8 });
  expect(row(f)).toMatchObject({ musicVolume: .2, sfxVolume: .8 });
  expect(row(f).updatedAt).toEqual(f.ctx.timestamp);
});

it("rejects volumes outside 0..1 or not finite, and leaves the saved row alone", () => {
  const f = crystalFixture();
  f.run(server.setAudioSettings, { musicVolume: .5, sfxVolume: .5 });
  for (const bad of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => f.run(server.setAudioSettings, { musicVolume: bad, sfxVolume: .5 })).toThrow(/between 0 and 1/);
    expect(() => f.run(server.setAudioSettings, { musicVolume: .5, sfxVolume: bad })).toThrow(/between 0 and 1/);
  }
  expect(row(f)).toMatchObject({ musicVolume: .5, sfxVolume: .5 });
  // Both ends of the range are valid: muted and full.
  f.run(server.setAudioSettings, { musicVolume: 0, sfxVolume: 1 });
  expect(row(f)).toMatchObject({ musicVolume: 0, sfxVolume: 1 });
});

it("writes only when a value changes", () => {
  const f = crystalFixture();
  f.run(server.setAudioSettings, { musicVolume: .3, sfxVolume: .6 });
  const update = vi.spyOn(f.db.playerAudioSetting.identity, "update");
  const insert = vi.spyOn(f.db.playerAudioSetting, "insert");
  f.ctx.timestamp = new Timestamp(20_000_000n);

  f.run(server.setAudioSettings, { musicVolume: .3, sfxVolume: .6 });
  expect(update).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
  expect(row(f).updatedAt).toEqual(new Timestamp(10_000_000n));

  f.run(server.setAudioSettings, { musicVolume: .3, sfxVolume: .7 });
  expect(update).toHaveBeenCalledTimes(1);
  expect(row(f)).toMatchObject({ musicVolume: .3, sfxVolume: .7, updatedAt: new Timestamp(20_000_000n) });
  expect([...f.db.playerAudioSetting.iter()]).toHaveLength(1);
});

it("needs a session, but not a place in the world", () => {
  const f = crystalFixture();
  // The sign-in screen's mute button saves before world entry.
  f.db.player.identity.delete(f.ctx.sender);
  f.db.playerController.identity.delete(f.ctx.sender);
  f.run(server.setAudioSettings, { musicVolume: 0, sfxVolume: .4 });
  expect(row(f)).toMatchObject({ musicVolume: 0, sfxVolume: .4 });

  f.db.playerSession.connectionId.delete(f.ctx.connectionId);
  expect(() => f.run(server.setAudioSettings, { musicVolume: .9, sfxVolume: .4 })).toThrow();
  expect(row(f)).toMatchObject({ musicVolume: 0, sfxVolume: .4 });
});

it("only ever touches the caller's own row", () => {
  const f = crystalFixture();
  const other = identity("3");
  f.seed("playerAudioSetting", { identity: other, musicVolume: .1, sfxVolume: .1, updatedAt: f.ctx.timestamp });
  f.run(server.setAudioSettings, { musicVolume: .9, sfxVolume: .9 });
  expect(row(f, other)).toMatchObject({ musicVolume: .1, sfxVolume: .1 });
  expect(row(f)).toMatchObject({ musicVolume: .9, sfxVolume: .9 });
});

function linkGuest(f: ReturnType<typeof crystalFixture>, guest: ReturnType<typeof identity>) {
  f.db.playerProgress.identity.delete(f.ctx.sender);
  f.progress(guest);
  f.seed("playerBalanceVersion", { identity: guest, version: ATTACK_BALANCE_VERSION });
  f.seed("accountLink", { code: "audio-link", guest, createdAt: f.ctx.timestamp });
  f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
  f.run(server.claimGuestAccount, { code: "audio-link" });
}

it("keeps the account's volumes when a guest links to an account that has them", () => {
  const f = crystalFixture();
  const guest = identity("2");
  f.seed("playerAudioSetting", { identity: guest, musicVolume: .9, sfxVolume: .9, updatedAt: f.ctx.timestamp });
  f.seed("playerAudioSetting", { identity: f.ctx.sender, musicVolume: .1, sfxVolume: .2, updatedAt: f.ctx.timestamp });
  linkGuest(f, guest);
  expect(row(f)).toMatchObject({ musicVolume: .1, sfxVolume: .2 });
  expect(row(f, guest)).toBeNull();
});

it("moves the guest's volumes to an account that has none", () => {
  const f = crystalFixture();
  const guest = identity("2");
  f.seed("playerAudioSetting", { identity: guest, musicVolume: 0, sfxVolume: .6, updatedAt: f.ctx.timestamp });
  linkGuest(f, guest);
  expect(row(f)).toMatchObject({ musicVolume: 0, sfxVolume: .6 });
  expect(row(f, guest)).toBeNull();
});

it("links a guest with no volumes without inventing a row", () => {
  const f = crystalFixture();
  linkGuest(f, identity("2"));
  expect([...f.db.playerAudioSetting.iter()]).toHaveLength(0);
});

it("is erased with the account and leaves other accounts alone", () => {
  const f = crystalFixture();
  const other = identity("3");
  f.run(server.setAudioSettings, { musicVolume: .4, sfxVolume: .4 });
  f.seed("playerAudioSetting", { identity: other, musicVolume: .1, sfxVolume: .1, updatedAt: f.ctx.timestamp });
  eraseIdentityRows(f.ctx, [f.ctx.sender]);
  expect(row(f)).toBeNull();
  expect(row(f, other)).not.toBeNull();
});

it("is removed wherever a player's or simulated client's rows are removed", () => {
  const lifecycle = readFileSync(new URL("./account-lifecycle.ts", import.meta.url), "utf8");
  const section = (start: string, end: string) => lifecycle.slice(lifecycle.indexOf(start), lifecycle.indexOf(end, lifecycle.indexOf(start)));
  expect(section("function removeVirtualPlayerData", "function removePlayerIdentityData")).toContain("removeAudioSettings(ctx, identity)");
  expect(section("function removePlayerIdentityData", "return {")).toContain("removeAudioSettings(ctx, identity)");
});
