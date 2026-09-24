import { SenderError, table, t } from "spacetimedb/server";

/**
 * The account's music and sound-effect volumes.
 *
 * They used to live only in the browser's localStorage, so a player lost them
 * on every new device, between the phone app and the browser, between the two
 * site origins, and whenever Safari cleared storage. This is the account's copy.
 *
 * Its own private table rather than columns on an existing row: adding a
 * column to a table every session reads forces every player to reload on
 * publish. A missing row means the client keeps whatever it has locally and
 * uploads it once, so existing accounts needed no migration.
 */
export const playerAudioSetting = table({ name: "player_audio_setting", public: false }, {
  identity: t.identity().primaryKey(),
  musicVolume: t.f32(),
  sfxVolume: t.f32(),
  updatedAt: t.timestamp(),
});

function requireVolume(value: number, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new SenderError(`${label} volume must be between 0 and 1.`);
  }
  return value;
}

/** Writes only when a value actually changed, so a repeat send costs no update. */
export function writeAudioSettings(
  ctx: { db: any; sender: any; timestamp: any },
  { musicVolume, sfxVolume }: { musicVolume: number; sfxVolume: number },
) {
  const music = requireVolume(musicVolume, "Music");
  const sfx = requireVolume(sfxVolume, "Sound effect");
  const previous = ctx.db.playerAudioSetting.identity.find(ctx.sender);
  if (previous && previous.musicVolume === music && previous.sfxVolume === sfx) return;
  const row = { identity: ctx.sender, musicVolume: music, sfxVolume: sfx, updatedAt: ctx.timestamp };
  if (previous) ctx.db.playerAudioSetting.identity.update(row);
  else ctx.db.playerAudioSetting.insert(row);
}

/**
 * A guest signing in to an account. The account's own setting wins, because
 * it is what the player chose on their other devices; a guest's setting moves
 * across only when the account has none yet. The guest row never survives.
 */
export function mergeAudioSettings(ctx: { db: any }, guest: any, account: any) {
  const guestRow = ctx.db.playerAudioSetting.identity.find(guest);
  if (!guestRow) return;
  if (!ctx.db.playerAudioSetting.identity.find(account)) {
    ctx.db.playerAudioSetting.insert({ ...guestRow, identity: account });
  }
  ctx.db.playerAudioSetting.identity.delete(guest);
}

export function removeAudioSettings(ctx: { db: any }, identity: any) {
  if (ctx.db.playerAudioSetting.identity.find(identity)) ctx.db.playerAudioSetting.identity.delete(identity);
}
