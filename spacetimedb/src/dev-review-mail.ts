import { table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type { ModuleReducerCtx, ModuleViewCtx } from "./index";

/**
 * Personal letters: one player, one letter. The mailbox's shared letters go to
 * everyone who joined before them, so a reply to one reporter needs its own
 * row. Private; the owner reads it only through my_mailbox_v2, which already
 * filters to the caller. The key is the letter id, so a second write for the
 * same report is a no-op, however often the decision is changed or retried.
 */
export const playerMail = table({ name: "player_mail", public: false }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  title: t.string(),
  body: t.string(),
  createdAt: t.timestamp(),
  read: t.bool(),
});

type Ctx = Pick<ModuleReducerCtx, "db" | "timestamp">;

/** Sends one personal letter unless that id was already sent. True only when a letter was written. */
export function sendPersonalMail(ctx: Ctx, letter: { key: string; identity: Identity; title: string; body: string }) {
  if (ctx.db.playerMail.key.find(letter.key)) return false;
  ctx.db.playerMail.insert({ ...letter, createdAt: ctx.timestamp, read: false });
  return true;
}

/** The caller's personal letters, shaped like the shared ones for the mailbox view. */
export function personalMailFor(ctx: ModuleViewCtx) {
  return [...ctx.db.playerMail.identity.filter(ctx.sender)].map(row => ({
    id: row.key, title: row.title, body: row.body, gems: 0n, createdAt: row.createdAt, read: row.read, claimed: false,
  }));
}

/** Marks the caller's own personal letter read. False when the id is not one of theirs. */
export function readPersonalMail(ctx: Pick<ModuleReducerCtx, "db" | "sender">, id: string) {
  const row = ctx.db.playerMail.key.find(id);
  if (!row || row.identity.toHexString() !== ctx.sender.toHexString()) return false;
  if (!row.read) ctx.db.playerMail.key.update({ ...row, read: true });
  return true;
}

export function mergePersonalMail(ctx: Pick<ModuleReducerCtx, "db">, guest: Identity, account: Identity) {
  for (const row of [...ctx.db.playerMail.identity.filter(guest)]) ctx.db.playerMail.key.update({ ...row, identity: account });
}

export function removePersonalMail(ctx: Pick<ModuleReducerCtx, "db">, identity: Identity) {
  for (const row of [...ctx.db.playerMail.identity.filter(identity)]) ctx.db.playerMail.key.delete(row.key);
}
