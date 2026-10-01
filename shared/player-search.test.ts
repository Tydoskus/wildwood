import { expect, it } from "vitest";
import { parsePlayerDirectory, searchPlayerDirectory } from "./player-search";

const directory = parsePlayerDirectory(JSON.stringify([
  ["a1", "Badger"], ["a2", "Kiira"], ["a3", "Kiiru"], ["a4", "Lucky Badger 455"], ["a5", "Snowbadger"], ["a6", "me"], 5, ["a7", ""],
]));

it("reads the server's list, dropping malformed rows", () => {
  expect(directory.map(player => player.name)).toEqual(["Badger", "Kiira", "Kiiru", "Lucky Badger 455", "Snowbadger", "me"]);
  expect(parsePlayerDirectory("not json")).toEqual([]);
});

it("ranks the exact name, then the start of a name, then a later word, then anywhere", () => {
  expect(searchPlayerDirectory(directory, "BADGER").map(player => player.name)).toEqual(["Badger", "Lucky Badger 455", "Snowbadger"]);
  expect(searchPlayerDirectory(directory, " ki").map(player => player.name)).toEqual(["Kiira", "Kiiru"]);
});

it("leaves out the searcher, blanks and anything past the limit", () => {
  expect(searchPlayerDirectory(directory, "me", { exclude: "a6" })).toEqual([]);
  expect(searchPlayerDirectory(directory, "  ")).toEqual([]);
  expect(searchPlayerDirectory(directory, "a", { limit: 2 })).toHaveLength(2);
});
