import { expect, it } from "vitest";
import { EMPTY_GUILD_HALL_LEVELS, GUILD_HALL_ARRIVAL, GUILD_HALL_DOOR, GUILD_HALL_HOME_PAD, GUILD_HALL_PARTS, GUILD_HALL_TABLE_SEATS, GUILD_HALL_WORLD, guildHallRoom,
  type GuildHallLevels } from "../../shared/guild-hall";
import { GUILD_HALL_GROUND, GUILD_HALL_INTERIOR_LEFT, guildHallBoard, guildHallDecor, guildHallFrame, guildHallRoomPicture, guildHallSeats, guildHallSolids } from "./guild-hall";

const MAX = Object.fromEntries(GUILD_HALL_PARTS.map(part => [part.id, part.levels.length - 1])) as GuildHallLevels;
const sizes = [0, 1, 2];

it("keeps every room, board and seat inside the hall's world, and the rooms out of sight of the courtyard", () => {
  for (const size of sizes) {
    const room = guildHallRoom(size), picture = guildHallRoomPicture(size), board = guildHallBoard(size);
    expect(picture.x).toBeGreaterThanOrEqual(GUILD_HALL_INTERIOR_LEFT);
    expect(picture.x + picture.w).toBeLessThanOrEqual(GUILD_HALL_WORLD.width);
    expect(picture.y + picture.h).toBeLessThanOrEqual(GUILD_HALL_WORLD.height);
    expect(board.x).toBeGreaterThan(room.left);
    expect(board.x).toBeLessThan(room.right);
    for (const seat of guildHallSeats({ ...MAX, size })) {
      expect(seat.x).toBeGreaterThan(room.left);
      expect(seat.x).toBeLessThan(room.right);
    }
  }
  // A wide screen in the courtyard never reaches the dark around the rooms.
  expect(GUILD_HALL_INTERIOR_LEFT - (GUILD_HALL_GROUND.x + GUILD_HALL_GROUND.w)).toBeGreaterThanOrEqual(1_200);
  for (const point of [GUILD_HALL_ARRIVAL, GUILD_HALL_HOME_PAD, GUILD_HALL_DOOR.outside]) {
    expect(point.x).toBeGreaterThan(GUILD_HALL_GROUND.x);
    expect(point.y).toBeLessThan(GUILD_HALL_GROUND.y + GUILD_HALL_GROUND.h);
  }
});

it("seats as many at the table as its level says, in the room for the hall's size", () => {
  for (const [table, seats] of GUILD_HALL_TABLE_SEATS.entries()) {
    for (const size of sizes) {
      const shown = guildHallSeats({ ...EMPTY_GUILD_HALL_LEVELS, table, size });
      expect(shown).toHaveLength(seats);
      expect(shown.filter(seat => seat.side === "north")).toHaveLength(seats / 2);
    }
  }
});

it("shows more of the hall with every upgrade, the guild's crest on each banner, and only art the sheet has", () => {
  const bare = guildHallDecor(EMPTY_GUILD_HALL_LEVELS), grand = guildHallDecor(MAX);
  expect(grand.length).toBeGreaterThan(bare.length);
  const crests = (decor: ReturnType<typeof guildHallDecor>) => decor.filter(item => item.type === "soulProp" && item.crest).length;
  // Over the door and over the head of the table, then banners everywhere.
  expect(crests(bare)).toBe(2);
  expect(crests(grand)).toBeGreaterThan(6);
  for (const item of grand) {
    if (item.type !== "soulProp" || item.crest) continue;
    expect(guildHallFrame(item.frame), item.frame).not.toBeNull();
    if (item.openFrame) expect(guildHallFrame(item.openFrame)).not.toBeNull();
    for (const frame of item.anim?.frames ?? []) expect(guildHallFrame(String(frame))).not.toBeNull();
  }
  // Each upgrade on its own changes what is drawn.
  for (const part of GUILD_HALL_PARTS) {
    const one = guildHallDecor({ ...EMPTY_GUILD_HALL_LEVELS, [part.id]: 1 });
    expect(JSON.stringify(one), part.id).not.toBe(JSON.stringify(bare));
  }
  // The walls follow the size: a bigger hall's room has its own.
  expect(guildHallSolids({ ...EMPTY_GUILD_HALL_LEVELS, size: 2 })).not.toEqual(guildHallSolids(EMPTY_GUILD_HALL_LEVELS));
});
