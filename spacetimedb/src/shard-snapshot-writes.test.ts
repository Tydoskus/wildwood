import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { crystalFixture, identity } from "../../tests/helpers/crystal-hollows-fixture";
import { insertSnapshotRow, updateSnapshotRow, deleteSnapshotRow } from "./shard-snapshot-writes";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it.each(["player", "playerProgress", "playerProfile", "playerResearch", "playerAccountStatus", "playerItemUpgrade", "duel"] as const)(
  "invalidates %s inserts, updates and removals in the same transaction", table => {
    const f = crystalFixture();
    const who = identity("2");
    f.seed("shardSnapshotState", { identity: who, shardId: 1n, generation: 1n, revision: 1n, sentRevision: 1n });
    const row = f.row(table, { identity: who, key: "upgrade-test", id: 1n, challenger: who, opponent: identity("3") });
    const key = table === "duel" ? row.id : table === "playerItemUpgrade" ? row.key : row.identity;
    const revision = () => f.db.shardSnapshotState.identity.find(who).revision;
    f.transaction(() => insertSnapshotRow(f.ctx as any, table, row as any)); expect(revision()).toBe(2n);
    f.transaction(() => updateSnapshotRow(f.ctx as any, table, row as any)); expect(revision()).toBe(3n);
    expect(() => f.transaction(() => { deleteSnapshotRow(f.ctx as any, table, key); throw Error("rollback"); })).toThrow("rollback");
    expect(revision()).toBe(3n);
    f.transaction(() => deleteSnapshotRow(f.ctx as any, table, key)); expect(revision()).toBe(4n);
  },
);

it("does not create replication state for offline accounts or regional copies", () => {
  const f = crystalFixture();
  updateSnapshotRow(f.ctx as any, "playerProgress", f.db.playerProgress.identity.find(identity("1")));
  expect(f.db.shardSnapshotState.count()).toBe(0n);
});

it("keeps direct snapshot-source writes out of the root reducer module", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/ctx\.db\.(player|playerProgress|playerProfile|playerResearch|playerAccountStatus|playerItemUpgrade|duel)\.(?:(identity|key|id)\.)?(insert|update|delete)\(/);
});
