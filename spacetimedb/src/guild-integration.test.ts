import { describe, expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { STARTER_BOW } from "../../shared/items";
import { SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
import type { GuildSnapshot } from "../../shared/guilds";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

function fixture() {
  const f = crystalFixture();
  const basePlayer = f.db.player.identity.find(f.ctx.sender);
  const connection = f.ctx.connectionId!;
  const actor = (digit: string, registered = true) => {
    const who = identity(digit);
    f.ctx.sender = who;
    f.ctx.connectionId = connection;
    f.ctx.senderAuth = registered ? { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } } : {};
    if (!f.db.playerProgress.identity.find(who)) f.progress(who);
    if (!f.db.playerProfile.identity.find(who)) f.seed("playerProfile", { identity: who, displayName: `Player ${digit}`, skinTone: 3 });
    if (!f.db.player.identity.find(who)) f.seed("player", { ...basePlayer, identity: who });
    if (!f.db.playerController.identity.find(who)) f.seed("playerController", { identity: who, connectionId: connection });
    const session = f.db.playerSession.connectionId.find(connection);
    f.db.playerSession.connectionId.update({ ...session, identity: who });
  };
  const snapshot = (): GuildSnapshot => JSON.parse((server.getGuildHub as any)(
    { withTx: (action: (ctx: typeof f.ctx) => unknown) => f.transaction(() => action(f.ctx)) }, { afterId: 0n },
  ));
  const guild = (digits: string[], name: string) => {
    actor(digits[0]); f.run(server.createGuild, { name });
    const guildId = f.db.guildMember.identity.find(f.ctx.sender).guildId;
    for (const digit of digits.slice(1)) { actor(digit); f.run(server.joinGuild, { guildId }); }
    actor(digits[0]);
    return guildId;
  };
  return { ...f, actor, snapshot, guild };
}

describe("guild root reducer integration", () => {
  it("requires a registered controlling root account for mutations while guests may browse", () => {
    const f = fixture();
    f.actor("1", false);
    expect(f.snapshot()).toMatchObject({ signedIn: false, guild: null, directory: [] });
    expect(() => f.run(server.createGuild, { name: "Rose Guard" })).toThrow("Register");
    expect(f.db.guild.count()).toBe(0n);
    f.actor("1");
    f.ctx.connectionId = null;
    expect(() => f.run(server.createGuild, { name: "Rose Guard" })).toThrow();
    f.actor("1");
    f.seed("shardRuntime", { id: 0, role: "map", enabled: true });
    f.seed("shardAdmission", { identity: f.ctx.sender, generation: 1n, tabId: "test", inDuel: false });
    expect(() => f.run(server.createGuild, { name: "Rose Guard" })).toThrow("main character");
    expect(f.db.guild.count()).toBe(0n);
    expect(f.db.guildAccount.count()).toBe(0n);
  });
  it("rejects cross-guild leadership, champion and removal requests without partial changes", () => {
    const f = fixture();
    const ours = f.guild(["1", "2"], "Rose Guard");
    const theirs = f.guild(["3", "4"], "Moon Guard");
    f.actor("1");
    expect(() => f.run(server.setGuildChampion, { identity: identity("3"), champion: true })).toThrow("member");
    expect(() => f.run(server.transferGuildLeadership, { identity: identity("3") })).toThrow("member");
    expect(() => f.run(server.kickGuildMember, { identity: identity("3") })).toThrow("not in your guild");
    f.actor("2");
    expect(() => f.run(server.kickGuildMember, { identity: identity("1") })).toThrow("leader");
    expect(f.db.guild.id.find(ours)).toMatchObject({ members: 2, champions: 0 });
    expect(f.db.guild.id.find(theirs)).toMatchObject({ members: 2, champions: 0 });
    expect(f.db.guild.id.find(ours).leader.equals(identity("1"))).toBe(true);
    expect(f.db.guild.id.find(theirs).leader.equals(identity("3"))).toBe(true);
  });
  it("captures authoritative gear/research stats, leaves saved builds stable, and keeps fighters private", () => {
    const f = fixture();
    f.guild(["1", "2", "3"], "Rose Guard");
    f.patch("playerProgress", { damage: 100, armor: 30, bowCount: 1, inventoryJson: JSON.stringify([STARTER_BOW]), equippedRightHand: STARTER_BOW });
    f.seed("playerResearch", { identity: f.ctx.sender, precision: 5 });
    for (const name of ["player", "playerProfile", "playerProgress", "guild", "guildMember", "guildRank", "guildBattleReport", "guildReportParticipant"]) {
      f.db[name].iter = () => { throw Error(`Unexpected full scan: ${name}`); };
    }
    f.run(server.setGuildChampion, { identity: identity("1"), champion: true, fighter: { damage: 1e30 } });
    const saved = JSON.parse(f.db.guildMember.identity.find(identity("1")).fighter);
    expect(saved.armor).toBeCloseTo(33);
    expect(saved.damage).toBeGreaterThan(0);
    expect(saved.damage).toBeLessThan(1000);
    f.patch("playerProgress", { damage: 200 });
    expect(JSON.parse(f.db.guildMember.identity.find(identity("1")).fighter).damage).toBe(saved.damage);
    f.run(server.refreshGuildChampion);
    expect(JSON.parse(f.db.guildMember.identity.find(identity("1")).fighter).damage).toBeCloseTo(saved.damage * 2);
    const hub = f.snapshot();
    expect(hub.guild?.members[0]).not.toHaveProperty("fighter");
    expect(hub.directory[0]).not.toHaveProperty("leader");
    expect(hub.guild?.members[0]).not.toHaveProperty("account");
  });
  it("rolls back battle points, participation and reports if a transactional write fails", () => {
    const f = fixture();
    const ours = f.guild(["1", "2", "3"], "Rose Guard");
    for (const digit of ["1", "2", "3"]) f.run(server.setGuildChampion, { identity: identity(digit), champion: true });
    const theirs = f.guild(["4", "5", "6"], "Moon Guard");
    for (const digit of ["4", "5", "6"]) f.run(server.setGuildChampion, { identity: identity(digit), champion: true });
    f.actor("1");
    const previous = f.db.guild.id.find(ours);
    const participation = f.db.guildAccount.identity.find(identity("1"));
    const insert = f.db.guildBattleReport.insert;
    let writes = 0;
    f.db.guildBattleReport.insert = (row: unknown) => { if (++writes === 2) throw Error("Report persistence failed"); return insert(row); };
    expect(() => f.run(server.challengeGuild, { opponentGuildId: theirs })).toThrow("persistence failed");
    expect(f.db.guild.id.find(ours)).toEqual(previous);
    expect(f.db.guildAccount.identity.find(identity("1"))).toEqual(participation);
    expect(f.db.guildBattleReport.count()).toBe(0n);
    expect(f.db.guildReportParticipant.count()).toBe(0n);
    expect(f.db.guildBattleCounter.count()).toBe(0n);
    expect(f.db.guildRank.count()).toBe(0n);
    f.db.guildBattleReport.insert = insert;
    f.run(server.challengeGuild, { opponentGuildId: theirs });
    expect(f.db.guild.id.find(ours).attacks).toBe(1);
    expect(f.db.guildBattleReport.count()).toBe(2n);
  });
});
