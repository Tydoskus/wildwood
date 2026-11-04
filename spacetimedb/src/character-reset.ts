// Resetting a character: the progress reset shared by the reset button and
// prestige, a fresh run, respawning with given progress, the death frame, and
// moving a player between maps. Moved out of index.ts unchanged.
import { boundedMapPopulation, requestLeaderboardRefresh } from "./leaderboard-refresh";
import { playerZone, persistWorldLocation, syncPlayerMotion, syncPlayerMotionIdentity, syncPlayerMapMarker, ensureRealtimeFrameSchedules } from "./presence-runtime";
import { clearProceduralProgress } from "./procedural-maps";
import { readPlayerProgress } from "./wide-stats";
import { defaultPlayerProgress, inventoryForProgress, inventoryWithBetaHelmet, equipmentPresentationForProgress } from "./progress-helpers";
import { challengeAttackInterval } from "../../shared/prestige-challenge";
import { reflectRewardsInPlay } from "./prestige-challenge";
import { savedAttackRange, effectiveMovementSpeedForProgress } from "./player-speed";
import { autoEquip, ensurePlayerLifetime, powerFieldsForProgress } from "./player-power";
import { SUPERIOR_GOLDEN_HELMET } from "../../shared/items";
import { QUEST_BOARD_SEEN_BIT } from "../../shared/portal-cutscenes";
import { updateSnapshotRow, insertSnapshotRow, deleteSnapshotRow } from "./snapshot-row-writes";
import { removeResearchCompletionSchedules } from "./research-runtime";
import { removePausedResearch } from "./research-pause";
import { deleteLuckResearch } from "./luck-research";
import { deleteRankTableResearch } from "./research-rank";
import { removePlayerItemDrops, removePlayerItemUpgradeData } from "./item-upgrade-runtime";
import { TUTORIAL_FOREST_MAP_ID, PLAYER_SPAWN } from "../../shared/rules";
import { HOME_EXTERIOR_MAP_ID } from "../../shared/home";
import { isTownMap } from "./town";
import { isGuildHallMap } from "./guild-hall";
import { pinMapBalance } from "./map-balance";
import { recordAnalyticsMapVisit } from "./analytics";
import { noteMapDeparture } from "./enemy-defeats";
import { removeMiningData } from "./mining";
import { removeWoodcuttingData } from "./woodcutting";
import { removeFishingData } from "./fishing";
import { removeWeaponMastery } from "./weapon-mastery";
import { removeCraftSkills } from "./crafting";
import { removeTools } from "./tools";
import { forfeitExchange } from "./exchange";

export function publishPlayerDeathFrame(ctx: any, activePlayer: any) {
  if (boundedMapPopulation(ctx, activePlayer.mapId) < 2) return;
  const motion = ctx.db.playerMotion.identity.find(activePlayer.identity);
  if (!motion?.isVisible) return;
  ctx.db.playerDeathFrame.insert({
    mapId: activePlayer.mapId,
    ...playerZone(activePlayer.x, activePlayer.y),
    networkId: motion.networkId,
    playerX: activePlayer.x,
    playerY: activePlayer.y,
    facing: activePlayer.facing,
    emittedAt: ctx.timestamp,
  });
}

/**
 * The whole reset, shared by the player's own reset button and by prestige.
 * Prestige keeps what a run cannot re-earn by playing again: research ranks
 * cost real days, and lifetime kills are the count of everything the account
 * has ever killed, which a rerun does not undo. Kill gems key their ledger
 * reference off that count rising, so holding it steady also keeps a replayed
 * batch from paying twice. It keeps the bag too; each tier is usable again
 * once its map is reached (auto-equip.ts puts on what can be used now).
 */
export function resetProgressToDefaults(ctx: any, activePlayer: any, keep: { research?: boolean; lifetimeKills?: boolean; slotTiers?: boolean; items?: boolean } = {}) {
    clearProceduralProgress(ctx, ctx.sender);
    const current = readPlayerProgress(ctx, ctx.sender);
    const next = defaultPlayerProgress(ctx.sender);
    next.attackRate = challengeAttackInterval(next.attackRate, reflectRewardsInPlay(ctx, ctx.sender));
    if (current) next.cosmeticItemsJson = current.cosmeticItemsJson;
    if (keep.research) next.attackRange = savedAttackRange(ctx, ctx.sender);
    const history = ctx.db.playerCutsceneHistory.identity.find(ctx.sender);
    if (history) ctx.db.playerCutsceneHistory.identity.update({ ...history, seenMask: history.seenMask & QUEST_BOARD_SEEN_BIT, generation: history.generation + 1 });
    else ctx.db.playerCutsceneHistory.insert({ identity: ctx.sender, seenMask: 0, generation: 0 });
    if (current && keep.items) Object.assign(next, autoEquip.keepBagThroughPrestige(ctx, next, current));
    if (current && inventoryForProgress(current).includes(SUPERIOR_GOLDEN_HELMET)) {
      next.inventoryJson = JSON.stringify(inventoryWithBetaHelmet(next, true));
    }
    if (current) updateSnapshotRow(ctx, "playerProgress", next);
    else insertSnapshotRow(ctx, "playerProgress", next);
    if (!keep.research) {
      const research = ctx.db.playerResearch.identity.find(ctx.sender);
      if (research) deleteSnapshotRow(ctx, "playerResearch", ctx.sender);
      deleteLuckResearch(ctx, ctx.sender);
      deleteRankTableResearch(ctx, ctx.sender);
      const activeResearchRow = ctx.db.activeResearch.identity.find(ctx.sender);
      if (activeResearchRow) ctx.db.activeResearch.identity.delete(ctx.sender);
      removeResearchCompletionSchedules(ctx, ctx.sender);
      removePausedResearch(ctx, ctx.sender);
    }
    // A tier belongs to the slot, not to whatever is sitting in it. Prestige
    // leaves the bench work, the way it leaves research and the gear;
    // a deliberate account reset clears the lot.
    if (keep.slotTiers) removePlayerItemDrops(ctx, ctx.sender, keep.items);
    else removePlayerItemUpgradeData(ctx, ctx.sender, true);
    const lifetime = ensurePlayerLifetime(ctx);
    if (!keep.lifetimeKills) ctx.db.playerLifetime.identity.update({ ...lifetime, enemyKills: 0n });
    respawnWithProgress(ctx, activePlayer, next);
}

