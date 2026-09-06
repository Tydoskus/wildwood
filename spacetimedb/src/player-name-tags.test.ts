import { expect, it, vi } from "vitest";
import { Identity } from "../../tests/helpers/spacetime-memory-db";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { migrateGuildTags } from "./player-name-tags";
import { DEVELOPER_IDENTITY } from "../../src/app/developer";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function registered() {
  const f = crystalFixture();
  f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
  return f;
}
it("updates public tags on create and leave while keeping a saved hidden developer badge", () => {
  const f = registered();
  f.seed("playerNameTag", { identity: f.ctx.sender, guildTag: "", showDevTag: false });
  f.run(server.createGuild, { name: "Fire" });
  expect(f.db.playerNameTag.identity.find(f.ctx.sender)).toMatchObject({ guildTag: "Fire", showDevTag: false });
  f.run(server.leaveGuild);
  expect(f.db.playerNameTag.identity.find(f.ctx.sender)).toMatchObject({ guildTag: "", showDevTag: false });
});
it("renames the existing guild without replacing its membership and refreshes cached rankings", () => {
  const f = registered(); f.run(server.createGuild, { name: "TheG" });
  const guild = f.db.guild.id.find(1n);
  f.db.guild.id.update({ ...guild, name: "The Guilds", nameKey: "the guilds" });
  f.seed("guildRank", { guildId: guild.id, rankKey: "rank", payload: JSON.stringify({ id: String(guild.id), name: "The Guilds" }) });
  f.seed("guildStanding", { id: 0, week: 0, entries: JSON.stringify([{ id: String(guild.id), name: "The Guilds" }]) });
  const member = f.db.guildMember.identity.find(f.ctx.sender);
  f.transaction(() => migrateGuildTags(f.ctx as any));
  expect(f.db.guild.id.find(1n)).toMatchObject({ name: "TheG", nameKey: "theg" });
  expect(f.db.guildMember.identity.find(f.ctx.sender)).toEqual(member);
  expect(f.db.playerNameTag.identity.find(f.ctx.sender).guildTag).toBe("TheG");
  expect(JSON.parse(f.db.guildRank.guildId.find(1n).payload).name).toBe("TheG");
  expect(JSON.parse(f.db.guildStanding.id.find(0).entries)[0].name).toBe("TheG");
  f.transaction(() => migrateGuildTags(f.ctx as any));
  expect(f.db.guild.count()).toBe(1n);
});
it("requires the authenticated developer account to change the developer tag", () => {
  const f = registered();
  expect(() => f.run(server.setDeveloperNameTag, { visible: false })).toThrow("Developer access");
  const developer = new Identity(DEVELOPER_IDENTITY);
  f.seed("player", { ...f.db.player.identity.find(identity("1")), identity: developer });
  f.seed("playerController", { identity: developer, connectionId: f.ctx.connectionId });
  const session = f.db.playerSession.connectionId.find(f.ctx.connectionId);
  f.db.playerSession.connectionId.update({ ...session, identity: developer });
  f.ctx.sender = developer;
  f.run(server.setDeveloperNameTag, { visible: false });
  expect(f.db.playerNameTag.identity.find(developer).showDevTag).toBe(false);
  f.run(server.setDeveloperNameTag, { visible: true });
  expect(f.db.playerNameTag.identity.find(developer).showDevTag).toBe(true);
});
