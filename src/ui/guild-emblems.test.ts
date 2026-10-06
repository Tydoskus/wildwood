import { expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { GUILD_EMBLEMS } from "../../shared/guilds";
import { createGuildEmblem, guildEmblemIndex } from "./guild-emblems";

const { document } = parseHTML("<!doctype html><html><body></body></html>");

it("keeps every guild that never chose a badge on the one its name gave it before the second sheet", () => {
  const firstSheet = GUILD_EMBLEMS.slice(0, 16);
  const before = (name: string) => {
    const normalized = name.trim().toLowerCase();
    const match = firstSheet.findIndex(theme => normalized.includes(theme));
    if (match >= 0) return match;
    let hash = 0;
    for (const letter of normalized) hash = (hash * 31 + letter.codePointAt(0)!) >>> 0;
    return hash % 16;
  };
  for (const name of ["Wolf Pack", "Turtle Power", "Eagle Eyes", "Night Shift", "The Lightning Ram", "x", "Moonfen Mob"]) {
    expect(guildEmblemIndex(name), name).toBe(before(name));
  }
});

it("draws the first 16 badges from the first sheet and the turtle and the rest from the second", () => {
  const wolf = createGuildEmblem(document, "Anything", "guild-mark", 0);
  expect(wolf.classList.contains("guild-emblem--sheet-2")).toBe(false);
  const turtle = createGuildEmblem(document, "Anything", "guild-mark", GUILD_EMBLEMS.indexOf("turtle"));
  expect(GUILD_EMBLEMS.indexOf("turtle")).toBe(16);
  expect(turtle.classList.contains("guild-emblem--sheet-2")).toBe(true);
  const lightning = createGuildEmblem(document, "Anything", "guild-mark", 31);
  expect(lightning.classList.contains("guild-emblem--sheet-2")).toBe(true);
  expect(lightning.style.backgroundPosition).not.toBe(turtle.style.backgroundPosition);
  // A badge number the game does not know falls back to the name's default.
  expect(createGuildEmblem(document, "Wolf Pack", "guild-mark", 32).classList.contains("guild-emblem--sheet-2")).toBe(false);
});
