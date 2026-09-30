import { SenderError, table, t } from "spacetimedb/server";
import { Identity } from "spacetimedb";
import { ERASURE_TARGETS, type ErasureTarget } from "./account-erasure";
import { hasSpacetimeAuthAccount } from "./account-lifecycle";
import { activeDuelFor } from "./duel-runtime";
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

/**
 * About the sign-in, not the character: the login keeps these. A session is a
 * live connection, so it stays with the login that opened it.
 */
const LOGIN_TABLES = new Set(["accountEmail", "playerSession", "loginMove"]);

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
  // A unique index has find, not filter: live, that crashed the first swap.
  const byIndex = (): any[] | null => {
    if (target.mode !== "index" || !index || columns.length !== 1) return null;
    if (typeof index.filter === "function") return [...index.filter(identity)];
    if (typeof index.find === "function") return [index.find(identity)].filter(Boolean);
    return null;
  };
  const candidates = target.mode === "key" && target.pk
    ? [handle[camel(target.pk)]?.find(identity)].filter(Boolean)
    : byIndex() ?? [...handle.iter()];
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
    const rows = rowsOwnedBy(ctx, target, columns, from);
    // Refuse rather than half-move: the transaction then changes nothing.
    if (rows.length && typeof handle[pk]?.delete !== "function") {
      throw new SenderError(`Cannot move ${target.table}: no ${pk} key to write through. Nothing was changed.`);
    }
    for (const row of rows) {
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
  return swapIdentityRows(ctx, first, second);
}

function swapIdentityRows(ctx: any, first: any, second: any) {
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

/**
 * A player moving their own character to another sign-in, from Settings.
 *
 * The usual case is an email-link account moving to Google. Each SpacetimeAuth
 * user is its own identity, so the player proves both: signed in on the old
 * login they leave a one-time code, then they sign in again (choosing Google)
 * and claim it before entering the world. The claim swaps the two characters,
 * so the new login's empty one lands on the old login and nothing is deleted.
 *
 * The code lives only in the tab that began the move and expires in 15 minutes.
 */
export const loginMove = table({ name: "login_move", public: false }, {
  code: t.string().primaryKey(),
  source: t.identity(),
  createdAt: t.timestamp(),
});

export const LOGIN_MOVE_LIFETIME_MICROS = 900_000_000n;

function clearExpiredLoginMoves(ctx: any) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const expired = [...ctx.db.loginMove.iter() as Iterable<any>]
    .filter(move => now - move.createdAt.microsSinceUnixEpoch >= LOGIN_MOVE_LIFETIME_MICROS);
  for (const move of expired) ctx.db.loginMove.code.delete(move.code);
}

export function beginLoginMove(ctx: any, code: string) {
  if (!hasSpacetimeAuthAccount(ctx)) throw new SenderError("Sign in to your character first.");
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(code)) throw new SenderError("Invalid move code.");
  clearExpiredLoginMoves(ctx);
  // One move at a time: starting again replaces the last one.
  const earlier = [...ctx.db.loginMove.iter() as Iterable<any>].filter(move => sameIdentity(move.source, ctx.sender));
  for (const move of earlier) ctx.db.loginMove.code.delete(move.code);
  ctx.db.loginMove.insert({ code, source: ctx.sender, createdAt: ctx.timestamp });
}

function inWorld(ctx: any, identity: any) {
  return Boolean(ctx.db.player.identity.find(identity) || ctx.db.playerController.identity.find(identity)
    || [...ctx.db.playerSession.byIdentity.filter(identity) as Iterable<any>].some(session => session.enteredWorld));
}

/** Swaps the caller's character with the one that began `code`. Returns the moved character's name. */
export function claimLoginMove(ctx: any, code: string) {
  if (!hasSpacetimeAuthAccount(ctx)) throw new SenderError("Sign in required.");
  clearExpiredLoginMoves(ctx);
  const move = ctx.db.loginMove.code.find(code);
  if (!move) throw new SenderError("The move expired. Sign in with your old login and start it again.");
  const from = move.source, to = ctx.sender;
  if (sameIdentity(from, to)) {
    throw new SenderError("You signed in with the same login. Start the move again and choose Google on the sign-in page.");
  }
  // World presence and its controller would move with the character while a
  // connection on the other login drives them, so neither login may be in the
  // world. A tab that is connected but never entered is harmless: its session
  // stays with its login. This connection has not entered: the client claims
  // before world entry.
  if (inWorld(ctx, from)) {
    throw new SenderError("Your old login is still open on another device or tab. Close WildStat there, then reload.");
  }
  if (inWorld(ctx, to)) throw new SenderError("This login is open on another device or tab. Close WildStat there, then reload.");
  if (ctx.db.analyticsPlayer.identity.find(to)?.firstKillDayKey) {
    const name = ctx.db.playerProfile.identity.find(to)?.displayName ?? "a character";
    throw new SenderError(`This login already has a character (${name}). Use a Google account that has not played WildStat.`);
  }
  const name = ctx.db.playerProfile.identity.find(from)?.displayName;
  if (!name) throw new SenderError("The old login has no character to move.");
  if (activeDuelFor(ctx, from) || activeDuelFor(ctx, to)) throw new SenderError("Finish your duel before moving.");

  ctx.db.loginMove.code.delete(code);
  const result = swapIdentityRows(ctx, from, to);
  for (const [login, previous, moved] of [[to, from, name], [from, to, "the new login's empty character"]] as const) {
    recordModerationAction(ctx, { targetIdentity: login.toHexString(), targetName: moved,
      channel: "account", action: "Character moved to this login", reason: "The player moved their character to another sign-in from Settings.",
      actorType: "automatic", rule: "player-login-move",
      before: JSON.stringify({ login: previous.toHexString() }), after: JSON.stringify({ login: login.toHexString() }) });
  }
  console.log(`claim_login_move ${from.toHexString()} -> ${to.toHexString()} (${name}): ${JSON.stringify(result)}`);
  return name;
}
