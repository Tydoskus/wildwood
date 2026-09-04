import { describe, expect, it } from "vitest";
import { ConnectionId, Identity, Timestamp } from "spacetimedb";
import { schema, table, t } from "./helpers/spacetime-module";
import { createMemoryDatabase } from "./helpers/spacetime-memory-db";

const definition = schema({ rows: table({
  indexes: [{ accessor: "byGroupName", algorithm: "btree", columns: ["group", "name"] }],
}, {
  id: t.u64().primaryKey().autoInc(), name: t.string().unique(), group: t.u32(),
  values: t.array(t.u32()), enabled: t.bool().default(false),
}) });
const fixture = () => createMemoryDatabase(definition);
const row = (name: string, group = 1) => ({ id: 0n, name, group, values: [1] });

describe("schema-driven reducer test storage", () => {
  it("uses real declared indexes, defaults and unique constraints", () => {
    const f = fixture();
    expect(f.db.rows.insert(row("one"))).toMatchObject({ id: 1n, enabled: false });
    expect(() => f.db.rows.insert(row("one"))).toThrow("Duplicate unique index");
    expect(() => f.db.rows.insert({ id: 3n, name: "incomplete" })).toThrow("Missing required column");
    expect(f.db.rows.count()).toBe(1n);
  });

  it("supports point and prefix queries with copy-on-read/write", () => {
    const f = fixture();
    const inserted = f.db.rows.insert(row("one"));
    f.db.rows.insert(row("two"));
    f.db.rows.insert(row("three", 2));
    inserted.values.push(9);
    expect(f.db.rows.id.find(1n).values).toEqual([1]);
    expect([...f.db.rows.byGroupName.filter(1)].map((r) => r.name)).toEqual(["one", "two"]);
    expect([...f.db.rows.byGroupName.filter([1, "two"])]).toHaveLength(1);
    f.db.rows.id.update({ ...inserted, values: [2] });
    expect(f.db.rows.id.find(1n).values).toEqual([2]);
    expect(f.db.rows.name.delete("one")).toBe(true);
    expect(f.db.rows.id.find(1n)).toBeNull();
  });

  it("rolls back every table write and auto-increment on a failed callback", () => {
    const f = fixture();
    expect(() => f.transaction(() => {
      f.db.rows.insert(row("one"));
      f.db.rows.insert(row("one"));
    })).toThrow();
    expect(f.db.rows.count()).toBe(0n);
    expect(f.db.rows.insert(row("next")).id).toBe(1n);
  });

  it("compares SDK keys by value and preserves their runtime classes", () => {
    const owner = new Identity("1".repeat(64));
    const f = createMemoryDatabase(schema({ entries: table({}, {
      owner: t.identity().primaryKey(), connection: t.connectionId().unique(), createdAt: t.timestamp(),
    }) }));
    f.db.entries.insert({ owner, connection: new ConnectionId(1n), createdAt: new Timestamp(2n) });
    const found = f.db.entries.owner.find(new Identity("1".repeat(64)));
    expect(found.owner).toBeInstanceOf(Identity);
    expect(f.db.entries.connection.find(new ConnectionId(1n)).createdAt).toBeInstanceOf(Timestamp);
  });
});
