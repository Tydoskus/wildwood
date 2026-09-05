import type { Identity } from "spacetimedb";
import { Range, SenderError } from "spacetimedb/server";
import type { ModuleReducerCtx } from "./index";
import type { DuelFighter } from "../../shared/duel-combat";
import {
  GUILD_MEMBER_LIMIT, GUILD_TEAM_SIZE, GUILD_DAILY_ATTACKS, GUILD_MEMBERSHIP_COOLDOWN,
  GUILD_RANKING_LIMIT, guildDay, guildWeek, normalizeGuildName, resolveGuildBattle,
  type GuildFighter, type GuildSnapshot, type GuildStanding,
} from "../../shared/guilds";

type Ctx = ModuleReducerCtx;
type Guild = NonNullable<ReturnType<Ctx["db"]["guild"]["id"]["find"]>>;
type Member = NonNullable<ReturnType<Ctx["db"]["guildMember"]["identity"]["find"]>>;
const key = (identity: Identity) => identity.toHexString();
const now = (ctx: Ctx) => ctx.timestamp.microsSinceUnixEpoch;
function fail(message: string): never { throw new SenderError(message); }
const weekPrefix = (week: number) => `${String(week).padStart(10, "0")}:`;
const rankKey = (guild: Guild) => `${weekPrefix(guild.week)}${String(999 - guild.score).padStart(3, "0")}:${String(999 - guild.wins).padStart(3, "0")}:${String(guild.battles).padStart(3, "0")}:${String(guild.id).padStart(20, "0")}`;
const standing = (guild: Guild): GuildStanding => ({ id: String(guild.id), name: guild.name,
  members: guild.members, score: guild.score, wins: guild.wins, battles: guild.battles });
