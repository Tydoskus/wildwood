import { table, t, SenderError } from "spacetimedb/server";
import type spacetimedbType from "./index";
import { AGGRO_CHALLENGE_LIMIT } from "../../shared/aggro-challenge";
import { TUTORIAL_FOREST_MAP_ID } from "../../shared/rules";
import { carryOwnership, savedMainRun, writeEndless } from "./prestige-challenge";
import { prestigeExpanded } from "./prestige-expansion";
import { updateSnapshotRow } from "./snapshot-row-writes";
import { readPlayerProgress } from "./wide-stats";
import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import { CAMPAIGN_GATEWAYS } from "../../shared/map-gateways";
import { CAMPAIGN_UNLOCK_FIELDS } from "../../shared/equipment-access";
import { referenceBuildForMap } from "../../shared/progression";
import { effectivePlayerPower } from "../../shared/player-power";

/**
 * The Aggro challenge (shared/aggro-challenge.ts has the rules). Its main run
 * waits in the same prestige_challenge_backup row Reflect Only uses, so only
 * one challenge can be under way at a time. Dropping out parks the run, as
 * Reflect Only does, and starting again drops back into it; only a death
 * starts a run over. (It used to end the run: Phoe lost hers, 2026-10-05.)
 */
export const playerAggroChallenge = table({ name: "player_aggro_challenge", public: true }, {
  identity: t.identity().primaryKey(), active: t.bool(), completed: t.u32(),
});
/** An Aggro run the player dropped out of, parked until they drop back in. Private: the client sees only the marker below. */
export const aggroChallengeRun = table({ name: "aggro_challenge_run", public: false }, {
  identity: t.identity().primaryKey(), progressJson: t.string(), completedEndless: t.f64(),
  mapId: t.string(), x: t.f32(), y: t.f32(),
});
/** Tells the client an Aggro run is parked, so it offers to drop back in. */
export const playerAggroChallengeParked = table({ name: "player_aggro_challenge_parked", public: true }, {
  identity: t.identity().primaryKey(), parkedAt: t.timestamp(),
});

function clearParkedAggro(ctx: any, identity: any) {
  if (ctx.db.aggroChallengeRun.identity.find(identity)) ctx.db.aggroChallengeRun.identity.delete(identity);
  if (ctx.db.playerAggroChallengeParked.identity.find(identity)) ctx.db.playerAggroChallengeParked.identity.delete(identity);
}

/** The run as it stands, to park: stats, Endless progress and where the player is. */
function parkAggroRun(ctx: any, player: any) {
  const live = readPlayerProgress(ctx, ctx.sender);
  if (!live) return;
  const { identity: _identity, ...fields } = live;
  clearParkedAggro(ctx, ctx.sender);
  ctx.db.aggroChallengeRun.insert({ identity: ctx.sender, progressJson: JSON.stringify(fields),
    completedEndless: ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0,
    mapId: player.mapId, x: player.x, y: player.y });
  ctx.db.playerAggroChallengeParked.insert({ identity: ctx.sender, parkedAt: ctx.timestamp });
}

/** Drops back into a parked run: its stats, Endless stage and spot, with everything the account owns carried in. */
function resumeParkedAggro(ctx: any) {
  const parked = ctx.db.aggroChallengeRun.identity.find(ctx.sender);
  const saved = parked && savedMainRun(parked.progressJson);
  if (!parked || !saved) { clearParkedAggro(ctx, ctx.sender); return null; }
  const progress = carryOwnership({ ...saved, identity: ctx.sender }, readPlayerProgress(ctx, ctx.sender));
  updateSnapshotRow(ctx, "playerProgress", progress);
  writeEndless(ctx, ctx.sender, parked.completedEndless);
  clearParkedAggro(ctx, ctx.sender);
  return { progress, mapId: parked.mapId, x: parked.x, y: parked.y };
}

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

/**
 * Saves the main run, marks the run active, and drops back into a parked run
 * or starts a fresh one. The row goes active first, so neither sees prestige bonuses.
 */
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
  const resumed = resumeParkedAggro(ctx);
  if (resumed) deps.respawnWithProgress(ctx, player, resumed.progress, resumed);
  else deps.startFreshRun(ctx, player);
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
  // A drop-out parks the run to come back to; a win leaves nothing parked.
  if (won) clearParkedAggro(ctx, ctx.sender); else parkAggroRun(ctx, player);
  writeRow(ctx, { identity: ctx.sender, active: false, completed: Math.min(AGGRO_CHALLENGE_LIMIT, row.completed + (won ? 1 : 0)) });
  const progress = carryOwnership({ ...saved, identity: ctx.sender }, readPlayerProgress(ctx, ctx.sender));
  updateSnapshotRow(ctx, "playerProgress", progress);
  writeEndless(ctx, ctx.sender, backup.completedEndless);
  ctx.db.prestigeChallengeBackup.identity.delete(ctx.sender);
  deps.respawnWithProgress(ctx, player, progress, { mapId: backup.mapId, x: backup.x, y: backup.y });
}

