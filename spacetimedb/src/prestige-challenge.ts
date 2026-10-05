import { table, t, SenderError } from "spacetimedb/server";
import { PRESTIGE_CHALLENGE_LIMIT, challengeGoalMet, challengeMinimumInterval } from "../../shared/prestige-challenge";
import { prestigeExpanded } from "./prestige-expansion";
import { updateSnapshotRow } from "./snapshot-row-writes";
import { readPlayerProgress } from "./wide-stats";

export const playerPrestigeChallenge = table({ name: "player_prestige_challenge", public: true }, {
  identity: t.identity().primaryKey(), active: t.bool(), completed: t.u32(),
});
export const prestigeChallengeBackup = table({ name: "prestige_challenge_backup", public: false }, {
  identity: t.identity().primaryKey(), progressJson: t.string(), completedEndless: t.f64(),
  mapId: t.string(), x: t.f32(), y: t.f32(),
});
/** A challenge run the player dropped out of, parked until they drop back in. */
export const prestigeChallengeRun = table({ name: "prestige_challenge_run", public: false }, {
  identity: t.identity().primaryKey(), progressJson: t.string(), completedEndless: t.f64(),
  mapId: t.string(), x: t.f32(), y: t.f32(),
});
/** Tells the client a challenge run is parked, so it offers to drop back in. The run itself stays private. */
export const playerPrestigeChallengeParked = table({ name: "player_prestige_challenge_parked", public: true }, {
  identity: t.identity().primaryKey(), parkedAt: t.timestamp(),
});
/** Either challenge under way: perks can be neither spent nor respecced during one. */
/** The Reflect Only row whose wins count now: none during an Aggro run, which plays without prestige rewards. */
export const reflectRewardsInPlay = (ctx: any, identity: any) =>
  ctx.db.playerAggroChallenge?.identity.find(identity)?.active ? null : ctx.db.playerPrestigeChallenge.identity.find(identity);
export const challengeActive = (ctx: any, identity: any) => Boolean(ctx.db.playerPrestigeChallenge.identity.find(identity)?.active
  || ctx.db.playerAggroChallenge?.identity.find(identity)?.active);

export function setPrestigeChallenge(ctx: any, active: boolean, player: any) {
  const row = ctx.db.playerPrestigeChallenge.identity.find(ctx.sender);
  if (active) {
    if (!prestigeExpanded(ctx)) throw new SenderError("Challenge mode unlocks when the countdown finishes.");
    if (!(ctx.db.playerPrestige.identity.find(ctx.sender)?.level > 0)) throw new SenderError("Prestige once before starting a challenge.");
    if (row?.active) throw new SenderError("A prestige challenge is already active.");
    if ((row?.completed ?? 0) >= PRESTIGE_CHALLENGE_LIMIT) throw new SenderError("All four prestige challenges are complete.");
  } else if (!row?.active) throw new SenderError("No prestige challenge is active.");
  const next = { identity: ctx.sender, active, completed: row?.completed ?? 0 };
  const progress = readPlayerProgress(ctx, ctx.sender);
  if (!progress) throw new SenderError("Player progress is not ready.");
  if (ctx.db.prestigeChallengeBackup.identity.find(ctx.sender)) throw new SenderError("A saved challenge run already exists.");
  const { identity: _identity, ...fields } = progress;
  ctx.db.prestigeChallengeBackup.insert({ identity: ctx.sender, progressJson: JSON.stringify(fields),
    completedEndless: ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0,
    mapId: player.mapId, x: player.x, y: player.y });
  if (row) ctx.db.playerPrestigeChallenge.identity.update(next); else ctx.db.playerPrestigeChallenge.insert(next);
}

