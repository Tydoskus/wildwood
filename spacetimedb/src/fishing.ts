import { keepsCombatProfile } from "./combat-profile";
import { SenderError, table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type spacetimedbType from "./index";
import {
  FISHING_MOVE_GRACE_MS, FISHING_RATE_SLACK, FISHING_SERVER_REACH, FISHING_SPOTS, fishingCatchSeconds, fishingLevel, fishingSpotAt, normalizeFishingExperience, rollFish,
} from "../../shared/fishing";
import type { OreId } from "../../shared/refine";
import { TOWN_FEET_OFFSET } from "../../shared/town";
import { isTownMap } from "./town";
import { withinStationReach } from "./door-reach";
import { readPlayerProgress } from "./wide-stats";
import { addOres, oreCountsFor } from "./item-refine";
import { extraCopiesOf } from "./equipment-copies";
import { bagCapacityFor } from "./bag-capacity";
import { roomForOres } from "../../shared/ore-bag";
import type { MiningDeps } from "./mining";
import { equippedFields, millisOf } from "./gather-batch";

/**
 * Fishing (shared/fishing.ts): a player's Fishing experience and their last catch, in a private table read through
 * the caller's own view; the level is copied to a public table for profiles. Fish go into the bag as ores do and are
 * only for collecting: no Server Boost, cards or card drops.
 *
 * No player_fishing row means no fish caught yet: level 1, no experience. `fishCaught` counts up with every catch,
 * so the client can tell a new one from the row it found on connect; `lastFish` says which fish that was.
 */
export const playerFishing = table({ name: "player_fishing", public: false }, {
  identity: t.identity().primaryKey(),
  experience: t.u32(),
  fishCaught: t.u32(),
  lastCatchAt: t.timestamp(),
  lastFish: t.string(),
});

/** Each player's Fishing level, public, for profiles; writeFishingLevel keeps it in step. */
export const playerFishingLevel = table({ name: "player_fishing_level", public: true }, {
  identity: t.identity().primaryKey(),
  level: t.u32(),
});

type Ctx = any;
const U32_MAX = 4_294_967_295;

/** Copies a player's Fishing level to player_fishing_level, or removes it with no row. */
export function writeFishingLevel(ctx: Ctx, identity: Identity) {
  const row = ctx.db.playerFishing.identity.find(identity), level = ctx.db.playerFishingLevel.identity.find(identity);
  if (!row) { if (level) ctx.db.playerFishingLevel.identity.delete(identity); return; }
  const reached = fishingLevel(row.experience);
  if (!level) ctx.db.playerFishingLevel.insert({ identity, level: reached });
  else if (level.level !== reached) ctx.db.playerFishingLevel.identity.update({ identity, level: reached });
}

/** Reset Save and a deleted account take Fishing. Prestige keeps it. */
export function removeFishingData(ctx: Ctx, identity: Identity) {
  if (ctx.db.playerFishing.identity.find(identity)) ctx.db.playerFishing.identity.delete(identity);
  writeFishingLevel(ctx, identity);
}

/** A guest's save replaces the account's on link, Fishing with it. */
export function mergeFishingData(ctx: Ctx, guest: Identity, account: Identity) {
  removeFishingData(ctx, account);
  const fishing = ctx.db.playerFishing.identity.find(guest);
  if (!fishing) return;
  ctx.db.playerFishing.identity.delete(guest);
  ctx.db.playerFishing.insert({ ...fishing, identity: account });
  writeFishingLevel(ctx, guest);
  writeFishingLevel(ctx, account);
}

/** Whether the spot stood at this site now, or a moment ago: a catch may land just after the spot moved on. */
function spotWasAt(spot: number, site: number, nowMs: number) {
  return fishingSpotAt(spot, nowMs).site === site || fishingSpotAt(spot, nowMs - FISHING_MOVE_GRACE_MS).site === site;
}

/**
 * One catch: from where the server last heard the player stood (with the walk since), within reach of a spot's
 * site while the spot is there, and no sooner than the wait for a bite after their last catch.
 */
export function catchFishFor(ctx: Ctx, args: { spot: number; site: number }, deps: MiningDeps) {
  const player = deps.requireControllingPlayer(ctx);
  const spot = FISHING_SPOTS[args.spot], point = spot?.sites[args.site];
  if (!spot || !point || !Number.isInteger(args.spot) || !Number.isInteger(args.site)) throw new SenderError("There is no fishing spot there.");
  if (!spotWasAt(args.spot, args.site, millisOf(ctx.timestamp))) throw new SenderError("The fishing spot moved.");
  if (!isTownMap(player.mapId) || !withinStationReach(ctx, player, { x: point.x, y: point.y - TOWN_FEET_OFFSET }, FISHING_SERVER_REACH)) {
    throw new SenderError("Walk up to the fishing spot first.");
  }
  if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
  const row = ctx.db.playerFishing.identity.find(ctx.sender), experience = normalizeFishingExperience(row?.experience);
  const sinceMicros = row ? Number(ctx.timestamp.microsSinceUnixEpoch - row.lastCatchAt.microsSinceUnixEpoch) : Infinity;
  if (sinceMicros < fishingCatchSeconds(experience) * FISHING_RATE_SLACK * 1_000_000) throw new SenderError("Still fishing.");
  // A fish not held yet needs a free bag slot; with none, one of the kinds already held bites instead.
  const ores = oreCountsFor(ctx, ctx.sender), held = (fishId: string) => (ores[fishId as OreId] ?? 0) > 0;
  let fish = rollFish(experience, ctx.random());
  if (fish && !held(fish.id)) {
    const progress = readPlayerProgress(ctx, ctx.sender);
    const { room } = roomForOres({
      owned: progress && deps.inventoryForProgress ? deps.inventoryForProgress(progress) : [], equipped: progress ? equippedFields(progress) : [],
      extraCopies: extraCopiesOf(ctx, ctx.sender).length, ores, capacity: bagCapacityFor(ctx, ctx.sender),
    }, [fish.id]);
    if (!room) fish = rollFish(experience, ctx.random(), candidate => held(candidate.id));
  }
  if (!fish) throw new SenderError("Your bag is full. Free a slot for your fish.");
  addOres(ctx, ctx.sender, fish.id, 1);
  const next = {
    identity: ctx.sender,
    experience: Math.min(U32_MAX, experience + fish.experience),
    fishCaught: ((row?.fishCaught ?? 0) + 1) % (U32_MAX + 1),
    lastCatchAt: ctx.timestamp,
    lastFish: fish.id,
  };
  if (row) ctx.db.playerFishing.identity.update(next);
  else ctx.db.playerFishing.insert(next);
  writeFishingLevel(ctx, ctx.sender);
}

/** A catch, and the caller's own Fishing. */
export function registerFishing(spacetimedb: typeof spacetimedbType, deps: MiningDeps) {
  const catchFish = spacetimedb.reducer({ spot: t.u32(), site: t.u32() },
    keepsCombatProfile((ctx: any, args: { spot: number; site: number }) => catchFishFor(ctx, args, deps)));
  const myFishing = spacetimedb.view({ name: "my_fishing", public: true }, t.array(playerFishing.rowType), (ctx: any) => {
    const row = ctx.db.playerFishing.identity.find(ctx.sender);
    return row ? [row] : [];
  });
  return { catchFish, myFishing };
}
