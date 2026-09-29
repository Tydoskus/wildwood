import { SenderError } from "spacetimedb/server";
import { Identity } from "spacetimedb";
import { ERASURE_TARGETS, type ErasureTarget } from "./account-erasure";
import { recordModerationAction } from "./moderation-history";

/**
 * Swapping two characters between logins.
 *
 * SpacetimeAuth can end up with two users for one email address, and each
 * login is its own identity with its own character: Vis's magic link began
 * opening a new, empty character while their real one sat on the old login.
 * Swapping puts each character on the other login, so the player finds their
 * character where their sign-in now lands. Nothing is deleted, and running the
 * swap again puts both back.
 *
 * It walks the list account erasure uses (every table with an identity column),
 * so nothing a character owns is left behind. Keys that embed the identity's
 * hex (`<hex>:<item>` and similar) are rewritten, since the game computes them
 * from the identity. Tables about the login rather than the character stay
 * put, and identities kept as text, like moderation history, are not touched.
 *
 * One reducer call, one transaction: it swaps everything or nothing.
 */

/** About the sign-in, not the character: the login keeps these. */
const LOGIN_TABLES = new Set(["accountEmail"]);

// The erasure list is generated from the published schema, which names
// columns and keys in snake_case; server rows and index accessors use camelCase.
const camel = (name: string) => name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

const sameIdentity = (value: any, identity: any) =>
  Boolean(value) && (value.isEqual ? value.isEqual(identity) : value === identity);

const bareHex = (identity: any) => identity.toHexString().replace(/^0x/i, "").toLowerCase();

/**
 * A DM thread is keyed `dm:<hex>:<hex>` with the two identities sorted
 * (social-service.ts dmKey), so a changed identity can change the order.
 */
function rekeyConversation(value: string, fromHex: string, toHex: string) {
  if (!value.startsWith("dm:") || !value.toLowerCase().includes(fromHex)) return value;
  return `dm:${value.slice(3).split(":").map(part => part.toLowerCase() === fromHex ? toHex : part).sort().join(":")}`;
}

/** Holds one side mid-swap. No real login can hash to it. */
export const SWAP_PARKING_IDENTITY = new Identity("00".repeat(31) + "01");

function rowsOwnedBy(ctx: any, target: ErasureTarget, columns: readonly string[], identity: any) {
  const handle = ctx.db[target.table];
  const index = target.index ? handle[camel(target.index)] : null;
  // An index covers one column. A table with two (friend and owner, sender
  // and recipient) is scanned, or the rows naming this player second stay behind.
  const candidates = target.mode === "key" && target.pk
    ? [handle[camel(target.pk)]?.find(identity)].filter(Boolean)
    : target.mode === "index" && index && columns.length === 1 ? [...index.filter(identity)] : [...handle.iter()];
  // Snapshot before writing: changing a table while iterating it skips rows.
  return candidates.filter((row: any) => columns.some(column => sameIdentity(row[column], identity)));
}

/** Moves every character row `from` owns to `to`, which must own none. Returns rows moved by table. */
export function moveIdentityRows(ctx: any, from: any, to: any) {
  const fromHex = bareHex(from), toHex = bareHex(to);
  const moved: Record<string, number> = {};
  for (const target of ERASURE_TARGETS) {
    const handle = ctx.db[target.table];
    if (!handle || !target.pk || LOGIN_TABLES.has(target.table)) continue;
    const pk = camel(target.pk);
    const columns = target.columns.map(camel);
    for (const row of rowsOwnedBy(ctx, target, columns, from)) {
      const next = { ...row };
      for (const column of columns) if (sameIdentity(row[column], from)) next[column] = to;
      if (typeof row[pk] === "string" && row[pk].toLowerCase().includes(fromHex)) {
        next[pk] = row[pk].replace(new RegExp(fromHex, "gi"), toHex);
      }
      if (typeof row.conversation === "string") next.conversation = rekeyConversation(row.conversation, fromHex, toHex);
      const keyChanged = row[pk]?.isEqual ? !row[pk].isEqual(next[pk]) : row[pk] !== next[pk];
      if (keyChanged) {
        handle[pk].delete(row[pk]);
        handle.insert(next);
      } else {
        handle[pk].update(next);
      }
      moved[target.table] = (moved[target.table] ?? 0) + 1;
    }
  }
  return moved;
}