/** The run as it stands: stats, Endless progress and position, ready to park. */
function runSnapshot(ctx: any, identity: any, player: any) {
  const { identity: _identity, ...fields } = readPlayerProgress(ctx, identity);
  return { identity, progressJson: JSON.stringify(fields),
    completedEndless: ctx.db.proceduralProgress.identity.find(identity)?.completed ?? 0,
    mapId: player.mapId, x: player.x, y: player.y };
}
/**
 * What a player owns belongs to the account, not to one run. A run coming back
 * keeps its own stats, maps and equipped gear, but takes everything either run
 * holds: an item that dropped, or a cosmetic bought, on the run being parked
 * is never lost to the swap.
 */
const ownedList = (json: unknown): string[] => {
  try { const list = JSON.parse(String(json ?? "[]")); return Array.isArray(list) ? list.filter(item => typeof item === "string") : []; }
  catch { return []; }
};
export function carryOwnership(restored: any, live: any) {
  if (!live) return restored;
  // Repeats are copies (forest bows and armor are counted that way), so each
  // item keeps the larger of the two runs' counts, in the restored run's order.
  const union = (a: unknown, b: unknown) => {
    const merged = ownedList(a), counts = new Map<string, number>();
    for (const item of merged) counts.set(item, (counts.get(item) ?? 0) + 1);
    const extra = new Map<string, number>();
    for (const item of ownedList(b)) {
      extra.set(item, (extra.get(item) ?? 0) + 1);
      if ((extra.get(item) ?? 0) > (counts.get(item) ?? 0)) merged.push(item);
    }
    return JSON.stringify(merged);
  };
  return { ...restored,
    inventoryJson: union(restored.inventoryJson, live.inventoryJson),
    cosmeticItemsJson: union(restored.cosmeticItemsJson, live.cosmeticItemsJson),
    bowCount: Math.max(restored.bowCount ?? 0, live.bowCount ?? 0),
    woodenArmorCount: Math.max(restored.woodenArmorCount ?? 0, live.woodenArmorCount ?? 0) };
}
export function writeEndless(ctx: any, identity: any, completed: number) {
  const endless = { identity, completed };
  if (ctx.db.proceduralProgress.identity.find(identity)) ctx.db.proceduralProgress.identity.update(endless);
  else ctx.db.proceduralProgress.insert(endless);
}
function clearParkedRun(ctx: any, identity: any) {
  if (ctx.db.prestigeChallengeRun.identity.find(identity)) ctx.db.prestigeChallengeRun.identity.delete(identity);
  if (ctx.db.playerPrestigeChallengeParked.identity.find(identity)) ctx.db.playerPrestigeChallengeParked.identity.delete(identity);
}

/**
 * Winning and dropping out both restore the saved main run. Dropping out parks
 * the challenge run first, so dropping back in picks it up where it stood;
 * only winning earns the reward, and a win leaves nothing parked.
 */
/**
 * Whether the sender's Reflect Only run has met its goal and can be won now:
 * active, not past the last challenge, goal met, and the saved run there to
 * restore. Never throws, so a kill report can ask it after every boss clear.
 */
export function challengeWinReady(ctx: any) {
  const challenge = ctx.db.playerPrestigeChallenge.identity.find(ctx.sender);
  if (!challenge?.active || challenge.completed >= PRESTIGE_CHALLENGE_LIMIT) return false;
  const progress = readPlayerProgress(ctx, ctx.sender);
  const endless = ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0;
  return Boolean(progress && challengeGoalMet(challenge.completed, progress.bossRewardClaims, endless)
    && ctx.db.prestigeChallengeBackup.identity.find(ctx.sender));
}

/** The saved main run, or null when it does not parse or its stats are not real numbers. */
export function savedMainRun(json: string) {
  try {
    const saved = JSON.parse(json);
    const stats = ["maxHp", "damage", "armor", "regen", "attackRate"];
    return saved && typeof saved === "object" && stats.every(stat => Number.isFinite(saved[stat])) && saved.maxHp > 0 && saved.attackRate > 0 ? saved : null;
  } catch { return null; }
}

