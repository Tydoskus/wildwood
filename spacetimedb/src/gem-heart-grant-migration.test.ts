import { Identity } from "spacetimedb";
import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { MODULE_MIGRATION_VERSION } from "./module-migrations";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("grants Skittle's verified account the gem heart once during migration", () => {
  const f = crystalFixture();
  const skittle = Identity.fromString("c2000fe3ee7c17481d5dcb88ae9d09af8a28a6f0d63643e59ed75a3fc3c80a8e");
  f.seed("moduleMigrationState", { id: 0, version: 39 });
  f.seed("playerProfile", { identity: skittle, displayName: "Skittle" });
  f.ctx.connectionId = null;
  f.run(server.onConnect);
  const unlocks = [...f.db.chatReactionUnlock.iter()];
  expect(unlocks).toHaveLength(1);
  expect(unlocks[0].gemHeart).toBe(true);
  expect(unlocks[0].identity.__identity__).toBe(skittle.__identity__);
  expect(f.db.moduleMigrationState.id.find(0).version).toBe(MODULE_MIGRATION_VERSION);
  f.run(server.onConnect);
  expect([...f.db.chatReactionUnlock.iter()]).toHaveLength(1);
});
