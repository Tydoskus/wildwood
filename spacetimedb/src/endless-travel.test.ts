import { describe, expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
import { crystalFixture, server, identity } from "../../tests/helpers/crystal-hollows-fixture";
import { generateMap } from "../../shared/procedural-maps";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function grant(f: ReturnType<typeof crystalFixture>, enabled = true) {
  const player = f.ctx.sender;
  f.ctx.sender = Identity.fromString("c200383520521c925f3cf6deafb20cd6a7d6168d1c31cb3c0ddb731c197a2d79");
  f.run(server.devSetEndlessTravelAccess, { identity: player, enabled });
  f.ctx.sender = player;
}

describe("developer Endless travel", () => {
  it("denies regular players and self-granted access, and supports revocation", () => {
    const f = crystalFixture();
    expect(() => f.run(server.devTeleportEndless, { number: 40 })).toThrow(/access required/);
    expect(() => f.run(server.devSetEndlessTravelAccess, { identity: f.ctx.sender, enabled: true })).toThrow(/access required/);
    grant(f);
    grant(f, false);
    expect(() => f.run(server.devTeleportEndless, { number: 40 })).toThrow(/access required/);
  });
  it("jumps to 40, resets movement, persists arrival, and leaves stats/unlocks unchanged", () => {
    const f = crystalFixture();
    grant(f);
    const before = f.db.playerProgress.identity.find(f.ctx.sender);
    f.patch("player", { moving: true, dx: 1, vx: 180, motionEpoch: 3 });
    f.run(server.devTeleportEndless, { number: 40 });
    const arrival = { mapId: "endless_40", ...generateMap("endless_40").arrival };
    expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject({ ...arrival, moving: false, vx: 0, dx: 0, motionEpoch: 4 });
    expect(f.db.playerLastLocation.identity.find(f.ctx.sender)).toMatchObject(arrival);
    expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(before);
    expect(f.db.proceduralProgress.identity.find(f.ctx.sender)).toBeNull();
    f.run(server.changeMap, { mapId: "town", x: arrival.x, y: arrival.y });
    f.run(server.changeMap, { mapId: "town", x: 0, y: 0 });
    expect(f.db.player.identity.find(f.ctx.sender)).toMatchObject(arrival);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid number %s", number => {
    const f = crystalFixture();
    grant(f);
    expect(() => f.run(server.devTeleportEndless, { number })).toThrow(/whole map number/);
  });
  it("requires a live controlling player and scopes the capability view to its caller", () => {
    const f = crystalFixture();
    grant(f);
    expect(server.myEndlessTravelAccess(f.ctx as never)).toEqual({ identity: f.ctx.sender });
    f.patch("player", { hp: 0 });
    expect(() => f.run(server.devTeleportEndless, { number: 40 })).toThrow(/Respawn/);
    f.ctx.sender = identity("2");
    expect(server.myEndlessTravelAccess(f.ctx as never)).toBeUndefined();
    expect(() => f.run(server.devTeleportEndless, { number: 40 })).toThrow();
  });
});
