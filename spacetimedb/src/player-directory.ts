/**
 * Every recently active player's name, for the player search on the
 * leaderboard and in private chat. The client loads it once and filters it on
 * each key press, so typing costs the server nothing.
 *
 * The list is built at most once every ten minutes and the same string is
 * handed to every caller, so the scan does not grow with how many players
 * search. A name change or a new player shows up at the next rebuild.
 */
export const PLAYER_DIRECTORY_REFRESH_MICROS = 10n * 60n * 1_000_000n;
/** Players not seen for this long drop out of search, so the list stays small. */
export const PLAYER_DIRECTORY_ACTIVE_MICROS = 30n * 86_400_000_000n;
/** Hard ceiling on the list, the most recently seen kept. */
export const PLAYER_DIRECTORY_LIMIT = 5_000;

type Ctx = { db: any; timestamp: { microsSinceUnixEpoch: bigint } };

// One module instance serves one database, so the built list is shared by every caller.
let cached: { builtAt: bigint; json: string } | null = null;

/** Exported for tests: a test process builds many fixtures behind the same module. */
export function forgetPlayerDirectory() { cached = null; }

/** The directory as JSON: `[identityHex, displayName][]`, sorted by name. */
export function playerDirectoryJson(ctx: Ctx, isVirtual: (ctx: Ctx, identity: any) => boolean) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (cached && now >= cached.builtAt && now - cached.builtAt < PLAYER_DIRECTORY_REFRESH_MICROS) return cached.json;
  const since = now - PLAYER_DIRECTORY_ACTIVE_MICROS;
  const rows: { seen: bigint; identity: string; name: string }[] = [];
  for (const lifetime of ctx.db.playerLifetime.iter() as Iterable<any>) {
    const seen: bigint = lifetime.sessionStartedAt.microsSinceUnixEpoch;
    if (seen < since || isVirtual(ctx, lifetime.identity)) continue;
    const name = ctx.db.playerProfile.identity.find(lifetime.identity)?.displayName;
    if (name) rows.push({ seen, identity: lifetime.identity.toHexString(), name });
  }
  const kept = rows.length > PLAYER_DIRECTORY_LIMIT
    ? rows.sort((a, b) => (a.seen > b.seen ? -1 : a.seen < b.seen ? 1 : 0)).slice(0, PLAYER_DIRECTORY_LIMIT)
    : rows;
  kept.sort((a, b) => a.name.localeCompare(b.name));
  const json = JSON.stringify(kept.map(row => [row.identity, row.name]));
  cached = { builtAt: now, json };
  return json;
}