export const SWAP_CONFIRMATION = "SWAP";

/**
 * Owner-only, after the caller has checked it. The expected names guard
 * against a pasted identity that is not the character the owner looked at.
 */
export function swapCharacters(ctx: any, args: {
  first: any; second: any; expectedFirstName: string; expectedSecondName: string; confirmation: string;
}) {
  const { first, second } = args;
  if (args.confirmation !== SWAP_CONFIRMATION) throw new SenderError(`Confirm the swap by sending ${SWAP_CONFIRMATION}.`);
  if (sameIdentity(first, second)) throw new SenderError("Choose two different accounts.");
  if (ctx.db.playerProfile.identity.find(first)?.displayName !== args.expectedFirstName) {
    throw new SenderError("The first account's name does not match; swap refused.");
  }
  if (ctx.db.playerProfile.identity.find(second)?.displayName !== args.expectedSecondName) {
    throw new SenderError("The second account's name does not match; swap refused.");
  }
  for (const identity of [first, second]) {
    if (ctx.db.playerAccountStatus.identity.find(identity)?.isGuest) throw new SenderError("Both must be signed-in accounts, not guests.");
    if ([...ctx.db.playerSession.byIdentity.filter(identity)].length) {
      throw new SenderError("Both accounts must be signed out before a swap.");
    }
  }
  const parked = moveIdentityRows(ctx, first, SWAP_PARKING_IDENTITY);
  const toFirst = moveIdentityRows(ctx, second, first);
  const toSecond = moveIdentityRows(ctx, SWAP_PARKING_IDENTITY, second);
  return { firstToSecond: toSecond, secondToFirst: toFirst, parked: Object.values(parked).reduce((a, b) => a + b, 0) };
}

/**
 * The owner command behind dev_swap_characters, after the caller checked the
 * sender. Identities arrive as hex text, so `spacetime call` needs no identity
 * encoding. Both logins get a moderation line saying whose character moved in.
 */
export function swapCharacterLogins(ctx: any, args: {
  firstIdentity: string; secondIdentity: string; expectedFirstName: string; expectedSecondName: string;
  reason: string; confirmation: string;
}) {
  const parse = (hex: string) => {
    const bare = hex.trim().replace(/^0x/i, "");
    if (!/^[0-9a-f]{64}$/i.test(bare)) throw new SenderError("Identities are 64 hex characters.");
    return new Identity(bare.toLowerCase());
  };
  const reason = args.reason.trim();
  if (!reason || reason.length > 500) throw new SenderError("Give a reason of at most 500 characters.");
  const first = parse(args.firstIdentity), second = parse(args.secondIdentity);
  const result = swapCharacters(ctx, { first, second, expectedFirstName: args.expectedFirstName,
    expectedSecondName: args.expectedSecondName, confirmation: args.confirmation });
  for (const [login, name, from] of [[second, args.expectedFirstName, first], [first, args.expectedSecondName, second]] as const) {
    recordModerationAction(ctx, { targetIdentity: login.toHexString(), targetName: name,
      channel: "account", action: "Character moved to this login", reason, actorType: "owner", rule: "owner-character-swap",
      before: JSON.stringify({ login: from.toHexString() }), after: JSON.stringify({ login: login.toHexString() }) });
  }
  console.log(`dev_swap_characters ${first.toHexString()} <-> ${second.toHexString()}: ${JSON.stringify(result)}`);
  return result;
}
