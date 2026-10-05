import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("shows an eye-off player while idle or farming, keeps their eye off, and gives them nothing to watch", () => {
  const f = crystalFixture();
  const visible = () => Boolean(f.db.player.identity.find(f.ctx.sender).isVisible);
  f.run(server.setPresence, { enabled: false, shown: false });
  expect(visible()).toBe(false);
  f.run(server.setPresence, { enabled: false, shown: true });
  expect(visible()).toBe(true);
  expect(f.db.playerMultiplayerPreference.identity.find(f.ctx.sender).enabled).toBe(false);
  // An eye-off player watches no one, seen or not.
  f.seed("playerMotionInterest", { identity: f.ctx.sender, networkIds: [1] });
  f.run(server.setPresence, { enabled: false, shown: true });
  expect(f.db.playerMotionInterest.identity.find(f.ctx.sender)).toBeFalsy();
  // Walking again hides them.
  f.run(server.setPresence, { enabled: false, shown: false });
  expect(visible()).toBe(false);
  // The eye on shows them whatever `shown` says.
  f.ctx.timestamp = new (f.ctx.timestamp.constructor as any)(f.ctx.timestamp.microsSinceUnixEpoch + 60_000_000n);
  f.run(server.setPresence, { enabled: true, shown: false });
  expect(visible()).toBe(true);
});
