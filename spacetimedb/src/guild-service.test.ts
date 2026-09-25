import { describe, expect, it, vi } from "vitest";
import { schema } from "../../tests/helpers/spacetime-module";
import { Identity, Timestamp, createMemoryDatabase } from "../../tests/helpers/spacetime-memory-db";
import { socialTables } from "./social-tables";
import { guildTables } from "./guild-tables";
import { createGuildService } from "./guild-service";
import { GUILD_DAY_MICROS, guildDay, guildWeek, normalizeGuildName } from "../../shared/guilds";
import type { DuelFighter } from "../../shared/duel-combat";

vi.mock("spacetimedb/server", async () => ({ ...(await import("../../tests/helpers/spacetime-module")),
  Range: class { constructor(public from: any = { tag: "unbounded" }, public to: any = { tag: "unbounded" }) {} },
}));
const identity = (id: number) => new Identity(id.toString(16).padStart(64, "0"));
const guildName = (n: number) => `G${String.fromCharCode(65 + Math.floor(n / 26))}${String.fromCharCode(65 + n % 26)}d`;
const fighter: DuelFighter = { maxHp: 100, damage: 20, armor: 0, regen: 0, attackRate: 1 };
function fixture(allowGuildScan = false) {
  // Separate root/server SDK installs have nominal BinaryReader private fields;
  // the test registration shim consumes identical structural table metadata.
  const memory = createMemoryDatabase(schema({ ...guildTables, ...socialTables } as unknown as Parameters<typeof schema>[0]));
  const db = memory.db;
  const ctx = { db, sender: identity(1), timestamp: new Timestamp(20_000n * GUILD_DAY_MICROS) };
  const stats = new Map<string, DuelFighter>();
  const reads = { guild: 0, guildRank: 0 };
  let insertedRank: bigint | null = null;
  const insertRank = db.guildRank.insert;
  db.guildRank.insert = (row: any) => { insertedRank = row.guildId; return insertRank(row); };
  // Real host index scans chain the transaction's inserted row before sorted
  // committed rows. The rank test deliberately models this non-global ordering.
  for (const [table, column] of [["guild", "id"], ["guildRank", "rankKey"]] as const) {
    const source = db[table].iter;
    db[table][table === "guild" ? "directoryId" : "rankKey"].filter = function* (range: any) {
      const rows = [...source()].filter(row =>
        (range.from.tag === "unbounded" || (range.from.tag === "included" ? row[column] >= range.from.value : row[column] > range.from.value)) &&
        (range.to.tag === "unbounded" || (range.to.tag === "included" ? row[column] <= range.to.value : row[column] < range.to.value)));
      const recentIndex = table === "guildRank" ? rows.findIndex(row => row.guildId === insertedRank) : -1;
      const recent = recentIndex >= 0 ? rows.splice(recentIndex, 1)[0] : null;
      rows.sort((a, b) => a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0);
      for (const row of recent ? [recent, ...rows] : rows) { reads[table]++; yield row; }
    };
    if (table !== "guild" || !allowGuildScan) db[table].iter = () => { throw Error("Unexpected global table scan"); };
  }
  for (const name of ["guildMember", "guildBattleReport", "guildAccount", "guildStanding", "guildReportParticipant"]) db[name].iter = () => { throw Error("Unexpected global table scan"); };
  const service = createGuildService({ fighterFor: (_ctx, who) => ({ name: `Player ${who.toHexString().slice(-3)}`, fighter: stats.get(who.toHexString()) ?? fighter }) });
  const run = <T>(who: number, action: (context: any) => T) => {
    ctx.sender = identity(who); insertedRank = null;
    return memory.transaction(() => action(ctx));
  };
  const makeGuild = (first: number, name = guildName(first)) => {
    run(first, context => service.create(context, name));
    const id: bigint = db.guildMember.identity.find(identity(first)).guildId;
    for (const next of [first + 1, first + 2]) run(next, context => service.join(context, id));
    return id;
  };
  return { ...memory, db, ctx, service, run, makeGuild, stats, reads,
    advance: (micros: bigint) => { ctx.timestamp = new Timestamp(ctx.timestamp.microsSinceUnixEpoch + micros); } };
}

