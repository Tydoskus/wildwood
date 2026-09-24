import { expect, it } from "vitest";
import { changedTables } from "./subscribed-schema.mjs";

it("flags a changed column list on an existing table, not a new or removed table", () => {
  const stamped = { player: ["identity", "x"], chat: ["id"] };
  expect(changedTables(stamped, { player: ["identity", "x", "speed"], chat: ["id"], added: ["id"] })).toEqual(["player"]);
  expect(changedTables(stamped, { player: ["identity", "x"], added: ["id"] })).toEqual([]);
});
