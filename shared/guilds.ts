import { simulateDuelBattle } from "./duel-combat";
import { simulateGuildBattle, type GuildBattleResult } from "./guild-combat";
export type { GuildFighter } from "./guild-combat";

export const GUILD_MEMBER_LIMIT = 20;
export const GUILD_DAILY_ATTACKS = 3;
export const GUILD_MEMBERSHIP_COOLDOWN = 86_400_000_000n;
export const GUILD_RANKING_LIMIT = 50;
export const guildDay = (now: bigint) => Number(now / 86_400_000_000n);
// Monday UTC, rather than the Unix epoch's Thursday.
export const guildWeek = (now: bigint) => Math.floor((guildDay(now) + 3) / 7);
export function normalizeGuildName(value: string) {
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z]{4}$/.test(name)) throw new Error("Use exactly 4 letters (A–Z).");
  return { name, nameKey: name.toLowerCase() };
}
export const resolveGuildBattle = simulateGuildBattle;
/** Retained reports from before whole-guild combat remain readable. */
export type LegacyGuildBattleResult = { version?: undefined; rounds: (ReturnType<typeof simulateDuelBattle> & { attacker: string; defender: string })[]; wins: number; losses: number; outcome: string };
export type GuildReport = { id: string; attackerId: string; defenderId: string; attacker: string; defender: string; at: string; result: GuildBattleResult | LegacyGuildBattleResult };
export type GuildStanding = { id: string; name: string; members: number; score: number; wins: number; battles: number };
export type GuildSnapshot = {
  identity: string; serverNow: string; week: number; nextWeekAt: string; joinAfter: string; signedIn: boolean;
  guild: null | { id: string; name: string; leader: string; attacksRemaining: number; score: number;
    members: { identity: string; name: string; eligibleAt: string }[] };
  directory: { id: string; name: string; members: number; challengedToday: boolean }[]; nextPage: string | null;
  standings: GuildStanding[];
  battles: GuildReport[];
};
