import { type DuelFighter, simulateDuelBattle } from "./duel-combat";

export const GUILD_MEMBER_LIMIT = 20;
export const GUILD_TEAM_SIZE = 3;
export const GUILD_DAILY_ATTACKS = 3;
export const GUILD_MEMBERSHIP_COOLDOWN = 86_400_000_000n;
export const GUILD_RANKING_LIMIT = 50;
export const guildDay = (now: bigint) => Number(now / 86_400_000_000n);
// Monday UTC, rather than the Unix epoch's Thursday.
export const guildWeek = (now: bigint) => Math.floor((guildDay(now) + 3) / 7);
export function normalizeGuildName(value: string) {
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .'-]{2,23}$/u.test(name)) throw new Error("Use 3–24 letters, numbers, spaces, apostrophes, periods or hyphens.");
  return { name, nameKey: name.toLowerCase() };
}
export type GuildFighter = { identity: string; name: string; fighter: DuelFighter };
export function resolveGuildBattle(attackers: GuildFighter[], defenders: GuildFighter[]) {
  if (attackers.length !== GUILD_TEAM_SIZE || defenders.length !== GUILD_TEAM_SIZE) throw new Error("Both guilds need three saved champions.");
  const rounds = attackers.map((attacker, index) => ({ attacker: attacker.name, defender: defenders[index].name,
    ...simulateDuelBattle(attacker.fighter, defenders[index].fighter) }));
  const wins = rounds.filter(round => round.outcome === "CHALLENGER_WIN").length;
  const losses = rounds.filter(round => round.outcome === "OPPONENT_WIN").length;
  return { rounds, wins, losses, outcome: wins > losses ? "VICTORY" : wins < losses ? "DEFEAT" : "DRAW" };
}
export type GuildStanding = { id: string; name: string; members: number; score: number; wins: number; battles: number };
export type GuildSnapshot = {
  identity: string; serverNow: string; week: number; nextWeekAt: string; joinAfter: string; signedIn: boolean;
  guild: null | { id: string; name: string; leader: string; attacksRemaining: number; score: number;
    members: { identity: string; name: string; champion: boolean; eligibleAt: string; power: number }[] };
  directory: { id: string; name: string; members: number; champions: number; challengedToday: boolean }[]; nextPage: string | null;
  standings: GuildStanding[];
  battles: { id: string; attackerId: string; defenderId: string; attacker: string; defender: string; at: string; result: ReturnType<typeof resolveGuildBattle> }[];
};