describe("guild membership and authoritative rosters", () => {
  it("totals power for current members only, including offline members", () => {
    const f = fixture(); f.makeGuild(1); f.makeGuild(10);
    const powerFor = vi.fn((_ctx, who: Identity) => Number(BigInt(`0x${who.toHexString()}`)) * 1000);
    const service = createGuildService({ fighterFor: () => ({ name: "Test", fighter }), powerFor });
    const snapshot = f.run(1, ctx => service.snapshot(ctx));
    expect(snapshot.guild?.totalPower).toBe(6000);
    expect(snapshot.directory.map(row => row.totalPower)).toEqual([6000, 33000]);
    expect(powerFor).toHaveBeenCalledTimes(6);
    f.run(2, ctx => f.service.leave(ctx));
    expect(f.run(1, ctx => service.snapshot(ctx)).guild?.totalPower).toBe(4000);
  });

  it("lets the President appoint one Vice President with shared battle access only", () => {
    const f = fixture(), a = f.makeGuild(1), b = f.makeGuild(10), c = f.makeGuild(20);
    expect(f.db.guildMember.identity.find(identity(2)).vicePresident).toBe(false);
    expect(() => f.run(2, ctx => f.service.setVicePresident(ctx, identity(3), true))).toThrow("President");
    expect(() => f.run(1, ctx => f.service.setVicePresident(ctx, identity(10), true))).toThrow("member");
    expect(() => f.run(1, ctx => f.service.setVicePresident(ctx, identity(1), true))).toThrow("cannot also");
    f.run(1, ctx => f.service.setVicePresident(ctx, identity(2), true));
    expect(f.run(2, ctx => f.service.snapshot(ctx)).guild?.vicePresident).toBe(identity(2).toHexString());
    expect(() => f.run(2, ctx => f.service.kick(ctx, identity(3)))).toThrow("President");
    expect(() => f.run(2, ctx => f.service.transfer(ctx, identity(3)))).toThrow("President");
    f.run(2, ctx => f.service.challenge(ctx, b));
    expect(f.run(1, ctx => f.service.snapshot(ctx)).guild?.attacksRemaining).toBe(2);
    expect(() => f.run(1, ctx => f.service.challenge(ctx, b))).toThrow("already challenged");
    f.run(1, ctx => f.service.setVicePresident(ctx, identity(3), true));
    expect(f.db.guildMember.identity.find(identity(2)).vicePresident).toBe(false);
    expect(() => f.run(2, ctx => f.service.challenge(ctx, c))).toThrow("President");
    f.run(3, ctx => f.service.challenge(ctx, c));
    expect(f.db.guild.id.find(a).attacks).toBe(2);
    f.run(1, ctx => f.service.setVicePresident(ctx, identity(3), false));
    expect(f.run(1, ctx => f.service.snapshot(ctx)).guild?.vicePresident).toBeNull();
  });
  it("handles Vice President succession, transfer, removal, rejoining and registration", () => {
    const f = fixture(), a = f.makeGuild(1);
    f.run(1, ctx => f.service.setVicePresident(ctx, identity(3), true));
    f.run(1, ctx => f.service.leave(ctx));
    expect(f.db.guild.id.find(a).leader.equals(identity(3))).toBe(true);
    expect(f.db.guildMember.identity.find(identity(3)).vicePresident).toBe(false);
    f.run(3, ctx => f.service.setVicePresident(ctx, identity(2), true));
    f.run(3, ctx => f.service.mergeGuest(ctx, identity(2), identity(30)));
    expect(f.run(3, ctx => f.service.snapshot(ctx)).guild?.vicePresident).toBe(identity(30).toHexString());
    f.run(3, ctx => f.service.transfer(ctx, identity(30)));
    expect(f.run(30, ctx => f.service.snapshot(ctx)).guild?.vicePresident).toBeNull();
    f.run(30, ctx => f.service.setVicePresident(ctx, identity(3), true));
    f.run(30, ctx => f.service.kick(ctx, identity(3)));
    f.run(3, ctx => f.service.join(ctx, a));
    expect(f.db.guildMember.identity.find(identity(3)).vicePresident).toBe(false);
    f.run(30, ctx => f.service.setVicePresident(ctx, identity(3), true));
    f.run(30, ctx => f.service.removeAccount(ctx, identity(3)));
    expect(f.run(30, ctx => f.service.snapshot(ctx)).guild?.vicePresident).toBeNull();
  });
  it("normalizes names, rejects duplicate names and duplicate membership", () => {
    const f = fixture();
    f.run(1, ctx => f.service.create(ctx, "  Rose  "));
    expect(f.db.guild.id.find(1n).name).toBe("Rose");
    expect(() => f.run(2, ctx => f.service.create(ctx, "rose"))).toThrow("already taken");
    expect(() => f.run(1, ctx => f.service.create(ctx, "Othr"))).toThrow("Leave");
    expect(() => normalizeGuildName("<img src=x>")).toThrow();
    expect(f.db.guild.count()).toBe(1n);
  });
  it("enforces twenty members and leader-only management", () => {
    const f = fixture();
    const id = f.makeGuild(1);
    for (let who = 4; who <= 20; who++) f.run(who, ctx => f.service.join(ctx, id));
    expect(() => f.run(21, ctx => f.service.join(ctx, id))).toThrow("full");
    expect(() => f.run(2, ctx => f.service.kick(ctx, identity(3)))).toThrow("President");
    expect(() => f.run(2, ctx => f.service.transfer(ctx, identity(3)))).toThrow("President");
    expect(() => f.run(1, ctx => f.service.transfer(ctx, identity(30)))).toThrow("member");
    f.run(1, ctx => f.service.transfer(ctx, identity(2)));
    expect(f.db.guild.id.find(id).leader.equals(identity(2))).toBe(true);
  });
  it("allows immediate joining and creation after leaving or removal, including old cooldowns", () => {
    const f = fixture();
    const a = f.makeGuild(1), b = f.makeGuild(10);
    f.run(2, ctx => f.service.leave(ctx));
    expect(f.db.guild.id.find(a).members).toBe(2);
    const account = f.db.guildAccount.identity.find(identity(2));
    f.db.guildAccount.identity.update({ ...account, joinAfter: f.ctx.timestamp.microsSinceUnixEpoch + GUILD_DAY_MICROS });
    expect(f.run(2, ctx => f.service.snapshot(ctx)).joinAfter).toBe("0");
    f.run(2, ctx => f.service.join(ctx, b));
    expect(f.db.guildMember.identity.find(identity(2)).eligibleAt).toBe(f.ctx.timestamp.microsSinceUnixEpoch);
    expect(f.db.guildAccount.identity.find(identity(2)).joinAfter).toBe(0n);
    f.run(10, ctx => f.service.kick(ctx, identity(2)));
    f.run(2, ctx => f.service.create(ctx, "NewG"));
    expect(f.db.guildMember.identity.find(identity(2))).toBeDefined();
  });
  it("transfers leadership deterministically and deletes empty guilds", () => {
    const f = fixture();
    const a = f.makeGuild(1);
    f.run(1, ctx => f.service.leave(ctx));
    expect(f.db.guild.id.find(a).leader.equals(identity(2))).toBe(true);
    f.run(2, ctx => f.service.kick(ctx, identity(3)));
    f.run(2, ctx => f.service.leave(ctx));
    expect(f.db.guild.id.find(a)).toBeNull();
    expect(f.db.guildBattleReport.count()).toBe(0n);
  });
  it("snapshots every current member at challenge time and freezes the report", () => {
    const f = fixture(), a = f.makeGuild(1), b = f.makeGuild(10);
    f.run(4, ctx => f.service.join(ctx, a));
    f.stats.set(identity(2).toHexString(), { ...fighter, damage: 100 });
    f.run(1, ctx => f.service.challenge(ctx, b));
    const result = f.run(1, ctx => f.service.snapshot(ctx)).battles[0].result;
    if ((result.version !== 2 && result.version !== 3 && result.version !== 4)) throw Error("Expected whole-guild replay");
    expect(result.attackers).toHaveLength(4); expect(result.defenders).toHaveLength(3);
    expect(result.attackers[1].fighter.damage).toBe(100);
    f.stats.set(identity(2).toHexString(), { ...fighter, damage: 900 });
    expect(result.attackers[1].fighter.damage).toBe(100);
  });
  it("removes membership and transfers leadership on account deletion", () => {
    const f = fixture();
    const a = f.makeGuild(1);
    expect(f.db.guildMember.identity.find(identity(1))).toMatchObject({ guildId: a, champion: false, fighter: "" });
    f.run(1, ctx => f.service.removeAccount(ctx, identity(1)));
    expect(f.db.guildMember.identity.find(identity(1))).toBeNull();
    expect(f.db.guildAccount.identity.find(identity(1))).toBeNull();
    expect(f.db.guild.id.find(a).leader.equals(identity(2))).toBe(true);
  });
  it("transfers guest membership, leadership and report erasure references when registering", () => {
    const f = fixture(), a = f.makeGuild(1), b = f.makeGuild(10);
    f.run(1, ctx => f.service.challenge(ctx, b));
    f.run(30, ctx => f.service.mergeGuest(ctx, identity(1), identity(30)));
    expect(f.db.guildMember.identity.find(identity(1))).toBeNull();
    expect(f.db.guildMember.identity.find(identity(30)).guildId).toBe(a);
    expect(f.db.guild.id.find(a).leader.equals(identity(30))).toBe(true);
    expect(f.db.guild.id.find(a).members).toBe(3);
    expect(f.db.guildAccount.identity.find(identity(30)).attackGuild).toBe(a);
    expect([...f.db.guildReportParticipant.identity.filter(identity(1))]).toHaveLength(0);
    expect([...f.db.guildReportParticipant.identity.filter(identity(30))]).toHaveLength(2);
    f.run(30, ctx => f.service.removeAccount(ctx, identity(30)));
    expect(JSON.stringify(f.run(10, ctx => f.service.snapshot(ctx)).battles)).toContain("Deleted player");
  });
  it("preserves an existing account guild when linking a guest from another guild", () => {
    const f = fixture(), a = f.makeGuild(1), b = f.makeGuild(10);
    f.run(10, ctx => f.service.mergeGuest(ctx, identity(1), identity(10)));
    expect(f.db.guildMember.identity.find(identity(10)).guildId).toBe(b);
    expect(f.db.guild.id.find(a).members).toBe(2);
    expect(f.db.guild.id.find(a).leader.equals(identity(2))).toBe(true);
  });

});

