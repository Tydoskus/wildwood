import { createTestGuild } from "../../tests/helpers/guild-creation";
import { expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
import { TOWN_MAP_ID } from "../../shared/town";
import { GUILD_HALL_ARRIVAL, GUILD_HALL_DOOR, GUILD_HALL_FEET_OFFSET, GUILD_HALL_WORLD, guildHallMapId, guildHallRoom, parseGuildHallLevels } from "../../shared/guild-hall";
import { PLAYER_POSITION_SCALE } from "../../shared/player-motion-frame";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function fixture() {
  const f = crystalFixture();
  const basePlayer = f.db.player.identity.find(f.ctx.sender);
  const connection = f.ctx.connectionId!;
  const actor = (digit: string) => {
    const who = identity(digit);
    f.ctx.sender = who;
    f.ctx.connectionId = connection;
    f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
    if (!f.db.playerProgress.identity.find(who)) f.progress(who);
    if (!f.db.playerProfile.identity.find(who)) f.seed("playerProfile", { identity: who, displayName: `Player ${digit}`, skinTone: 3 });
    if (!f.db.player.identity.find(who)) f.seed("player", { ...basePlayer, identity: who });
    if (!f.db.playerController.identity.find(who)) f.seed("playerController", { identity: who, connectionId: connection });
    const session = f.db.playerSession.connectionId.find(connection);
    f.db.playerSession.connectionId.update({ ...session, identity: who });
  };
  const guild = (digits: string[], name: string) => {
    actor(digits[0]); createTestGuild(f, name);
    const guildId: bigint = f.db.guildMember.identity.find(f.ctx.sender).guildId;
    for (const digit of digits.slice(1)) { actor(digit); f.run(server.joinGuild, { guildId }); }
    actor(digits[0]);
    return guildId;
  };
  const me = () => f.db.player.identity.find(f.ctx.sender);
  // Standing still somewhere: no motion row to extrapolate from.
  const place = (mapId: string, x: number, y: number) => {
    f.db.player.identity.update({ ...me(), mapId, x, y });
    if (f.db.playerMotion.identity.find(f.ctx.sender)) f.db.playerMotion.identity.delete(f.ctx.sender);
  };
  const week = Math.floor((Number(f.ctx.timestamp.microsSinceUnixEpoch / 86_400_000_000n) + 3) / 7);
  const questPoints = (guildId: bigint, points: number) =>
    f.seed("guildQuestWeek", { key: `${week}:${guildId}`, week, guildId, guildName: "Rose", points });
  return { ...f, actor, guild, me, place, week, questPoints };
}

it("fits the narrow motion format", () => {
  expect(GUILD_HALL_WORLD.width * PLAYER_POSITION_SCALE).toBeLessThanOrEqual(0xffff);
  expect(GUILD_HALL_WORLD.height * PLAYER_POSITION_SCALE).toBeLessThanOrEqual(0xffff);
});

it("lets members in from a fighting map, keeps that place for the Town's Fight, and keeps everyone else out", () => {
  const f = fixture(); const guildId = f.guild(["1", "2"], "Rose");
  const hall = guildHallMapId(guildId);
  f.run(server.changeMap, { mapId: hall, x: 4050, y: 4050 });
  expect(f.me().mapId).toBe(hall);
  expect([f.me().x, f.me().y]).toEqual([GUILD_HALL_ARRIVAL.x, GUILD_HALL_ARRIVAL.y]);
  expect(f.db.homeReturnLocation.identity.find(f.ctx.sender).mapId).toBe("crystal_hollows");
  // Hall to the Town keeps the fighting map, not the hall, as where Fight goes.
  f.run(server.changeMap, { mapId: TOWN_MAP_ID, x: GUILD_HALL_ARRIVAL.x, y: GUILD_HALL_ARRIVAL.y });
  expect(f.db.homeReturnLocation.identity.find(f.ctx.sender).mapId).toBe("crystal_hollows");
  f.actor("3");
  expect(() => f.run(server.changeMap, { mapId: hall, x: 4050, y: 4050 })).toThrow(/Only the guild's members/);
  expect(() => f.run(server.changeMap, { mapId: guildHallMapId(guildId + 99n), x: 4050, y: 4050 })).toThrow(/Only the guild's members/);
});

it("takes a member through the door into the room for the hall's size, and back out", () => {
  const f = fixture(); const guildId = f.guild(["1"], "Rose");
  const hall = guildHallMapId(guildId);
  f.run(server.changeMap, { mapId: hall, x: 4050, y: 4050 });
  expect(() => f.run(server.useGuildHallDoor, {})).toThrow(/too far/);
  f.place(hall, GUILD_HALL_DOOR.outside.x, GUILD_HALL_DOOR.outside.y);
  f.run(server.useGuildHallDoor, {});
  expect([f.me().x, f.me().y]).toEqual([guildHallRoom(0).inside.x, guildHallRoom(0).inside.y]);
  f.place(hall, guildHallRoom(0).inside.x, guildHallRoom(0).inside.y);
  f.run(server.useGuildHallDoor, {});
  expect([f.me().x, f.me().y]).toEqual([GUILD_HALL_DOOR.outside.x, GUILD_HALL_DOOR.outside.y]);
  // A bigger hall's door leads to the bigger room.
  f.db.guildHall.guildId.update({ ...f.db.guildHall.guildId.find(guildId), levels: '{"size":2}' });
  f.place(hall, GUILD_HALL_DOOR.outside.x, GUILD_HALL_DOOR.outside.y);
  f.run(server.useGuildHallDoor, {});
  expect([f.me().x, f.me().y]).toEqual([guildHallRoom(2).inside.x, guildHallRoom(2).inside.y]);
});

it("pays for upgrades from the guild's quest points, by the President or a Vice President only", () => {
  const f = fixture(); const guildId = f.guild(["1", "2"], "Rose");
  f.questPoints(guildId, 120);
  expect(() => f.run(server.upgradeGuildHall, { part: "table" })).toThrow(/needs 30 more quest points/);
  f.run(server.upgradeGuildHall, { part: "banners" });
  const hall = f.db.guildHall.guildId.find(guildId);
  expect([hall.fund, hall.spent, parseGuildHallLevels(hall.levels).banners]).toEqual([20, 100, 1]);
  expect(() => f.run(server.upgradeGuildHall, { part: "moat" })).toThrow(/not part of the hall/);
  f.actor("2");
  expect(() => f.run(server.upgradeGuildHall, { part: "lights" })).toThrow(/Only the President or Vice President/);
});

it("adds quest points a guild earns to its hall's fund", () => {
  const f = fixture(); const guildId = f.guild(["1"], "Rose");
  f.questPoints(guildId, 50);
  f.run(server.changeMap, { mapId: guildHallMapId(guildId), x: 4050, y: 4050 });
  expect(f.db.guildHall.guildId.find(guildId).fund).toBe(50);
  // A joiner's guildless quests move to the guild, and into the fund.
  f.actor("2");
  f.seed("soloQuestWeek", { identity: f.ctx.sender, week: f.week, points: 6, lastWeek: 0, lastPoints: 0 });
  f.run(server.joinGuild, { guildId });
  expect(f.db.guildHall.guildId.find(guildId).fund).toBe(56);
});

it("sends a member who leaves to the Town from the hall, and takes the hall with the guild", () => {
  const f = fixture(); const guildId = f.guild(["1", "2"], "Rose");
  const hall = guildHallMapId(guildId);
  f.actor("2");
  f.run(server.changeMap, { mapId: hall, x: 4050, y: 4050 });
  f.run(server.leaveGuild);
  expect(f.me().mapId).toBe(TOWN_MAP_ID);
  f.actor("1");
  f.run(server.changeMap, { mapId: hall, x: 4050, y: 4050 });
  expect(f.db.guildHall.guildId.find(guildId)).toBeTruthy();
  f.run(server.leaveGuild);
  expect(f.me().mapId).toBe(TOWN_MAP_ID);
  expect(f.db.guildHall.guildId.find(guildId)).toBeFalsy();
});

it("keeps who a member is watching through the door, so the guildmates they see keep moving", () => {
  const f = fixture(); const guildId = f.guild(["1"], "Rose");
  const hall = guildHallMapId(guildId);
  f.run(server.changeMap, { mapId: hall, x: 4050, y: 4050 });
  f.place(hall, GUILD_HALL_DOOR.outside.x, GUILD_HALL_DOOR.outside.y);
  f.seed("playerMotionInterest", { identity: f.ctx.sender, networkIds: [7] });
  f.run(server.useGuildHallDoor, {});
  expect(f.db.playerMotionInterest.identity.find(f.ctx.sender)?.networkIds).toEqual([7]);
  // A real map change still drops it: the client asks again for the new map.
  f.run(server.changeMap, { mapId: TOWN_MAP_ID, x: f.me().x, y: f.me().y });
  expect(f.db.playerMotionInterest.identity.find(f.ctx.sender)).toBeFalsy();
});

it("lets a member through the door they could have walked to since their last movement packet, and no further", () => {
  const f = fixture(); f.guild(["1"], "Rose");
  const hall = guildHallMapId(f.db.guildMember.identity.find(f.ctx.sender).guildId);
  f.run(server.changeMap, { mapId: hall, x: 4050, y: 4050 });
  // Arrived and stood still; then walked to the door with multiplayer off, which sends no packet on the way.
  const sequence = (f.db.playerMotion.identity.find(f.ctx.sender)?.lastInputSequence ?? 0) + 1;
  f.run(server.updateMovementState, { x: GUILD_HALL_ARRIVAL.x, y: GUILD_HALL_ARRIVAL.y, vx: 0, vy: 0, simulationTick: sequence, motionEpoch: 0, sequence });
  const walk = Math.hypot(GUILD_HALL_DOOR.x - GUILD_HALL_ARRIVAL.x, GUILD_HALL_DOOR.enter - GUILD_HALL_FEET_OFFSET - GUILD_HALL_ARRIVAL.y);
  expect(walk).toBeGreaterThan(400);
  expect(() => f.run(server.useGuildHallDoor, {})).toThrow(/too far/);
  f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + BigInt(Math.ceil(walk / 200 * 1_000_000)));
  f.run(server.useGuildHallDoor, {});
  expect([f.me().x, f.me().y]).toEqual([guildHallRoom(0).inside.x, guildHallRoom(0).inside.y]);
});
