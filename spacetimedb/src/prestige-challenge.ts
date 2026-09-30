import { table, t, SenderError } from "spacetimedb/server";
import { PRESTIGE_CHALLENGE_LIMIT, challengeMinimumInterval } from "../../shared/prestige-challenge";
import { prestigeExpanded } from "./prestige-expansion";
import { updateSnapshotRow } from "./snapshot-row-writes";

export const playerPrestigeChallenge = table({ name: "player_prestige_challenge", public: true }, {
  identity: t.identity().primaryKey(), active: t.bool(), completed: t.u32(),
});
export const prestigeChallengeBackup = table({ name: "prestige_challenge_backup", public: false }, {
  identity: t.identity().primaryKey(), progressJson: t.string(), completedEndless: t.f64(),
  mapId: t.string(), x: t.f32(), y: t.f32(),
});
export const challengeActive = (ctx: any, identity: any) => Boolean(ctx.db.playerPrestigeChallenge.identity.find(identity)?.active);

export function setPrestigeChallenge(ctx: any, active: boolean, player: any) {
  const row = ctx.db.playerPrestigeChallenge.identity.find(ctx.sender);
  if (active) {
    if (!prestigeExpanded(ctx)) throw new SenderError("Challenge mode unlocks when the countdown finishes.");
    if (!(ctx.db.playerPrestige.identity.find(ctx.sender)?.level > 0)) throw new SenderError("Prestige once before starting a challenge.");
    if (row?.active) throw new SenderError("A prestige challenge is already active.");
    if ((row?.completed ?? 0) >= PRESTIGE_CHALLENGE_LIMIT) throw new SenderError("All four prestige challenges are complete.");
  } else if (!row?.active) throw new SenderError("No prestige challenge is active.");
  const next = { identity: ctx.sender, active, completed: row?.completed ?? 0 };
  const progress = ctx.db.playerProgress.identity.find(ctx.sender);
  if (!progress) throw new SenderError("Player progress is not ready.");
  if (ctx.db.prestigeChallengeBackup.identity.find(ctx.sender)) throw new SenderError("A saved challenge run already exists.");
  const { identity: _identity, ...fields } = progress;
  ctx.db.prestigeChallengeBackup.insert({ identity: ctx.sender, progressJson: JSON.stringify(fields),
    completedEndless: ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0,
    mapId: player.mapId, x: player.x, y: player.y });
  if (row) ctx.db.playerPrestigeChallenge.identity.update(next); else ctx.db.playerPrestigeChallenge.insert(next);
}

/** Both finishing and abandoning restore the parked run; only finishing earns a reward. */
export function restorePrestigeChallenge(ctx: any, _player: any, reward: boolean,
  arrive: (restored: { progress: any; mapId: string; x: number; y: number }) => void) {
  const challenge = ctx.db.playerPrestigeChallenge.identity.find(ctx.sender);
  const backup = ctx.db.prestigeChallengeBackup.identity.find(ctx.sender);
  if (!challenge?.active || !backup) throw new SenderError("No saved prestige challenge is active.");
  const next = { ...challenge, active: false, completed: challenge.completed + (reward ? 1 : 0) };
  if (next.completed > PRESTIGE_CHALLENGE_LIMIT) throw new SenderError("All four prestige challenges are complete.");
  ctx.db.playerPrestigeChallenge.identity.update(next);
  const progress = { ...JSON.parse(backup.progressJson), identity: ctx.sender };
  if (reward) progress.attackRate = Math.max(challengeMinimumInterval(next), 1 / (1 / progress.attackRate + .5));
  updateSnapshotRow(ctx, "playerProgress", progress);
  const endless = { identity: ctx.sender, completed: backup.completedEndless };
  if (ctx.db.proceduralProgress.identity.find(ctx.sender)) ctx.db.proceduralProgress.identity.update(endless);
  else ctx.db.proceduralProgress.insert(endless);
  ctx.db.prestigeChallengeBackup.identity.delete(ctx.sender);
  arrive({ progress, mapId: backup.mapId, x: backup.x, y: backup.y });
}

export function mergePrestigeChallenges(ctx: any, guest: any, account: any) {
  const source = ctx.db.playerPrestigeChallenge.identity.find(guest);
  if (!source) return;
  const target = ctx.db.playerPrestigeChallenge.identity.find(account);
  const next = { identity: account, active: Boolean(target?.active || source.active), completed: Math.max(target?.completed ?? 0, source.completed) };
  const backup = ctx.db.prestigeChallengeBackup.identity.find(guest);
  if (backup && !ctx.db.prestigeChallengeBackup.identity.find(account)) ctx.db.prestigeChallengeBackup.insert({ ...backup, identity: account });
  if (backup) ctx.db.prestigeChallengeBackup.identity.delete(guest);
  if (target) ctx.db.playerPrestigeChallenge.identity.update(next); else ctx.db.playerPrestigeChallenge.insert(next);
  ctx.db.playerPrestigeChallenge.identity.delete(guest);
}

/**
 * Put a player already playing reflect-only by hand into the challenge where
 * they stand: their current run becomes the saved run, and nothing resets.
 */
export function enrollInPrestigeChallenge(ctx: any, identity: any): string {
  const row = ctx.db.playerPrestigeChallenge.identity.find(identity);
  if (row?.active || ctx.db.prestigeChallengeBackup.identity.find(identity)) return "already in a challenge";
  if ((row?.completed ?? 0) >= PRESTIGE_CHALLENGE_LIMIT) return "every challenge already complete";
  const progress = ctx.db.playerProgress.identity.find(identity);
  const player = ctx.db.player.identity.find(identity);
  if (!progress || !player) return "no saved run to park";
  const { identity: _identity, ...fields } = progress;
  ctx.db.prestigeChallengeBackup.insert({ identity, progressJson: JSON.stringify(fields),
    completedEndless: ctx.db.proceduralProgress.identity.find(identity)?.completed ?? 0,
    mapId: player.mapId, x: player.x, y: player.y });
  const next = { identity, active: true, completed: row?.completed ?? 0 };
  if (row) ctx.db.playerPrestigeChallenge.identity.update(next); else ctx.db.playerPrestigeChallenge.insert(next);
  return "enrolled";
}