describe("asynchronous battles and bounded standings", () => {
  it("resolves saved offline teams, records both reports, and retries cannot score twice", () => {
    const f = fixture();
    const a = f.makeGuild(1), b = f.makeGuild(10);
    for (const who of [1, 2, 3]) {
      f.stats.set(identity(who).toHexString(), { ...fighter, damage: 1000 });
    }
    f.run(1, ctx => f.service.challenge(ctx, b));
    const result = f.run(1, ctx => f.service.snapshot(ctx));
    expect(result.guild?.attacksRemaining).toBe(2);
    expect(result.battles[0].result.outcome).toBe("VICTORY");
    expect(result.standings[0]).toMatchObject({ id: String(a), score: 3, wins: 1 });
    expect(f.run(10, ctx => f.service.snapshot(ctx)).battles[0].id).toBe(result.battles[0].id);
    expect(() => f.run(1, ctx => f.service.challenge(ctx, b))).toThrow("already challenged");
    expect(f.db.guild.id.find(a).score).toBe(3);
    expect(f.db.guildBattleCounter.id.find(0).next).toBe(1n);
  });
  it("marks only today's challenged guilds in the directory and clears the hint on rollover", () => {
    const f = fixture();
    f.makeGuild(1);
    const opponent = f.makeGuild(10);
    const untouched = f.makeGuild(20);
    f.run(1, ctx => f.service.challenge(ctx, opponent));
    const directory = f.run(1, ctx => f.service.snapshot(ctx)).directory;
    expect(directory.find(row => row.id === String(opponent))?.challengedToday).toBe(true);
    expect(directory.find(row => row.id === String(untouched))?.challengedToday).toBe(false);
    expect(f.run(10, ctx => f.service.snapshot(ctx)).directory.every(row => !row.challengedToday)).toBe(true);
    f.advance(GUILD_DAY_MICROS);
    expect(f.run(1, ctx => f.service.snapshot(ctx)).directory.every(row => !row.challengedToday)).toBe(true);
  });
  it("enforces daily attack budget and resets it at the UTC day boundary", () => {
    const f = fixture();
    f.makeGuild(1);
    const targets = [10, 20, 30, 40].map(who => f.makeGuild(who));
    for (const target of targets.slice(0, 3)) f.run(1, ctx => f.service.challenge(ctx, target));
    expect(() => f.run(1, ctx => f.service.challenge(ctx, targets[3]))).toThrow("three attacks");
    f.advance(GUILD_DAY_MICROS);
    f.run(1, ctx => f.service.challenge(ctx, targets[0]));
    expect(f.run(1, ctx => f.service.snapshot(ctx)).guild?.attacksRemaining).toBe(2);
  });
  it("rejects self battle, nonleader attacks, ineligible members and identity hopping", () => {
    const f = fixture();
    const a = f.makeGuild(1), b = f.makeGuild(10);
    expect(() => f.run(1, ctx => f.service.challenge(ctx, a))).toThrow("another");
    expect(() => f.run(2, ctx => f.service.challenge(ctx, b))).toThrow("President");
    const waiting = f.db.guildMember.identity.find(identity(12));
    f.db.guildMember.identity.update({ ...waiting, eligibleAt: f.ctx.timestamp.microsSinceUnixEpoch + 1n });
    expect(() => f.run(1, ctx => f.service.challenge(ctx, b))).toThrow("not yet eligible");
    f.db.guildMember.identity.update(waiting);
    const account = f.db.guildAccount.identity.find(identity(2));
    f.db.guildAccount.identity.update({ ...account, lastAttackDay: guildDay(f.ctx.timestamp.microsSinceUnixEpoch), attackGuild: 99n });
    expect(() => f.run(1, ctx => f.service.challenge(ctx, b))).toThrow("another guild");
    expect(f.db.guild.id.find(a).attacks).toBe(0);
    expect(f.db.guildBattleReport.count()).toBe(0n);
  });
  it("keeps only ten reports per guild, even with many intervening battles", () => {
    const f = fixture();
    const a = f.makeGuild(1), b = f.makeGuild(10);
    for (let battle = 0; battle < 12; battle++) {
      f.run(1, ctx => f.service.challenge(ctx, b));
      f.advance(GUILD_DAY_MICROS);
    }
    expect([...f.db.guildBattleReport.guildId.filter(a)]).toHaveLength(10);
    expect([...f.db.guildBattleReport.guildId.filter(b)]).toHaveLength(10);
    expect(f.run(1, ctx => f.service.snapshot(ctx)).battles.map(row => row.id)).toEqual(["12", "11", "10", "9", "8", "7", "6", "5", "4", "3"]);
    expect(f.db.guildReportParticipant.count()).toBe(120n);
    expect([...f.db.guildReportParticipant.reportKey.filter(`${a}:1`)]).toEqual([]);
    expect([...f.db.guildReportParticipant.reportKey.filter(`${b}:2`)]).toEqual([]);
    for (const who of [1, 2, 3]) f.run(who, ctx => f.service.leave(ctx));
    expect(f.db.guildReportParticipant.count()).toBe(60n);
    expect([...f.db.guildReportParticipant.reportKey.filter(`${a}:12`)]).toEqual([]);
  });
  it("anonymizes both copies and past guild histories through indexed identity references", () => {
    const f = fixture();
    const a = f.makeGuild(1), b = f.makeGuild(10);
    f.run(1, ctx => f.service.challenge(ctx, b));
    const before = f.run(10, ctx => f.service.snapshot(ctx)).battles[0];
    if ((before.result.version !== 2 && before.result.version !== 3 && before.result.version !== 4)) throw Error("Expected whole-guild replay");
    const originalName = before.result.attackers[0].name;
    f.run(1, ctx => f.service.leave(ctx));
    f.run(10, ctx => f.service.removeAccount(ctx, identity(1)));
    for (const guildId of [a, b]) {
      const row = [...f.db.guildBattleReport.guildId.filter(guildId)][0];
      const report = JSON.parse(row.payload);
      expect(report.result.attackers[0].name).toBe("Deleted player");
      expect(report.result.defenders[0]).toEqual(before.result.defenders[0]);
      expect(report.result.attackers[1]).toEqual(before.result.attackers[1]);
      expect(row.payload).not.toContain(originalName);
      expect([...f.db.guildReportParticipant.reportKey.filter(row.key)]).toHaveLength(5);
    }
    expect([...f.db.guildReportParticipant.identity.filter(identity(1))]).toEqual([]);
    expect(f.db.guildReportParticipant.count()).toBe(10n);
  });
  it("clears last week's display lazily and starts new scores without scheduled scans", () => {
    const f = fixture();
    const a = f.makeGuild(1), b = f.makeGuild(10);
    f.run(1, ctx => f.service.challenge(ctx, b));
    const next = BigInt(f.run(1, ctx => f.service.snapshot(ctx)).nextWeekAt);
    f.ctx.timestamp = new Timestamp(next);
    const snapshot = f.run(1, ctx => f.service.snapshot(ctx));
    expect(snapshot.standings).toEqual([]);
    expect(snapshot.guild?.score).toBe(0);
    f.run(1, ctx => f.service.challenge(ctx, b));
    expect(f.db.guild.id.find(a)).toMatchObject({ battles: 1, score: 1, week: guildWeek(next) });
  });
  it("returns stable twenty-row directory pages and never scans global tables", () => {
    const f = fixture();
    for (let who = 1; who <= 45; who++) f.run(who, ctx => f.service.create(ctx, guildName(who)));
    const first = f.run(1, ctx => f.service.snapshot(ctx));
    expect(first.directory).toHaveLength(20);
    expect(first.nextPage).toBe("20");
    expect(f.reads.guild).toBe(21);
    const second = f.run(1, ctx => f.service.snapshot(ctx, 20n));
    expect(second.directory[0].id).toBe("21");
    const last = f.run(1, ctx => f.service.snapshot(ctx, 40n, false));
    expect(last.directory).toHaveLength(5);
    expect(last.nextPage).toBeNull();
    expect(last.guild?.id).toBe("1");
  });
  it("ranks exact top50 despite tx-first index order and refills after disband", () => {
    const f = fixture();
    const week = guildWeek(f.ctx.timestamp.microsSinceUnixEpoch);
    for (let who = 1; who <= 55; who++) {
      f.run(who, ctx => f.service.create(ctx, guildName(who)));
      const guild = f.db.guild.id.find(BigInt(who));
      const changed = { ...guild, battles: 1, score: who <= 50 ? 3 : 0, wins: who <= 50 ? 1 : 0 };
      f.db.guild.id.update(changed);
      f.db.guildRank.insert({ guildId: guild.id,
        rankKey: `${String(week).padStart(10, "0")}:${String(999 - changed.score).padStart(3, "0")}:${String(999 - changed.wins).padStart(3, "0")}:001:${String(guild.id).padStart(20, "0")}`,
        payload: JSON.stringify({ id: String(guild.id), name: guild.name, members: 1, score: changed.score, wins: changed.wins, battles: 1 }) });
    }
    f.reads.guildRank = 0;
    // Touch the lowest rank last so it appears first in the host transaction scan.
    f.run(100, ctx => f.service.join(ctx, 55n));
    let top = f.run(1, ctx => f.service.snapshot(ctx)).standings;
    expect(top).toHaveLength(50);
    expect(top.map(row => Number(row.id))).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(f.reads.guildRank).toBeLessThanOrEqual(51);
    f.run(1, ctx => f.service.leave(ctx));
    top = f.run(2, ctx => f.service.snapshot(ctx)).standings;
    expect(top).toHaveLength(50);
    expect(top[0].id).toBe("2");
    expect(top[49].id).toBe("51");
  });
});

