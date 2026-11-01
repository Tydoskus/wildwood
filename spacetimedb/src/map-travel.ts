// Map travel: valid map ids, portal use points and arrival points, Endless
// access, and the changeMap body that checks a portal is in reach before moving
// the player. The changeMap declaration stays in index.ts.
import type { ModuleReducerCtx, GameViewContext, GameReducerContext } from "./index";
import { WORLD_WIDTH, WORLD_HEIGHT, MAP_IDS, INTERMEDIATE_SNOWLANDS_MAP_ID, BOSS_REWARD_CLAIM_BITS, TUTORIAL_FOREST_MAP_ID, PLAYER_SPAWN, PLAYER_RADIUS, MAP_DISPLAY_NAMES } from "../../shared/rules";
import { HOME_EXTERIOR_MAP_ID, HOME_TRAVEL_PORTAL } from "../../shared/home";
import { isProceduralMap, PROCEDURAL_ENTRY_BOSS, generateMap, PROCEDURAL_ENTRY_MAP, proceduralMapId } from "../../shared/procedural-maps";
import { isSoulMap, soulReturnOpenFor, worldBoundsFor, requireSoulDimensionOpen, SOUL_TOWN_PORTAL, SOUL_ARRIVAL } from "./soul-dimension";
import { isGuildHallMap, guildHallMember, enterGuildHall, guildHallReturnPointFor } from "./guild-hall";
import { isTownMap, TOWN_MAP_ID, TOWN_ARRIVAL, townPortalUsePoints } from "./town";
import { TOWN_DOORS, TOWN_RESEARCH_POSITION } from "../../shared/town";
import { CAMPAIGN_GATEWAYS, portalUsePoint, campaignLanding, endlessEntryPortal, exitPortalFor, portalArrival } from "../../shared/map-gateways";
import { requireControllingPlayer, isDeveloperIdentity } from "./session-guards";
import { activeDuelFor } from "./duel-runtime";
import { SenderError } from "spacetimedb/server";
import { readPlayerProgress } from "./wide-stats";
import { generatedMapUnlocked } from "./procedural-maps";
import { CAMPAIGN_UNLOCK_FIELDS, campaignMapUnlocked } from "../../shared/equipment-access";
import { transitionPlayerMap } from "./character-reset";
import { persistWorldLocation } from "./presence-runtime";
import { CAMPAIGN_MAPS } from "../../shared/campaign-registry";
import { nextMapAfter } from "../../shared/onward";
import { aggroChallengeActive } from "./aggro-challenge";
import { cardStatFactors, type CardTotals } from "../../shared/card-effects";
import { Identity } from "spacetimedb";

export const WORLD = { width: WORLD_WIDTH, height: WORLD_HEIGHT };

export const VALID_MAP_IDS = { has: (id: string) => MAP_IDS.includes(id) || id === HOME_EXTERIOR_MAP_ID || isProceduralMap(id) || isSoulMap(id) || isGuildHallMap(id) || isTownMap(id) };

export const LEGACY_FROSTWIND_EXPANSE_MAP_ID = "frostwind_expanse";

export function canonicalMapId(mapId: string) {
  return mapId === LEGACY_FROSTWIND_EXPANSE_MAP_ID ? INTERMEDIATE_SNOWLANDS_MAP_ID : mapId;
}

// Shared with the client (shared/map-gateways.ts): portals are checked at their use point.
export const MAP_PORTALS: Record<string, { x: number; y: number; destination: string }[]> =
  Object.fromEntries(Object.entries(CAMPAIGN_GATEWAYS).map(([mapId, gateways]) => [mapId, gateways.portals.map(portalUsePoint)]));

export const MAP_ARRIVALS: Record<string, { x: number; y: number }> =
  Object.fromEntries(Object.keys(CAMPAIGN_GATEWAYS).map(mapId => [mapId, campaignLanding(mapId)]));

export const MAP_PORTAL_USE_RANGE = 125;

