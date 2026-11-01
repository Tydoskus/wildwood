import { SenderError, table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type spacetimedbType from "./index";
import { BUILD_SLOTS, cleanBuildName, parseBuildCards, parseBuildGear, type BuildGear } from "../../shared/builds";
import { isArrowId } from "../../shared/arrows";
import { nockedArrowFor, setNockedArrow } from "./arrows";
import { activeCardsFor, restoreActiveCards } from "./active-cards";
import { readPlayerProgress } from "./wide-stats";

/**
 * A player's saved Builds: the gear in each slot and the active cards by type, as they were when saved.
 * Equipping one puts the gear on from the client (the ordinary equip path) and the cards back on here.
 * Older builds hold cards by item; parseBuildCards reads those by each card's type.
 */
export const playerBuild = table({ name: "player_build", public: false }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  slot: t.u8(),
  gearJson: t.string(),
  cardsJson: t.string(),
  savedAt: t.timestamp(),
});

/** A Build's name, kept apart so the Builds a client reads keep their shape (no client has to reload for it). */
export const playerBuildName = table({ name: "player_build_name", public: false }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  slot: t.u8(),
  name: t.string(),
});

type Ctx = any;
export const buildKey = (identity: Identity, slot: number) => `${identity.toHexString()}:${slot}`;

export type BuildDeps = {
  requireControllingPlayer: (ctx: Ctx) => any;
  activeDuelFor: (ctx: Ctx, identity: Identity) => unknown;
  /** Stats, power and the attack speed cap follow the cards in play. */
  afterCardsChanged: (ctx: Ctx, identity: Identity) => void;
};

const validSlot = (slot: number) => {
  if (!Number.isInteger(slot) || slot < 0 || slot >= BUILD_SLOTS) throw new SenderError("That build does not exist.");
};

/** Saves what the player wears now, and the active cards, into a build slot. */
export function saveBuildFor(ctx: Ctx, { slot }: { slot: number }, deps: BuildDeps) {
  deps.requireControllingPlayer(ctx);
  validSlot(slot);
  const progress = readPlayerProgress(ctx, ctx.sender);
  if (!progress) throw new SenderError("Character unavailable.");
  const gear: BuildGear = { HEAD: progress.equippedHead || "", CHEST: progress.equippedChest || "", FEET: progress.equippedFeet || "", HAND: progress.equippedRightHand || "",
    ARROW: nockedArrowFor(ctx, ctx.sender) ?? "" };
  const cards = activeCardsFor(ctx, ctx.sender);
  const row = { key: buildKey(ctx.sender, slot), identity: ctx.sender, slot, gearJson: JSON.stringify(gear), cardsJson: JSON.stringify(cards), savedAt: ctx.timestamp };
  if (ctx.db.playerBuild.key.find(row.key)) ctx.db.playerBuild.key.update(row);
  else ctx.db.playerBuild.insert(row);
}

/**
 * Puts the build's active cards back: copies no longer owned are skipped, and each type keeps as many as its
 * slots in play; and nocks the arrow it was saved with (a build from before arrows leaves the nock alone). The
 * client equips the gear before calling this.
 */
export function applyBuildCardsFor(ctx: Ctx, { slot }: { slot: number }, deps: BuildDeps) {
  deps.requireControllingPlayer(ctx);
  validSlot(slot);
  if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
  const build = ctx.db.playerBuild.key.find(buildKey(ctx.sender, slot));
  if (!build) throw new SenderError("Save this build first.");
  if (!readPlayerProgress(ctx, ctx.sender)) throw new SenderError("Character unavailable.");
  restoreActiveCards(ctx, ctx.sender, parseBuildCards(build.cardsJson));
  const arrow = parseBuildGear(build.gearJson).ARROW;
  if (arrow !== undefined) setNockedArrow(ctx, ctx.sender, isArrowId(arrow) ? arrow : null);
  deps.afterCardsChanged(ctx, ctx.sender);
}

/** Names a build slot; an empty name gives it back its number ("Build 1"). */
export function renameBuildFor(ctx: Ctx, { slot, name }: { slot: number; name: string }, deps: BuildDeps) {
  deps.requireControllingPlayer(ctx);
  validSlot(slot);
  const clean = cleanBuildName(name), key = buildKey(ctx.sender, slot);
  const existing = ctx.db.playerBuildName.key.find(key);
  if (!clean) { if (existing) ctx.db.playerBuildName.key.delete(key); return; }
  const row = { key, identity: ctx.sender, slot, name: clean };
  if (existing) ctx.db.playerBuildName.key.update(row); else ctx.db.playerBuildName.insert(row);
}

export function registerBuilds(spacetimedb: typeof spacetimedbType, deps: BuildDeps) {
  const saveBuild = spacetimedb.reducer({ slot: t.u8() }, (ctx: any, args: { slot: number }) => saveBuildFor(ctx, args, deps));
  const applyBuildCards = spacetimedb.reducer({ slot: t.u8() }, (ctx: any, args: { slot: number }) => applyBuildCardsFor(ctx, args, deps));
  const renameBuild = spacetimedb.reducer({ slot: t.u8(), name: t.string() }, (ctx: any, args: { slot: number; name: string }) => renameBuildFor(ctx, args, deps));
  const myBuilds = spacetimedb.view({ name: "my_builds", public: true }, t.array(playerBuild.rowType),
    (ctx: any) => [...ctx.db.playerBuild.identity.filter(ctx.sender)]);
  const myBuildNames = spacetimedb.view({ name: "my_build_names", public: true }, t.array(playerBuildName.rowType),
    (ctx: any) => [...ctx.db.playerBuildName.identity.filter(ctx.sender)]);
  return { saveBuild, applyBuildCards, renameBuild, myBuilds, myBuildNames };
}

