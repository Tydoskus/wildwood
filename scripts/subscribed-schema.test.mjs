import { expect, it } from "vitest";
import { changedTables, columnType } from "./subscribed-schema.mjs";

it("flags a changed column list on an existing table, not a new or removed table", () => {
  const stamped = { player: ["identity", "x"], chat: ["id"] };
  expect(changedTables(stamped, { player: ["identity", "x", "speed"], chat: ["id"], added: ["id"] })).toEqual(["player"]);
  expect(changedTables(stamped, { player: ["identity", "x"], added: ["id"] })).toEqual([]);
});

it("flags a changed column type, and compares a name-only stamp by name", () => {
  const current = { player: ["identity:identity", "power:u64"] };
  expect(changedTables({ player: ["identity:identity", "power:u32"] }, current)).toEqual(["player"]);
  expect(changedTables({ player: ["identity:identity", "power:u64"] }, current)).toEqual([]);
  expect(changedTables({ player: ["identity", "power"] }, current)).toEqual([]);
});

it("reduces a binding declaration to its type", () => {
  expect(columnType('__t.u64().primaryKey().name("network_id")')).toBe("u64");
  expect(columnType("__t.array(__t.u64())")).toBe("array(u64)");
});