export function changePlayerMap(ctx: ModuleReducerCtx, { mapId, x, y }: { mapId: string; x: number; y: number }) {
  // A restricted session is refused with its restriction, which the client shows. Returning quietly read as a
  // move made, and the client walked on to a map the server never sent it to.
  const current = requireControllingPlayer(ctx);
  if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish the duel before using a portal.");
  // "Base" and "Fight" both ask for the Town (Home, retired, means the same): Base from anywhere, Fight from the Town.
  if (mapId === HOME_EXTERIOR_MAP_ID || isTownMap(mapId)) {
    if (current.hp <= 0) throw new SenderError("Respawn before teleporting to the Town.");
    if (isTownMap(current.mapId)) {
      const saved = ctx.db.homeReturnLocation.identity.find(ctx.sender);
      // Recover already-linked accounts whose older client/server omitted
      // their Home return record. Keep their stats and unlocks intact.
      const progress = readPlayerProgress(ctx, ctx.sender);
      const savedMapIndex = saved ? MAP_IDS.indexOf(saved.mapId) : -1;
      // Fight only goes back to a map this run has open: a challenge run (or a reset) must not land on the main run's map 15, or its Soul Dimension.
      const permitted = (!isSoulMap(saved?.mapId) || soulReturnOpenFor(ctx, ctx.sender)) && (!isGuildHallMap(saved?.mapId) || guildHallMember(ctx, ctx.sender, saved!.mapId)) && Boolean(saved && (isProceduralMap(saved.mapId)
        ? hasEndlessTravelAccess(ctx, ctx.sender) || generatedMapUnlocked(saved.mapId, ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0,
          Boolean((progress?.bossRewardClaims ?? 0) & BOSS_REWARD_CLAIM_BITS[PROCEDURAL_ENTRY_BOSS]))
        : savedMapIndex <= 0 || Boolean(progress?.[CAMPAIGN_UNLOCK_FIELDS[savedMapIndex - 1]])));
      const destination = permitted && saved && saved.mapId !== HOME_EXTERIOR_MAP_ID && !isTownMap(saved.mapId) && VALID_MAP_IDS.has(saved.mapId)
        && [saved.x, saved.y, saved.facing].every(Number.isFinite)
        ? saved : { mapId: TUTORIAL_FOREST_MAP_ID, ...PLAYER_SPAWN, facing: 0 };
      const landing = isGuildHallMap(destination.mapId) ? guildHallReturnPointFor(ctx, destination.mapId, destination.x, destination.y) : destination;
      transitionPlayerMap(ctx, current, destination.mapId, landing, destination.facing);
    } else enterTown(ctx, current, x, y, TOWN_ARRIVAL);
    persistWorldLocation(ctx, ctx.db.player.identity.find(ctx.sender));
    return;
  }
  // Already there: a portal walk that raced a move the server made itself (Onward) is done, not refused.
  if (mapId === current.mapId) return;
  if (!VALID_MAP_IDS.has(mapId)) throw new SenderError("Unsupported map destination.");
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new SenderError("Portal position must be finite.");
  if (x < PLAYER_RADIUS || x > worldBoundsFor(current.mapId).width - PLAYER_RADIUS || y < PLAYER_RADIUS || y > worldBoundsFor(current.mapId).height - PLAYER_RADIUS) {
    throw new SenderError("Portal position is outside the world.");
  }
  if (isSoulMap(mapId)) requireSoulDimensionOpen(ctx);
  if (isGuildHallMap(mapId)) return enterGuildHall(ctx, current, mapId, x, y, { transitionPlayerMap, persistWorldLocation });
  const locked = lockedReason(ctx, mapId);
  if (locked) throw new SenderError(locked);
  // The Town's travel portal (and, for tabs from before the Town, Home's pad) reaches every map the checks above allow.
  const usePoint = (portal: { x: number; y: number; height: number }, destination: string) => ({ x: portal.x, y: portal.y - portal.height * .32, destination });
  const sourcePortals = current.mapId === HOME_EXTERIOR_MAP_ID ? [usePoint(HOME_TRAVEL_PORTAL, isSoulMap(mapId) ? "" : mapId)]
    : isTownMap(current.mapId) ? townPortalUsePoints(mapId)
    : isSoulMap(current.mapId) ? [usePoint(SOUL_TOWN_PORTAL, SOUL_TOWN_PORTAL.destination)]
    : isProceduralMap(current.mapId)
    ? generateMap(current.mapId).portals.map(portal => ({ ...portal, y:portal.y-portal.height*.32 }))
    : [...(MAP_PORTALS[current.mapId as keyof typeof MAP_PORTALS] ?? []),
      ...(current.mapId === PROCEDURAL_ENTRY_MAP ? [portalUsePoint(endlessEntryPortal(proceduralMapId(1)))] : [])];
  const sourcePortal = sourcePortals.filter((portal) => portal.destination === mapId).sort((a, b) => Math.hypot(x - a.x, y - a.y) - Math.hypot(x - b.x, y - b.y))[0];
  if (!sourcePortal) throw new SenderError("Maps are not connected.");
  // Movement is client-authoritative. Validate the coordinate from this
  // discrete portal action instead of a potentially one-heartbeat-old
  // player_motion sample, then move to the destination atomically.
  const portalDistance = Math.hypot(x - sourcePortal.x, y - sourcePortal.y);
  if (portalDistance > MAP_PORTAL_USE_RANGE) throw new SenderError("Move closer to the portal.");

  transitionPlayerMap(ctx, current, mapId, arrivalFor(mapId, current.mapId, { x, y }));
}