/**
 * A death during a run starts it over: the forest, starting stats, Endless cleared. Tutorial Forest is the
 * run's safe zone (Ryan): a death there costs nothing, only one on a later map starts the run over.
 */
export function restartAggroRunOnDeath(ctx: any, player: any, startFreshRun: AggroDeps["startFreshRun"]) {
  if (!aggroChallengeActive(ctx, ctx.sender) || !player || player.mapId === TUTORIAL_FOREST_MAP_ID) return false;
  startFreshRun(ctx, player);
  return true;
}

/**
 * Rebuilds a lost run as a parked one: Phoe dropped out of hers before drop-outs
 * parked (2026-10-05) and it was not kept anywhere. Her bag and cosmetics are
 * her own; the stats are the campaign's expected build for the furthest map
 * whose build her power reached, scaled to that power as the game counts it
 * (gear and research included), with every map before it open and the player
 * at its entrance. Whatever she has now is replaced (Ryan's call): a run under
 * way takes the rebuilt stats where she stands, a parked one is swapped for it.
 * Skips (and logs) unless exactly one player has the name.
 */
export function rebuildParkedAggroRun(ctx: any, name: string, power: number) {
  const matches = [...ctx.db.playerProfile.iter() as Iterable<any>].filter(profile => String(profile.displayName).trim().toLowerCase() === name);
  if (matches.length !== 1) { console.warn(`Aggro run rebuild: ${matches.length} players named "${name}", none rebuilt.`); return "no single match"; }
  const identity = matches[0].identity, main = readPlayerProgress(ctx, identity);
  if (!main) return "no progress";
  const inRun = Boolean(ctx.db.playerAggroChallenge.identity.find(identity)?.active);
  const research = ctx.db.playerResearch.identity.find(identity);
  const runAt = (index: number, scale: number) => {
    const build = referenceBuildForMap(index), opened: Record<string, boolean> = {};
    let claims = 0;
    for (let map = 0; map < index; map += 1) claims |= 2 ** CAMPAIGN_MAPS[map].claimIndex;
    for (let map = 1; map <= index; map += 1) {
      const field = CAMPAIGN_MAPS[map].unlockField as typeof CAMPAIGN_UNLOCK_FIELDS[number];
      if ((CAMPAIGN_UNLOCK_FIELDS as readonly string[]).includes(field)) opened[field] = true;
    }
    for (const field of CAMPAIGN_UNLOCK_FIELDS) opened[field] ??= false;
    return { ...main, ...opened, bossRewardClaims: claims, maxHp: build.maxHp * scale, damage: build.damage * scale,
      armor: build.armor * scale, regen: build.regen * scale, attackRate: build.attackInterval };
  };
  const powerOf = (progress: any) => effectivePlayerPower(progress, research);
  let index = 0;
  while (index + 1 < CAMPAIGN_MAPS.length && powerOf(runAt(index + 1, 1)) <= power) index += 1;
  // Scale that map's build until its power, as the game counts it, is the run's.
  let low = 0.01, high = 1_000;
  for (let step = 0; step < 80; step += 1) { const mid = Math.sqrt(low * high); if (powerOf(runAt(index, mid)) < power) low = mid; else high = mid; }
  const run = runAt(index, low), map = CAMPAIGN_MAPS[index];
  // In a run now: its stats become the rebuilt ones where she stands.
  if (inRun) {
    updateSnapshotRow(ctx, "playerProgress", run);
    console.log(`Aggro run rebuild of "${name}": the run under way set to ${Math.round(powerOf(run))} power.`);
    return "run under way rebuilt";
  }
  const { identity: _identity, ...fields } = run;
  const arrival = CAMPAIGN_GATEWAYS[map.id]?.arrival ?? { x: 0, y: 0 };
  if (ctx.db.aggroChallengeRun.identity.find(identity)) ctx.db.aggroChallengeRun.identity.delete(identity);
  ctx.db.aggroChallengeRun.insert({ identity, progressJson: JSON.stringify(fields), completedEndless: 0, mapId: map.id, x: arrival.x, y: arrival.y });
  if (!ctx.db.playerAggroChallengeParked.identity.find(identity)) ctx.db.playerAggroChallengeParked.insert({ identity, parkedAt: ctx.timestamp });
  console.log(`Aggro run rebuild of "${name}": parked on ${map.id} at ${Math.round(powerOf(run))} power.`);
  return `parked on ${map.id}`;
}

export function mergeAggroChallenges(ctx: any, guest: any, account: any) {
  const parked = ctx.db.aggroChallengeRun.identity.find(guest);
  if (parked && !ctx.db.aggroChallengeRun.identity.find(account)) {
    ctx.db.aggroChallengeRun.insert({ ...parked, identity: account });
    if (!ctx.db.playerAggroChallengeParked.identity.find(account)) ctx.db.playerAggroChallengeParked.insert({ identity: account, parkedAt: ctx.timestamp });
  }
  clearParkedAggro(ctx, guest);
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