it('restricts badge edits to the President and Vice President and persists the choice', () => {
  const f = fixture(); const id = f.makeGuild(1);
  expect(() => f.run(2, ctx => f.service.setEmblem(ctx, 3))).toThrow('President');
  f.run(1, ctx => f.service.setEmblem(ctx, 3));
  expect(f.run(2, ctx => f.service.preview(ctx, id)).emblem).toBe(3);
  f.run(1, ctx => f.service.setVicePresident(ctx, identity(2), true));
  f.run(2, ctx => f.service.setEmblem(ctx, 15));
  expect(f.run(1, ctx => f.service.snapshot(ctx)).guild?.emblem).toBe(15);
  expect(() => f.run(2, ctx => f.service.setEmblem(ctx, 16))).toThrow('valid');
  expect(() => f.run(2, ctx => f.service.setEmblem(ctx, -1))).toThrow('valid');
});
it('ranks opponents by saved power across page boundaries and reports member power', () => {
  const f = fixture(true);
  for (let who = 1; who <= 25; who++) f.run(who, ctx => f.service.create(ctx, guildName(who)));
  const service = createGuildService({ fighterFor: () => ({ name: "Test", fighter }),
    powerFor: (_ctx, who) => Number(BigInt(`0x${who.toHexString()}`)) * 1000 });
  const first = f.run(1, ctx => service.snapshot(ctx, 0n, true, true));
  expect(first.guild?.members[0].power).toBe(1000);
  expect(first.directory.map(row => row.totalPower)).toEqual(Array.from({ length: 20 }, (_, i) => (25 - i) * 1000));
  const next = f.run(1, ctx => service.snapshot(ctx, BigInt(first.nextPage!), true, true));
  expect(next.directory.map(row => row.totalPower)).toEqual([5000, 4000, 3000, 2000]);
  expect(next.nextPage).toBeNull();
});