/** The Town teleport from another map: remembers where Fight goes back to, then lands at `arrival`. */
function enterTown(ctx: ModuleReducerCtx, current: any, x: number, y: number, arrival: { x: number; y: number }) {
  if (![x, y].every(Number.isFinite) || x < PLAYER_RADIUS || y < PLAYER_RADIUS || x > worldBoundsFor(current.mapId).width - PLAYER_RADIUS || y > worldBoundsFor(current.mapId).height - PLAYER_RADIUS) throw new SenderError("Invalid teleport position.");
  const saved = { identity: ctx.sender, mapId: current.mapId, x, y, facing: current.facing };
  if (isGuildHallMap(current.mapId) || current.mapId === HOME_EXTERIOR_MAP_ID) { /* "Fight" from the Town still goes back to where the fighting was */ } else if (ctx.db.homeReturnLocation.identity.find(ctx.sender)) ctx.db.homeReturnLocation.identity.update(saved);
  else ctx.db.homeReturnLocation.insert(saved);
  transitionPlayerMap(ctx, current, TOWN_MAP_ID, arrival);
}

/**
 * The Research Ready hint's tap: the Town teleport, with its checks, landing inside the Research building
 * instead of on the square. In the Town it only ever moves a player into that room.
 */
export function teleportToResearchRoom(ctx: ModuleReducerCtx, { x, y }: { x: number; y: number }) {
  const current = requireControllingPlayer(ctx);
  if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish the duel before using a portal.");
  if (current.hp <= 0) throw new SenderError("Respawn before teleporting to the Town.");
  const inside = TOWN_DOORS[TOWN_RESEARCH_POSITION.door].inside;
  if (isTownMap(current.mapId)) transitionPlayerMap(ctx, current, TOWN_MAP_ID, inside);
  else enterTown(ctx, current, x, y, inside);
  persistWorldLocation(ctx, ctx.db.player.identity.find(ctx.sender));
}

/** The Town button from the Copper Hills or Timberwood: back to the square, inside the Town only. */
export function teleportToTownSquare(ctx: ModuleReducerCtx) {
  const current = requireControllingPlayer(ctx);
  if (!isTownMap(current.mapId)) throw new SenderError("Teleport to the Town first.");
  if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish the duel before using a portal.");
  if (current.hp <= 0) throw new SenderError("Respawn before teleporting to the Town.");
  transitionPlayerMap(ctx, current, TOWN_MAP_ID, TOWN_ARRIVAL);
  persistWorldLocation(ctx, ctx.db.player.identity.find(ctx.sender));
}

/**
 * The Map Guide's Travel: straight to an open campaign or Endless map from any map, with the Town travel portal's
 * checks, landing where that portal would put the player.
 */
