/** A searchable player: the server's directory row with its name folded once for matching. */
export type PlayerDirectoryEntry = { identity: string; name: string; key: string };

export const PLAYER_SEARCH_RESULTS = 8;

export function foldPlayerName(value: string) { return value.normalize("NFKC").trim().toLowerCase(); }

/** Reads the server's `[identityHex, displayName][]`, dropping anything malformed. */
export function parsePlayerDirectory(json: string): PlayerDirectoryEntry[] {
  try {
    const rows = JSON.parse(json);
    if (!Array.isArray(rows)) return [];
    return rows.filter(row => Array.isArray(row) && typeof row[0] === "string" && typeof row[1] === "string" && row[1].trim())
      .map(([identity, name]: [string, string]) => ({ identity, name, key: foldPlayerName(name) }));
  } catch { return []; }
}

/**
 * The best matches for what has been typed: the exact name, then names that
 * start with it, then a later word that starts with it ("badger" finds
 * "Lucky Badger 455"), then anywhere in the name. Within each, the
 * directory's alphabetical order holds.
 */
export function searchPlayerDirectory(players: readonly PlayerDirectoryEntry[], query: string, options: { limit?: number; exclude?: string } = {}) {
  const needle = foldPlayerName(query);
  if (!needle) return [];
  const limit = options.limit ?? PLAYER_SEARCH_RESULTS;
  const tiers: PlayerDirectoryEntry[][] = [[], [], [], []];
  for (const player of players) {
    if (player.identity === options.exclude) continue;
    const at = player.key.indexOf(needle);
    if (at < 0) continue;
    const tier = player.key === needle ? 0 : at === 0 ? 1 : player.key.split(/\s+/).some(word => word.startsWith(needle)) ? 2 : 3;
    // The first tiers fill the list, so a common letter never walks the whole directory twice.
    if (tiers[tier].length < limit) tiers[tier].push(player);
  }
  return tiers.flat().slice(0, limit);
}
