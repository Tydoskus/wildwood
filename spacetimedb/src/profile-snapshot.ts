import { SenderError, table, t } from "spacetimedb/server";
import {
  PROFILE_ICON_SNAPSHOT, encodeProfileIcon, isSnapshotProfileIcon, profileIconBackground,
} from "../../shared/profile-icons";
import type { ProfileSnapshotLook } from "../../shared/profile-snapshot";

/**
 * "Snapshot my character as my profile picture."
 *
 * The row is the character's look at the moment it was taken: skin tone and
 * the five drawn slots, cosmetics already resolved over the gear. It is frozen
 * until the player snapshots again; changing gear afterwards does not move it.
 *
 * It holds the look, never an image. The server copies it from its own
 * progress and profile rows, so a modified client cannot put a picture of its
 * choosing in front of other players; every client draws it with the same
 * character renderer the game uses everywhere else.
 *
 * Public, without a visibility filter (a filter change forces every client to
 * reload), and its own table so no column moved on a table clients already
 * read. A row is about a hundred bytes. Clients do not subscribe to the whole
 * table: they fetch the rows of the players whose pictures they are showing,
 * in small batches, the way chat portraits fetch profile rows.
 */
export const playerProfileSnapshot = table({ name: "player_profile_snapshot", public: true }, {
  identity: t.identity().primaryKey(),
  skinTone: t.u8(),
  headItem: t.string(),
  chestItem: t.string(),
  feetItem: t.string(),
  rightHandItem: t.string(),
  leftHandItem: t.string(),
  takenAt: t.timestamp(),
});

/** One snapshot per player per this long. */
export const PROFILE_SNAPSHOT_COOLDOWN_MICROS = 30_000_000n;


type Ctx = { db: any; sender: any; timestamp: { microsSinceUnixEpoch: bigint } };

/**
 * Saves the caller's current look and makes it their picture, on the backdrop
 * they already had. `look` comes from the server's own rows (index.ts reads it
 * as it does for the leaderboard's characters), and the reducer takes no
 * arguments, so nothing the client sends reaches the row.
 */
export function takeProfileSnapshot(ctx: Ctx, deps: {
  look: ProfileSnapshotLook | null | undefined;
  profile: { profileIcon: number } | null | undefined;
  saveIcon: (profileIcon: number) => void;
}) {
  if (!deps.profile || !deps.look) throw new SenderError("Player profile not found.");
  const previous = ctx.db.playerProfileSnapshot.identity.find(ctx.sender);
  if (previous) {
    const wait = previous.takenAt.microsSinceUnixEpoch + PROFILE_SNAPSHOT_COOLDOWN_MICROS - ctx.timestamp.microsSinceUnixEpoch;
    if (wait > 0n) {
      const seconds = Number((wait + 999_999n) / 1_000_000n);
      throw new SenderError(`You can snapshot your character again in ${seconds} second${seconds === 1 ? "" : "s"}.`);
    }
  }
  const row = {
    identity: ctx.sender,
    skinTone: Math.max(0, Math.min(255, Math.floor(Number(deps.look.skinTone) || 0))),
    headItem: deps.look.headItem ?? "", chestItem: deps.look.chestItem ?? "", feetItem: deps.look.feetItem ?? "",
    rightHandItem: deps.look.rightHandItem ?? "", leftHandItem: deps.look.leftHandItem ?? "",
    takenAt: ctx.timestamp,
  };
  if (previous) ctx.db.playerProfileSnapshot.identity.update(row);
  else ctx.db.playerProfileSnapshot.insert(row);
  deps.saveIcon(encodeProfileIcon(PROFILE_ICON_SNAPSHOT, profileIconBackground(deps.profile.profileIcon)));
}

/** Choosing the snapshot picture again ("Use Snapshot") needs a snapshot to show. */
export function requireSnapshotForIcon(ctx: { db: any; sender: any }, profileIcon: number) {
  if (isSnapshotProfileIcon(profileIcon) && !ctx.db.playerProfileSnapshot.identity.find(ctx.sender)) {
    throw new SenderError("Snapshot your character first.");
  }
}

/**
 * A guest signing in to an account. The newer snapshot is kept on the
 * account, so whichever picture the account ends up with has its character;
 * the guest row never survives.
 */
export function mergeProfileSnapshot(ctx: { db: any }, guest: any, account: any) {
  const guestRow = ctx.db.playerProfileSnapshot.identity.find(guest);
  if (!guestRow) return;
  const accountRow = ctx.db.playerProfileSnapshot.identity.find(account);
  ctx.db.playerProfileSnapshot.identity.delete(guest);
  if (!accountRow) ctx.db.playerProfileSnapshot.insert({ ...guestRow, identity: account });
  else if (guestRow.takenAt.microsSinceUnixEpoch > accountRow.takenAt.microsSinceUnixEpoch) {
    ctx.db.playerProfileSnapshot.identity.update({ ...guestRow, identity: account });
  }
}

export function removeProfileSnapshot(ctx: { db: any }, identity: any) {
  if (ctx.db.playerProfileSnapshot.identity.find(identity)) ctx.db.playerProfileSnapshot.identity.delete(identity);
}