export function travelToMap(ctx: ModuleReducerCtx, { mapId }: { mapId: string }) {
  const current = requireControllingPlayer(ctx);
  if (activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish the duel before using a portal.");
  if (current.hp <= 0) throw new SenderError("Respawn before travelling.");
  if (mapId === current.mapId) return;
  if (!VALID_MAP_IDS.has(mapId) || !((MAP_IDS as readonly string[]).includes(mapId) || isProceduralMap(mapId)) || isTownMap(mapId)) {
    throw new SenderError("Unsupported map destination.");
  }
  const locked = lockedReason(ctx, mapId);
  if (locked) throw new SenderError(locked);
  const [portal] = townPortalUsePoints(mapId);
  transitionPlayerMap(ctx, current, mapId, arrivalFor(mapId, TOWN_MAP_ID, portal));
  persistWorldLocation(ctx, ctx.db.player.identity.find(ctx.sender));
}

/** Why a campaign or Endless map is still shut to the caller, or null when it is open. */
function lockedReason(ctx: ModuleReducerCtx, mapId: string) {
  const currentProgress = readPlayerProgress(ctx, ctx.sender);
  const campaignIndex = CAMPAIGN_MAPS.findIndex(map => map.id === mapId);
  if (campaignIndex > 0 && !campaignMapUnlocked(campaignIndex, currentProgress ?? {})) {
    return `Defeat ${CAMPAIGN_MAPS[campaignIndex - 1].bossName} before entering ${MAP_DISPLAY_NAMES[mapId]}.`;
  }
  if (isProceduralMap(mapId) && !generatedMapUnlocked(mapId,
    ctx.db.proceduralProgress.identity.find(ctx.sender)?.completed ?? 0,
    Boolean(currentProgress && (currentProgress.bossRewardClaims & BOSS_REWARD_CLAIM_BITS[PROCEDURAL_ENTRY_BOSS])))) {
    return "Defeat the previous map's boss first.";
  }
  return null;
}

/**
 * Where arriving on a map from `from` lands: on a campaign or Endless map, out of its portal back, at a point drawn
 * from where the traveller stood (`at`) so the client lands them on the same spot.
 */
function arrivalFor(mapId: string, from: string, at: { x: number; y: number }) {
  const exit = exitPortalFor(mapId, destinationPortals(mapId), from, isTownMap(from));
  return (exit ? portalArrival(exit, at) : null) ?? (isProceduralMap(mapId) ? generateMap(mapId).arrival : isSoulMap(mapId) ? SOUL_ARRIVAL : isTownMap(mapId) ? TOWN_ARRIVAL : MAP_ARRIVALS[mapId as keyof typeof MAP_ARRIVALS]);
}

/**
 * Onward (Warden II card, among the `worn` cards): after the caller's boss kill on `mapId` opened the next map, moves them there, landing
 * where its portal would. Not when dead, during a duel or an Aggro run, or once they have left that map.
 */
export function travelOnward(ctx: ModuleReducerCtx, mapId: string, worn: CardTotals) {
  if (!cardStatFactors(worn).onward) return false;
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player || player.hp <= 0 || player.mapId !== mapId) return false;
  if (activeDuelFor(ctx, ctx.sender) || aggroChallengeActive(ctx, ctx.sender)) return false;
  const next = nextMapAfter(mapId);
  if (!next || !VALID_MAP_IDS.has(next) || lockedReason(ctx, next)) return false;
  persistWorldLocation(ctx, transitionPlayerMap(ctx, player, next, arrivalFor(next, mapId, player)));
  return true;
}

/** A campaign or Endless map's portals, as its players see them; none for the Town, Home or the Soul Dimension. */
export function destinationPortals(mapId: string) {
  if (isProceduralMap(mapId)) return generateMap(mapId).portals;
  return [...(CAMPAIGN_GATEWAYS[mapId]?.portals ?? []), ...(mapId === PROCEDURAL_ENTRY_MAP ? [endlessEntryPortal(proceduralMapId(1))] : [])];
}

export function hasEndlessTravelAccess(ctx: GameViewContext | GameReducerContext, identity: Identity) {
  return isDeveloperIdentity(identity) || Boolean(ctx.db.endlessTravelAccess.identity.find(identity));
}