function members(ctx: Ctx, guildId: bigint) { return [...ctx.db.guildMember.guildId.filter(guildId)]; }
function requireMember(ctx: Ctx) {
  return ctx.db.guildMember.identity.find(ctx.sender) ?? fail("Join a guild first.");
}
function requireLeader(ctx: Ctx) {
  const member = requireMember(ctx);
  const guild = ctx.db.guild.id.find(member.guildId) ?? fail("Guild no longer exists.");
  if (!guild.leader.equals(ctx.sender)) fail("Only the guild leader can do this.");
  return guild;
}
function currentGuild(ctx: Ctx, guild: Guild) {
  const week = guildWeek(now(ctx)), day = guildDay(now(ctx));
  return { ...guild,
    ...(guild.week === week ? {} : { week, score: 0, wins: 0, battles: 0 }),
    ...(guild.attackDay === day ? {} : { attackDay: day, attacks: 0, opponents: "[]" }),
  };
}
function account(ctx: Ctx, identity: Identity) {
  return ctx.db.guildAccount.identity.find(identity) ?? ctx.db.guildAccount.insert({ identity,
    joinAfter: 0n, lastAttackDay: 0, attackGuild: 0n });
}
function assertCanJoin(ctx: Ctx) {
  if (ctx.db.guildMember.identity.find(ctx.sender)) fail("Leave your current guild first.");
  if (account(ctx, ctx.sender).joinAfter > now(ctx)) fail("You can join another guild 24 hours after leaving.");
}
function writeRanking(ctx: Ctx, guild: Guild) {
  ctx.db.guildRank.guildId.delete(guild.id);
  if (guild.members && guild.battles) ctx.db.guildRank.insert({ guildId: guild.id,
    rankKey: rankKey(guild), payload: JSON.stringify(standing(guild)) });
  const week = guildWeek(now(ctx)), prefix = weekPrefix(week);
  // The host chains transaction-local index rows before committed B-tree rows.
  // Only this guild's rank changes per operation. Include it separately, then
  // read 50 other committed candidates before sorting the at-most-51 records.
  const entries: GuildStanding[] = guild.members && guild.battles && guild.week === week ? [standing(guild)] : [];
  let committed = 0;
  for (const row of ctx.db.guildRank.rankKey.filter(new Range(
    { tag: "included", value: prefix }, { tag: "excluded", value: `${prefix}~` },
  ))) {
    if (row.guildId === guild.id) continue;
    entries.push(JSON.parse(row.payload));
    if (++committed === GUILD_RANKING_LIMIT) break;
  }
  entries.sort((a, b) => b.score - a.score || b.wins - a.wins || a.battles - b.battles || (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  const cached = { id: 0, week, entries: JSON.stringify(entries.slice(0, GUILD_RANKING_LIMIT)) };
  if (ctx.db.guildStanding.id.find(0)) ctx.db.guildStanding.id.update(cached);
  else ctx.db.guildStanding.insert(cached);
}
function deleteReport(ctx: Ctx, reportKey: string) {
  // A report has at most six participant references; prune them with the report.
  for (const ref of ctx.db.guildReportParticipant.reportKey.filter(reportKey)) ctx.db.guildReportParticipant.key.delete(ref.key);
  ctx.db.guildBattleReport.key.delete(reportKey);
}
function anonymizeAccountReports(ctx: Ctx, identity: Identity) {
  // Follow only this account's indexed references, including old guilds and the
  // opponent's report copies. Never scan unrelated reports or guild histories.
  for (const ref of ctx.db.guildReportParticipant.identity.filter(identity)) {
    const row = ctx.db.guildBattleReport.key.find(ref.reportKey);
    if (row) {
      const report: GuildSnapshot["battles"][number] = JSON.parse(row.payload);
      const round = report.result.rounds[ref.round];
      if (round && (ref.side === "attacker" || ref.side === "defender")) {
        round[ref.side] = "Deleted player";
        ctx.db.guildBattleReport.key.update({ ...row, payload: JSON.stringify(report) });
      }
    }
    ctx.db.guildReportParticipant.key.delete(ref.key);
  }
}
function removeMember(ctx: Ctx, member: Member) {
  const guild = ctx.db.guild.id.find(member.guildId);
  ctx.db.guildMember.identity.delete(member.identity);
  const previous = account(ctx, member.identity);
  ctx.db.guildAccount.identity.update({ ...previous, joinAfter: now(ctx) + GUILD_MEMBERSHIP_COOLDOWN });
  if (!guild) return;
  if (guild.members <= 1) {
    ctx.db.guild.id.delete(guild.id);
    for (const row of ctx.db.guildBattleReport.guildId.filter(guild.id)) deleteReport(ctx, row.key);
    writeRanking(ctx, { ...guild, members: 0 });
    return;
  }
  const remaining = members(ctx, guild.id).sort((a, b) => a.joinedAt < b.joinedAt ? -1 : a.joinedAt > b.joinedAt ? 1 : key(a.identity).localeCompare(key(b.identity)));
  const updated = { ...currentGuild(ctx, guild), members: guild.members - 1,
    champions: guild.champions - Number(member.champion),
    leader: guild.leader.equals(member.identity) ? remaining[0].identity : guild.leader };
  ctx.db.guild.id.update(updated);
  writeRanking(ctx, updated);
}
function validateFighter(fighter: DuelFighter) {
  if (Object.values(fighter).some(value => !Number.isFinite(value) || value < 0) || fighter.maxHp <= 0 || fighter.attackRate < .05) fail("A champion's combat stats are unavailable.");
}
function fighterPower(fighter: DuelFighter) { return fighter.damage / fighter.attackRate + fighter.maxHp / 10 + fighter.armor + fighter.regen; }
function team(ctx: Ctx, guildId: bigint): GuildFighter[] {
  const saved = members(ctx, guildId).filter(member => member.champion)
    .sort((a, b) => key(a.identity).localeCompare(key(b.identity)));
  if (saved.length !== GUILD_TEAM_SIZE) fail("Both guilds need three saved champions.");
  if (saved.some(member => member.eligibleAt > now(ctx))) fail("A champion is not yet eligible for guild battles.");
  return saved.map(member => ({ identity: key(member.identity), name: member.name, fighter: JSON.parse(member.fighter) }));
}

/** Root wrappers authenticate the session/account before calling these methods.
 * All fighters come from authoritative persisted stats; snapshots are saved when
 * the leader chooses a lineup. No client fighter or result is accepted. */
export function createGuildService(deps: { fighterFor(ctx: Ctx, identity: Identity): { name: string; fighter: DuelFighter } }) {
  function insertMember(ctx: Ctx, guildId: bigint) {
    const { name } = deps.fighterFor(ctx, ctx.sender);
    ctx.db.guildMember.insert({ identity: ctx.sender, guildId, name, joinedAt: now(ctx),
      eligibleAt: now(ctx), champion: false, fighter: "", power: 0 });
  }
  return {
    create(ctx: Ctx, value: string) {
      assertCanJoin(ctx);
      let normalized: ReturnType<typeof normalizeGuildName>;
      try { normalized = normalizeGuildName(value); } catch (error) { return fail((error as Error).message); }
      if (ctx.db.guild.nameKey.find(normalized.nameKey)) fail("That guild name is already taken.");
      const guild = ctx.db.guild.insert({ id: 0n, directoryId: 0n, ...normalized, leader: ctx.sender, members: 1,
        champions: 0, week: guildWeek(now(ctx)), score: 0, wins: 0, battles: 0,
        attackDay: guildDay(now(ctx)), attacks: 0, opponents: "[]" });
      ctx.db.guild.id.update({ ...guild, directoryId: guild.id });
      insertMember(ctx, guild.id);
    },
    join(ctx: Ctx, guildId: bigint) {
      assertCanJoin(ctx);
      const guild = ctx.db.guild.id.find(guildId) ?? fail("Guild no longer exists.");
      if (guild.members >= GUILD_MEMBER_LIMIT) fail("This guild is full.");
      insertMember(ctx, guild.id);
      const updated = { ...currentGuild(ctx, guild), members: guild.members + 1 };
      ctx.db.guild.id.update(updated);
      writeRanking(ctx, updated);
    },
    leave(ctx: Ctx) { removeMember(ctx, requireMember(ctx)); },
    kick(ctx: Ctx, identity: Identity) {
      const guild = requireLeader(ctx);
      if (ctx.sender.equals(identity)) fail("Use Leave guild to leave or transfer leadership first.");
      const member = ctx.db.guildMember.identity.find(identity);
      if (!member || member.guildId !== guild.id) fail("That player is not in your guild.");
      removeMember(ctx, member);
    },
    transfer(ctx: Ctx, identity: Identity) {
      const guild = requireLeader(ctx);
      const member = ctx.db.guildMember.identity.find(identity);
      if (!member || member.guildId !== guild.id) fail("Choose a member of your guild.");
      ctx.db.guild.id.update({ ...guild, leader: identity });
    },
    setChampion(ctx: Ctx, identity: Identity, champion: boolean) {
      const guild = requireLeader(ctx);
      const member = ctx.db.guildMember.identity.find(identity);
      if (!member || member.guildId !== guild.id) fail("Choose a member of your guild.");
      if (champion === member.champion) return;
      if (champion && guild.champions >= GUILD_TEAM_SIZE) fail("Remove a champion before choosing another.");
      if (champion) {
        const snapshot = deps.fighterFor(ctx, identity);
        validateFighter(snapshot.fighter);
        ctx.db.guildMember.identity.update({ ...member, name: snapshot.name, champion: true,
          fighter: JSON.stringify(snapshot.fighter), power: fighterPower(snapshot.fighter) });
      } else ctx.db.guildMember.identity.update({ ...member, champion: false, fighter: "", power: 0 });
      ctx.db.guild.id.update({ ...guild, champions: guild.champions + (champion ? 1 : -1) });
    },
    refreshChampion(ctx: Ctx) {
      const member = requireMember(ctx);
      if (!member.champion) fail("Only a saved champion needs to refresh combat stats.");
      const snapshot = deps.fighterFor(ctx, ctx.sender);
      validateFighter(snapshot.fighter);
      ctx.db.guildMember.identity.update({ ...member, name: snapshot.name, fighter: JSON.stringify(snapshot.fighter), power: fighterPower(snapshot.fighter) });
    },
    saveTeam(ctx: Ctx, identities: Identity[]) {
      const guild = requireLeader(ctx);
      if (identities.length !== GUILD_TEAM_SIZE || new Set(identities.map(key)).size !== GUILD_TEAM_SIZE) fail("Choose three different guild members.");
      const roster = members(ctx, guild.id);
      const selection = new Set(identities.map(key));
      const selected = roster.filter(member => selection.has(key(member.identity)));
      if (selected.length !== GUILD_TEAM_SIZE) fail("All champions must belong to your guild.");
      const updated = selected.map(member => {
        const snapshot = deps.fighterFor(ctx, member.identity);
        const fighter = snapshot.fighter;
        validateFighter(fighter);
        return { ...member, name: snapshot.name, champion: true, fighter: JSON.stringify(fighter),
          power: fighterPower(fighter) };
      });
      for (const member of roster) if (member.champion && !selection.has(key(member.identity))) ctx.db.guildMember.identity.update({ ...member, champion: false, fighter: "", power: 0 });
      for (const member of updated) ctx.db.guildMember.identity.update(member);
      ctx.db.guild.id.update({ ...guild, champions: GUILD_TEAM_SIZE });
    },
    challenge(ctx: Ctx, opponentId: bigint) {
      const guild = currentGuild(ctx, requireLeader(ctx));
      if (guild.id === opponentId) fail("Challenge another guild.");
      const opponent = ctx.db.guild.id.find(opponentId) ?? fail("That guild no longer exists.");
      if (guild.attacks >= GUILD_DAILY_ATTACKS) fail("Your guild has used its three attacks today.");
      const opponents: string[] = JSON.parse(guild.opponents);
      if (opponents.includes(String(opponentId))) fail("You have already challenged this guild today.");
      const attacking = team(ctx, guild.id), defending = team(ctx, opponent.id);
      const actors = members(ctx, guild.id).filter(member => member.champion || member.identity.equals(ctx.sender));
      const participatingIdentities = new Map([...actors, ...members(ctx, opponent.id)]
        .map(member => [key(member.identity), member.identity]));
      const day = guildDay(now(ctx));
      for (const member of actors) {
        const participation = account(ctx, member.identity);
        if (participation.lastAttackDay === day && participation.attackGuild !== 0n && participation.attackGuild !== guild.id) fail("A champion has already attacked with another guild today.");
      }
      const result = resolveGuildBattle(attacking, defending);
      for (const member of actors) ctx.db.guildAccount.identity.update({ ...account(ctx, member.identity), lastAttackDay: day, attackGuild: guild.id });
      const updated = { ...guild, attacks: guild.attacks + 1, opponents: JSON.stringify([...opponents, String(opponentId)]),
        score: guild.score + (result.outcome === "VICTORY" ? 3 : result.outcome === "DRAW" ? 1 : 0),
        wins: guild.wins + Number(result.outcome === "VICTORY"), battles: guild.battles + 1 };
      ctx.db.guild.id.update(updated);
      writeRanking(ctx, updated);
      const previous = ctx.db.guildBattleCounter.id.find(0);
      const sequence = (previous?.next ?? 0n) + 1n;
      if (previous) ctx.db.guildBattleCounter.id.update({ id: 0, next: sequence });
      else ctx.db.guildBattleCounter.insert({ id: 0, next: sequence });
      const report: GuildSnapshot["battles"][number] = { id: String(sequence), attackerId: String(guild.id),
        defenderId: String(opponent.id), attacker: guild.name, defender: opponent.name, at: String(now(ctx)), result };
      for (const guildId of [guild.id, opponent.id]) {
        const history = [...ctx.db.guildBattleReport.guildId.filter(guildId)].sort((a, b) => a.sequence < b.sequence ? -1 : 1);
        // Global sequence modulo ten would evict unfairly when unrelated guilds fight.
        if (history.length >= 10) deleteReport(ctx, history[0].key);
        const reportKey = `${guildId}:${sequence}`;
        ctx.db.guildBattleReport.insert({ key: reportKey, guildId, sequence, payload: JSON.stringify(report) });
        for (const [side, lineup] of [["attacker", attacking], ["defender", defending]] as const) {
          lineup.forEach((champion, round) => ctx.db.guildReportParticipant.insert({
            key: `${reportKey}:${side}:${round}`, reportKey, side, round,
            identity: participatingIdentities.get(champion.identity)!,
          }));
        }
      }
    },
    snapshot(ctx: Ctx, afterId = 0n, signedIn = true): GuildSnapshot {
      const member = signedIn ? ctx.db.guildMember.identity.find(ctx.sender) : null;
      const stored = member ? ctx.db.guild.id.find(member.guildId) : null;
      const guild = stored ? currentGuild(ctx, stored) : null;
      const week = guildWeek(now(ctx));
      const cache = ctx.db.guildStanding.id.find(0);
      const directory: GuildSnapshot["directory"] = [];
      const challengedToday = new Set<string>(guild ? JSON.parse(guild.opponents) : []);
      let nextPage: string | null = null;
      for (const row of ctx.db.guild.directoryId.filter(new Range({ tag: "excluded", value: afterId }))) {
        if (directory.length === 20) { nextPage = directory[19].id; break; }
        directory.push({ id: String(row.id), name: row.name, members: row.members, champions: row.champions,
          challengedToday: challengedToday.has(String(row.id)) });
      }
      return { identity: key(ctx.sender), serverNow: String(now(ctx)), week,
        nextWeekAt: String(BigInt((week + 1) * 7 - 3) * GUILD_MEMBERSHIP_COOLDOWN),
        joinAfter: String(ctx.db.guildAccount.identity.find(ctx.sender)?.joinAfter ?? 0n), signedIn,
        guild: guild ? { id: String(guild.id), name: guild.name, leader: key(guild.leader),
          attacksRemaining: GUILD_DAILY_ATTACKS - guild.attacks, score: guild.score,
          members: members(ctx, guild.id).map(row => ({ identity: key(row.identity), name: row.name,
            champion: row.champion, eligibleAt: String(row.eligibleAt), power: row.power })) } : null,
        directory, nextPage, standings: cache?.week === week ? JSON.parse(cache.entries) : [],
        battles: guild ? [...ctx.db.guildBattleReport.guildId.filter(guild.id)]
          .sort((a, b) => a.sequence > b.sequence ? -1 : 1).map(row => JSON.parse(row.payload)) : [] };
    },
    removeAccount(ctx: Ctx, identity: Identity) {
      anonymizeAccountReports(ctx, identity);
      const member = ctx.db.guildMember.identity.find(identity);
      if (member) removeMember(ctx, member);
      ctx.db.guildAccount.identity.delete(identity);
    },
    resetAccount(ctx: Ctx, identity: Identity) {
      // Reset preserves membership and hop history but removes the saved build.
      const member = ctx.db.guildMember.identity.find(identity);
      if (!member?.champion) return;
      ctx.db.guildMember.identity.update({ ...member, champion: false, fighter: "", power: 0 });
      const guild = ctx.db.guild.id.find(member.guildId);
      if (guild) ctx.db.guild.id.update({ ...guild, champions: guild.champions - 1 });
    },
  };
}
