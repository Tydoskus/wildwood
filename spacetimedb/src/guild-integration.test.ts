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
  it("allows guests to join and create while requiring the controlling root connection", () => {
    const f = fixture();
    f.actor("1", false);
    expect(f.snapshot()).toMatchObject({ signedIn: false, guild: null, directory: [] });
    f.run(server.createGuild, { name: "Rose" });
    expect(f.snapshot().guild?.name).toBe("Rose");
    f.run(server.leaveGuild);
    expect(f.db.guild.count()).toBe(0n);
    f.actor("1");
    f.ctx.connectionId = null;
    expect(() => f.run(server.createGuild, { name: "Rose" })).toThrow();
    f.actor("1");
    f.seed("shardRuntime", { id: 0, role: "map", enabled: true });
    f.seed("shardAdmission", { identity: f.ctx.sender, generation: 1n, tabId: "test", inDuel: false });
    expect(() => f.run(server.createGuild, { name: "Rose" })).toThrow("main character");
    expect(f.db.guild.count()).toBe(0n);
    expect(f.db.guildAccount.count()).toBe(1n);
  });
  it("rejects cross-guild leadership and removal requests without partial changes", () => {
    const f = fixture();
    const ours = f.guild(["1", "2"], "Rose");
    const theirs = f.guild(["3", "4"], "Moon");
    f.actor("1");
    expect(() => f.run(server.transferGuildLeadership, { identity: identity("3") })).toThrow("member");
    expect(() => f.run(server.kickGuildMember, { identity: identity("3") })).toThrow("not in your guild");
    f.actor("2");
    expect(() => f.run(server.kickGuildMember, { identity: identity("1") })).toThrow("leader");
    expect(f.db.guild.id.find(ours)).toMatchObject({ members: 2, champions: 0 });
    expect(f.db.guild.id.find(theirs)).toMatchObject({ members: 2, champions: 0 });
    expect(f.db.guild.id.find(ours).leader.equals(identity("1"))).toBe(true);
    expect(f.db.guild.id.find(theirs).leader.equals(identity("3"))).toBe(true);
  });
  it("captures current authoritative gear/research stats and ignores client fighters", () => {
    const f = fixture();
    f.guild(["1", "2", "3"], "Rose");
    const theirs = f.guild(["4", "5", "6"], "Moon");
    f.actor("1");
    f.patch("playerProgress", { damage: 100, armor: 30, bowCount: 1, inventoryJson: JSON.stringify([STARTER_BOW]), equippedRightHand: STARTER_BOW });
    f.seed("playerResearch", { identity: f.ctx.sender, precision: 5 });
    for (const name of ["player", "playerProfile", "playerProgress", "guild", "guildMember", "guildRank", "guildBattleReport", "guildReportParticipant"]) {
      f.db[name].iter = () => { throw Error(`Unexpected full scan: ${name}`); };
    }
    f.run(server.challengeGuild, { opponentGuildId: theirs, fighter: { damage: 1e30 } });
    const result = f.snapshot().battles[0].result;
    if (result.version !== 2) throw Error("Expected whole-guild replay");
    const saved = result.attackers.find(member => member.identity === identity("1").toHexString())!;
    expect(saved.fighter.armor).toBeCloseTo(33);
    expect(saved.fighter.damage).toBeGreaterThan(0); expect(saved.fighter.damage).toBeLessThan(1000);
    expect(saved.appearance?.rightHandItem).toBe(STARTER_BOW);
    f.patch("playerProgress", { damage: 200 });
    expect(f.snapshot().battles[0].result).toEqual(result);
    expect(f.snapshot().guild?.members[0]).not.toHaveProperty("fighter");
  });
  it("announces one public replay and lets spectators fetch only an announced retained report", () => {
    const f = fixture();
    const ours = f.guild(["1", "2"], "Rose");
    const theirs = f.guild(["3", "4"], "Moon");
    f.actor("1"); f.run(server.challengeGuild, { opponentGuildId: theirs });
    const report = f.snapshot().battles[0];
    const announcements = [...f.db.chatMessage.iter()].filter(row => row.guildReplayKey);
    expect(announcements).toHaveLength(1);
    expect(announcements[0].guildReplayKey).toBe(`${ours}:${report.id}`);
    expect(announcements[0].message).toContain("[Rose]");
    expect(announcements[0].message).toContain("[Moon]");
    const read = (reportKey: string) => (server.getGuildReplay as any)(
      { withTx: (action: (ctx: typeof f.ctx) => unknown) => f.transaction(() => action(f.ctx)) }, { reportKey },
    );
    f.actor("5");
    expect(JSON.parse(read(announcements[0].guildReplayKey))).toEqual(report);
    expect(() => read(`${theirs}:${report.id}`)).toThrow("no longer available");
    f.db.guildBattleReport.key.delete(announcements[0].guildReplayKey);
    expect(() => read(announcements[0].guildReplayKey)).toThrow("no longer available");
  });
  it("rolls back battle points, participation and reports if a transactional write fails", () => {
    const f = fixture();
    const ours = f.guild(["1", "2", "3"], "Rose");
    const theirs = f.guild(["4", "5", "6"], "Moon");
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

it("preserves a guest's guild through the real account-link reducer", () => {
  const f = fixture();
  f.actor("2", false); f.run(server.createGuild, { name: "Guest".slice(0, 4) });
  const guestGuild = f.snapshot().guild!.id;
  f.seed("accountLink", { code: "guild-link", guest: identity("2"), createdAt: f.ctx.timestamp });
  f.actor("3"); f.db.playerProgress.identity.delete(identity("3")); f.run(server.claimGuestAccount, { code: "guild-link" });
  expect(f.snapshot().guild?.id).toBe(guestGuild);
  expect(f.snapshot().guild?.leader).toBe(identity("3").toHexString());
  expect(f.db.guildMember.identity.find(identity("2"))).toBeNull();
  expect(f.db.playerNameTag.identity.find(identity("3")).guildTag).toBe("Gues");
});