/**
 * What Reset Save erases besides the run: everything earned across runs, prestige, perks, the soul and
 * challenge wins included, as its "Everything resets" warning says. Gems, purchases, cosmetics and mail stay.
 */
const RESET_SAVE_TABLES = [
  "playerPrestige", "playerPrestigePerk", "playerPrestigeExpansionPerk", "playerPrestigeCardPerk", "playerFreeRespec",
  "playerPrestigeChallenge", "prestigeChallengeBackup", "prestigeChallengeRun", "playerPrestigeChallengeParked",
  "playerAggroChallenge", "aggroChallengeRun", "playerAggroChallengeParked",
  "playerSoulStats", "playerSoulLevel", "playerRewardKills", "playerBonusToggle", "playerGold", "playerStarterWeapon",
] as const;

/** Reset Save: the account's progression first, so the fresh run starts with none of its bonuses, then the run. */
export function resetWholeSave(ctx: any, activePlayer: any) {
  forfeitExchange(ctx, ctx.sender);
  for (const table of RESET_SAVE_TABLES) {
    const handle = ctx.db[table];
    if (handle?.identity.find(ctx.sender)) handle.identity.delete(ctx.sender);
  }
  removeMiningData(ctx, ctx.sender); // Mining is earned across runs too: the pickaxe goes back to the Smith.
  removeWoodcuttingData(ctx, ctx.sender); // So is Woodcutting, and the hatchet with it.
  removeFishingData(ctx, ctx.sender); // And Fishing.
  removeWeaponMastery(ctx, ctx.sender);
  removeCraftSkills(ctx, ctx.sender);
  removeTools(ctx, ctx.sender);
  resetProgressToDefaults(ctx, activePlayer);
}

/** A prestige's fresh run, which a challenge run also starts with (and an Aggro death restarts). */
export function startFreshRun(ctx: any, player: any) { resetProgressToDefaults(ctx, player, { research: true, lifetimeKills: true, slotTiers: true, items: true }); }

/** After a reset or respec: full health at the new stats, at the forest spawn, and ranked on them at once. */
export function respawnWithProgress(ctx: any, activePlayer: any, next: any, destination = { mapId: TUTORIAL_FOREST_MAP_ID, ...PLAYER_SPAWN }) {
    const nextPlayer = { ...activePlayer, hp: next.maxHp, maxHp: next.maxHp, ...powerFieldsForProgress(ctx, next),
      speed: effectiveMovementSpeedForProgress(ctx, next), ...equipmentPresentationForProgress(ctx, next) };
    persistWorldLocation(ctx, transitionPlayerMap(ctx, nextPlayer, destination.mapId, destination, 0));
    // Kills still arriving for the map just left belong to the run that left it, never the one arriving.
    ctx.db.playerMapDeparture.identity.delete(activePlayer.identity);
    // The board is built from saved stats on a timer, so without this the
    // player keeps their old rank until the next sweep, which reads to
    // everyone else as a reset player still sitting at the top. Throttled
    // to one rebuild a minute; a reset inside that minute waits for it.
    requestLeaderboardRefresh(ctx);
}

export function transitionPlayerMap(
  ctx: any,
  current: any,
  mapId: string,
  arrival: { x: number; y: number },
  facing = current.facing,
) {
  // Through a door on the same map (Soul village, guild hall) the client keeps its interest and never resends it.
  if (mapId !== current.mapId && ctx.db.playerMotionInterest.identity.find(current.identity)) ctx.db.playerMotionInterest.identity.delete(current.identity);
  const currentMotion = ctx.db.playerMotion.identity.find(current.identity);
  const nextPlayer = {
    ...current,
    mapId,
    x: arrival.x,
    y: arrival.y,
    ...playerZone(arrival.x, arrival.y),
    facing: Number.isFinite(facing) ? facing : 0,
    moving: false,
    dx: 0,
    dy: 0,
    vx: 0,
    vy: 0,
    simulationTick: currentMotion?.simulationTick ?? current.simulationTick ?? 0,
    motionEpoch: ((currentMotion?.motionEpoch ?? current.motionEpoch ?? 0) + 1) >>> 0,
    lastInputAt: ctx.timestamp,
  };
  updateSnapshotRow(ctx, "player", nextPlayer);
  if (mapId !== current.mapId) noteMapDeparture(ctx, current.identity, current.mapId);
  // The motion row read above is handed to the presence helpers; each host call is paid for.
  const motion = syncPlayerMotion(ctx, nextPlayer, { motion: currentMotion });
  syncPlayerMotionIdentity(ctx, nextPlayer, { motion });
  syncPlayerMapMarker(ctx, nextPlayer, true);
  ensureRealtimeFrameSchedules(ctx);
  // Home, the Town and guild halls have no enemies: nothing reads a pin there, and the old pin still fits on the way back.
  if (mapId !== HOME_EXTERIOR_MAP_ID && !isTownMap(mapId) && !isGuildHallMap(mapId)) pinMapBalance(ctx, mapId);
  recordAnalyticsMapVisit(ctx, mapId);
  return nextPlayer;
}
