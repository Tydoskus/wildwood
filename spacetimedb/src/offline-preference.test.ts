import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { offlineProgressEnabled } from "./offline-preference";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("treats an account with no preference row as opted in", () => {
  const f = crystalFixture();
  expect(offlineProgressEnabled(f.ctx, f.ctx.sender)).toBe(true);
});

it("records an opt-out and takes it back, without touching other accounts", () => {
  const f = crystalFixture();
  f.run(server.setOfflineProgressEnabled, { enabled: false });
  expect(offlineProgressEnabled(f.ctx, f.ctx.sender)).toBe(false);
  // Writing the same value again is a no-op rather than a second row.
  f.run(server.setOfflineProgressEnabled, { enabled: false });
  expect([...f.db.playerOfflinePreference.iter()]).toHaveLength(1);
  f.run(server.setOfflineProgressEnabled, { enabled: true });
  expect(offlineProgressEnabled(f.ctx, f.ctx.sender)).toBe(true);
});
