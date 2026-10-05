import { table, t, SenderError } from "spacetimedb/server";
import type spacetimedbType from "./index";
import { AGGRO_CHALLENGE_LIMIT } from "../../shared/aggro-challenge";
import { carryOwnership, savedMainRun, writeEndless } from "./prestige-challenge";
import { prestigeExpanded } from "./prestige-expansion";
import { updateSnapshotRow } from "./snapshot-row-writes";
import { readPlayerProgress } from "./wide-stats";

/**
 * The Aggro challenge (shared/aggro-challenge.ts has the rules). Its main run
 * waits in the same prestige_challenge_backup row Reflect Only uses, so only
 * one challenge can be under way at a time. A run is not parked: dying starts
 * it over anyway, so dropping out simply ends it.
 */
export const playerAggroChallenge = table({ name: "player_aggro_challenge", public: true }, {
  identity: t.identity().primaryKey(), active: t.bool(), completed: t.u32(),
});

export const aggroChallengeActive = (ctx: any, identity: any) => Boolean(ctx.db.playerAggroChallenge?.identity.find(identity)?.active);

export type AggroDeps = {
  requireControllingPlayer: (ctx: any) => any;
  activeDuelFor: (ctx: any, identity: any) => unknown;
  /** The fresh-run reset a prestige uses: forest, starting stats, research and bag kept. */
  startFreshRun: (ctx: any, player: any) => void;
  respawnWithProgress: (ctx: any, player: any, progress: any, destination?: { mapId: string; x: number; y: number }) => void;
};

function writeRow(ctx: any, row: { identity: any; active: boolean; completed: number }) {
  if (ctx.db.playerAggroChallenge.identity.find(row.identity)) ctx.db.playerAggroChallenge.identity.update(row);
  else ctx.db.playerAggroChallenge.insert(row);
}

/** Saves the main run, marks the run active and starts it fresh. The row goes active first, so the reset sees no prestige bonuses. */
export function startAggroChallenge(ctx: any, deps: AggroDeps) {
  const player = deps.requireControllingPlayer(ctx);
  if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel before starting a challenge.");
  if (!prestigeExpanded(ctx)) throw new SenderError("Challenges unlock when the countdown finishes.");
  if (!(ctx.db.playerPrestige.identity.find(ctx.sender)?.level > 0)) throw new SenderError("Prestige once before starting a challenge.");
  const row = ctx.db.playerAggroChallenge.identity.find(ctx.sender);
  if (row?.active) throw new SenderError("An Aggro run is already under way.");
  if ((row?.completed ?? 0) >= AGGRO_CHALLENGE_LIMIT) throw new SenderError("Every Aggro challenge is complete.");
  if (ctx.db.playerPrestigeChallenge.identity.find(ctx.sender)?.active || ctx.db.prestigeChallengeBackup.identity.find(ctx.sender)) {
    throw new SenderError("Finish or drop out of Reflect Only first.");
  }
  const progress = readPlayerProgress(ctx, ctx.sender);
  if (!progress) throw new SenderError("Player progress is not ready.");
  const { identity: _identity, ...fields } = progress;
  ctx.db.prestigeChallengeBackup.insert({ identity: ctx.sender, progressJson: JSON.stringify(fields),
    completedEndless: ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0,
    mapId: player.mapId, x: player.x, y: player.y });
  writeRow(ctx, { identity: ctx.sender, active: true, completed: row?.completed ?? 0 });
  deps.startFreshRun(ctx, player);
}

/**
 * Ends the run and hands back the main one. A win counts and keeps nothing of
 * the run but what the account owns (carryOwnership): a drop-out is the same
 * without the count. The row goes inactive first, so the main run comes back
 * with its prestige bonuses.
 */
export function endAggroChallenge(ctx: any, player: any, won: boolean, deps: Pick<AggroDeps, "respawnWithProgress">) {
  const row = ctx.db.playerAggroChallenge.identity.find(ctx.sender);
  const backup = ctx.db.prestigeChallengeBackup.identity.find(ctx.sender);
  if (!row?.active || !backup) throw new SenderError("No Aggro run is under way.");
  // The saved run is read before anything changes: one that cannot be read
  // refuses the drop-out, so the player stays in the run with it untouched.
  const saved = savedMainRun(backup.progressJson);
  if (!saved) throw new SenderError("Your saved run couldn't be loaded, so you're still in the Aggro run. Nothing was lost: report this with /bug.");
  writeRow(ctx, { identity: ctx.sender, active: false, completed: Math.min(AGGRO_CHALLENGE_LIMIT, row.completed + (won ? 1 : 0)) });
  const progress = carryOwnership({ ...saved, identity: ctx.sender }, readPlayerProgress(ctx, ctx.sender));
  updateSnapshotRow(ctx, "playerProgress", progress);
  writeEndless(ctx, ctx.sender, backup.completedEndless);
  ctx.db.prestigeChallengeBackup.identity.delete(ctx.sender);
  deps.respawnWithProgress(ctx, player, progress, { mapId: backup.mapId, x: backup.x, y: backup.y });
}

/** A death during a run starts it over: the forest, starting stats, Endless cleared. */
export function restartAggroRunOnDeath(ctx: any, player: any, startFreshRun: AggroDeps["startFreshRun"]) {
  if (!aggroChallengeActive(ctx, ctx.sender) || !player) return false;
  startFreshRun(ctx, player);
  return true;
}

export function mergeAggroChallenges(ctx: any, guest: any, account: any) {
  const source = ctx.db.playerAggroChallenge.identity.find(guest);
  if (!source) return;
  const target = ctx.db.playerAggroChallenge.identity.find(account);
  // The backup moves with Reflect Only's merge; a run comes across only with it.
  writeRow(ctx, { identity: account, active: Boolean(target?.active || source.active), completed: Math.max(target?.completed ?? 0, source.completed) });
  ctx.db.playerAggroChallenge.identity.delete(guest);
}

export function registerAggroReducers(spacetimedb: typeof spacetimedbType, deps: AggroDeps) {
  const startAggroRun = spacetimedb.reducer({}, (ctx) => { startAggroChallenge(ctx, deps); });
  const abandonAggroRun = spacetimedb.reducer({}, (ctx) => {
    const player = deps.requireControllingPlayer(ctx);
    if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel before dropping out.");
    endAggroChallenge(ctx, player, false, deps);
  });
  return { startAggroRun, abandonAggroRun };
}