export function restorePrestigeChallenge(ctx: any, player: any, reward: boolean,
  arrive: (restored: { progress: any; mapId: string; x: number; y: number }) => void) {
  const challenge = ctx.db.playerPrestigeChallenge.identity.find(ctx.sender);
  const backup = ctx.db.prestigeChallengeBackup.identity.find(ctx.sender);
  if (!challenge?.active || !backup) throw new SenderError("No saved prestige challenge is active.");
  // Read before anything changes: a saved run that cannot be loaded refuses the drop-out and leaves the run as it is.
  const saved = savedMainRun(backup.progressJson);
  if (!saved) throw new SenderError("Your saved run couldn't be loaded, so you're still in the challenge. Nothing was lost: report this with /bug.");
  const next = { ...challenge, active: false, completed: challenge.completed + (reward ? 1 : 0) };
  if (next.completed > PRESTIGE_CHALLENGE_LIMIT) throw new SenderError("All four prestige challenges are complete.");
  clearParkedRun(ctx, ctx.sender);
  if (!reward) {
    ctx.db.prestigeChallengeRun.insert(runSnapshot(ctx, ctx.sender, player));
    ctx.db.playerPrestigeChallengeParked.insert({ identity: ctx.sender, parkedAt: ctx.timestamp });
  }
  ctx.db.playerPrestigeChallenge.identity.update(next);
  const progress = carryOwnership({ ...saved, identity: ctx.sender }, readPlayerProgress(ctx, ctx.sender));
  if (reward) progress.attackRate = Math.max(challengeMinimumInterval(next), 1 / (1 / progress.attackRate + .5));
  updateSnapshotRow(ctx, "playerProgress", progress);
  writeEndless(ctx, ctx.sender, backup.completedEndless);
  ctx.db.prestigeChallengeBackup.identity.delete(ctx.sender);
  arrive({ progress, mapId: backup.mapId, x: backup.x, y: backup.y });
}

/**
 * Starting a challenge with a run parked drops back into it: the main run is
 * saved as for any start, and the parked run comes back where it stood.
 * Returns where to put the player, or null when there is nothing to resume.
 */
export function resumeParkedChallenge(ctx: any): { progress: any; mapId: string; x: number; y: number } | null {
  const parked = ctx.db.prestigeChallengeRun.identity.find(ctx.sender);
  if (!parked) return null;
  const progress = carryOwnership({ ...JSON.parse(parked.progressJson), identity: ctx.sender }, readPlayerProgress(ctx, ctx.sender));
  updateSnapshotRow(ctx, "playerProgress", progress);
  writeEndless(ctx, ctx.sender, parked.completedEndless);
  clearParkedRun(ctx, ctx.sender);
  return { progress, mapId: parked.mapId, x: parked.x, y: parked.y };
}

export function mergePrestigeChallenges(ctx: any, guest: any, account: any) {
  const source = ctx.db.playerPrestigeChallenge.identity.find(guest);
  if (!source) return;
  const target = ctx.db.playerPrestigeChallenge.identity.find(account);
  const next = { identity: account, active: Boolean(target?.active || source.active), completed: Math.max(target?.completed ?? 0, source.completed) };
  const backup = ctx.db.prestigeChallengeBackup.identity.find(guest);
  if (backup && !ctx.db.prestigeChallengeBackup.identity.find(account)) ctx.db.prestigeChallengeBackup.insert({ ...backup, identity: account });
  if (backup) ctx.db.prestigeChallengeBackup.identity.delete(guest);
  const parked = ctx.db.prestigeChallengeRun.identity.find(guest);
  if (parked && !ctx.db.prestigeChallengeRun.identity.find(account)) {
    ctx.db.prestigeChallengeRun.insert({ ...parked, identity: account });
    if (!ctx.db.playerPrestigeChallengeParked.identity.find(account)) ctx.db.playerPrestigeChallengeParked.insert({ identity: account, parkedAt: ctx.timestamp });
  }
  clearParkedRun(ctx, guest);
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
  const progress = readPlayerProgress(ctx, identity);
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
