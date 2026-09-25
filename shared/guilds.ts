import { simulateDuelBattle } from "./duel-combat";
import { simulateGuildBattle, type GuildBattleResult } from "./guild-combat";
export type { GuildFighter } from "./guild-combat";

export const GUILD_EMBLEMS = ["wolf", "fox", "bear", "owl", "dragon", "lion", "raven", "stag", "swords", "fire", "serpent", "moon", "sun", "tree", "crystal", "leopard"] as const;
export const GUILD_MEMBER_LIMIT = 20;
export const GUILD_CREATION_MIN_POWER = 1_000_000_000;
export const GUILD_DAILY_ATTACKS = 3;
export const GUILD_DAY_MICROS = 86_400_000_000n;
export const GUILD_RANKING_LIMIT = 50;
export const guildDay = (now: bigint) => Number(now / GUILD_DAY_MICROS);
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
export type GuildStanding = { id: string; name: string; emblem?: number; members: number; score: number; wins: number; battles: number };
export type GuildPreview = Pick<NonNullable<GuildSnapshot['guild']>, 'id' | 'name' | 'emblem' | 'leader' | 'vicePresident' | 'score' | 'members'>;
export type GuildSnapshot = {
  identity: string; serverNow: string; week: number; nextWeekAt: string; joinAfter: string; signedIn: boolean;
  guild: null | { id: string; name: string; emblem?: number; leader: string; vicePresident?: string | null; attacksRemaining: number; score: number; totalPower?: number;
    members: { identity: string; name: string; profileIcon?: number; power?: number; online?: boolean; lastSeenAtMs?: number; eligibleAt: string }[] };
  directory: { id: string; name: string; emblem?: number; members: number; totalPower?: number; challengedToday: boolean }[]; nextPage: string | null;
  standings: GuildStanding[];
  battles: GuildReport[];
};
