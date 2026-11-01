import { SenderError, table, t } from "spacetimedb/server";
import { Timestamp, type Identity } from "spacetimedb";
import type spacetimedbType from "./index";
import {
  WOOD_STANDS, WOODCUTTING_RATE_SLACK, WOODCUTTING_RESPAWN_SECONDS, WOODCUTTING_SERVER_REACH, canChopTree, normalizeWoodcutting, woodcuttingChopSeconds,
  woodcuttingGain, woodcuttingYield, woodStandHint, woodTree,
} from "../../shared/woodcutting";
import type { OreId } from "../../shared/refine";
import { TOWN_FEET_OFFSET } from "../../shared/town";
import { isTownMap } from "./town";
import { withinStationReach } from "./door-reach";
import { readPlayerProgress } from "./wide-stats";
import { addOres, oreCountsFor } from "./item-refine";
import { extraCopiesOf } from "./equipment-copies";
import { bagCapacityFor } from "./bag-capacity";
import { bagFullForOres, roomForOres } from "../../shared/ore-bag";
import type { MiningDeps } from "./mining";
import { toolBonusYield } from "../../shared/tools";
import { toolLevelFor } from "./tools";
import { boostedYield } from "../../shared/server-boost";
import { serverBoostGatherMultiplierAt } from "./server-boost-tables";
import { researchRankFor } from "./research-rank";
import { gatherRespawnMs } from "../../shared/gather-respawn";
import { cardStatFactors } from "../../shared/card-effects";
import { withCourtyardFind } from "./guild-hall-bonus";
import { activeCardTotalsFor } from "./active-cards";
import { awardTreeCardDrops } from "./card-drops";
import {
  equippedFields, gatherClaims, gatherFreeSlots, gatherReach, judgeGatherBatch, logOddGatherRejections, millisOf, progressOnce,
} from "./gather-batch";

/**
 * Woodcutting (shared/woodcutting.ts), as mining is (mining.ts): a player's Woodcutting stat and the trees they
 * felled that have yet to grow back, for them alone. Private tables, read through the caller's own views; the stat
 * is copied to a public table for profiles.
 *
 * Every player holds a hatchet. No player_woodcutting row means no tree felled yet, and Woodcutting 0. `treesChopped`
 * counts up with every fall, so the client can tell a new one from the row it found on connect; `lastTreeId` says
 * which tree that was.
 */
export const playerWoodcutting = table({ name: "player_woodcutting", public: false }, {
  identity: t.identity().primaryKey(),
  woodcutting: t.u32(),
  treesChopped: t.u32(),
  hatchetAt: t.timestamp(),
  lastChopAt: t.timestamp(),
  lastTreeId: t.u32(),
});

/** A tree a player felled, until it grows back for them. Rows that have grown back are cleared as they chop. */
export const playerChoppedTree = table({ name: "player_chopped_tree", public: false }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  treeId: t.u32(),
  choppedAt: t.timestamp(),
});

/** Each player's Woodcutting stat, public, for profiles; writeWoodcuttingLevel keeps it in step. */
export const playerWoodcuttingLevel = table({ name: "player_woodcutting_level", public: true }, {
  identity: t.identity().primaryKey(),
  woodcutting: t.u32(),
});

type Ctx = any;
const U32_MAX = 4_294_967_295;

/** Copies a player's Woodcutting stat to player_woodcutting_level, or removes it with no row. */
export function writeWoodcuttingLevel(ctx: Ctx, identity: Identity) {
  const row = ctx.db.playerWoodcutting.identity.find(identity), level = ctx.db.playerWoodcuttingLevel.identity.find(identity);
  if (!row) { if (level) ctx.db.playerWoodcuttingLevel.identity.delete(identity); return; }
  const woodcutting = normalizeWoodcutting(row.woodcutting);
  if (!level) ctx.db.playerWoodcuttingLevel.insert({ identity, woodcutting });
  else if (level.woodcutting !== woodcutting) ctx.db.playerWoodcuttingLevel.identity.update({ identity, woodcutting });
}

export const choppedTreeKey = (identity: { toHexString(): string }, treeId: number) => `${identity.toHexString()}:${treeId}`;

const microsSince = (ctx: Ctx, at: { microsSinceUnixEpoch: bigint }) => Number(ctx.timestamp.microsSinceUnixEpoch - at.microsSinceUnixEpoch);
/** How long a tree takes to grow back for a player with this Resource Respawn rank (shared/gather-respawn.ts). */
const treeRespawnMs = (rank: number) => gatherRespawnMs(WOODCUTTING_RESPAWN_SECONDS, rank);
const respawnRankFor = (ctx: Ctx, identity: Identity) => researchRankFor(ctx, identity, "resourceRespawn");
const grownBack = (ctx: Ctx, row: { choppedAt: { microsSinceUnixEpoch: bigint } }, rank: number) => microsSince(ctx, row.choppedAt) >= treeRespawnMs(rank) * 1_000;

/** The player's Woodcutting stat; 0 before their first tree. */
export function woodcuttingFor(ctx: Ctx, identity: Identity) {
  return normalizeWoodcutting(ctx.db.playerWoodcutting.identity.find(identity)?.woodcutting);
}

/** Whether a tree is a stump for this player: felled by them less than its regrowth ago. */
export function treeFelledFor(ctx: Ctx, identity: Identity, treeId: number) {
  const row = ctx.db.playerChoppedTree.key.find(choppedTreeKey(identity, treeId));
  return Boolean(row && !grownBack(ctx, row, respawnRankFor(ctx, identity)));
}

/** Clears the player's rows for trees that have grown back: only the stumps are kept. */
function pruneChoppedTrees(ctx: Ctx, identity: Identity) {
  const rank = respawnRankFor(ctx, identity);
  for (const row of [...ctx.db.playerChoppedTree.identity.filter(identity)]) {
    if (grownBack(ctx, row, rank)) ctx.db.playerChoppedTree.key.delete(row.key);
  }
}

function rowsOf(handle: any, identity: Identity): any[] {
  return [...handle.identity.filter(identity)];
}

/** Reset Save and a deleted account take Woodcutting and the stumps. Prestige keeps them all. */
export function removeWoodcuttingData(ctx: Ctx, identity: Identity) {
  if (ctx.db.playerWoodcutting.identity.find(identity)) ctx.db.playerWoodcutting.identity.delete(identity);
  writeWoodcuttingLevel(ctx, identity);
  for (const row of rowsOf(ctx.db.playerChoppedTree, identity)) ctx.db.playerChoppedTree.key.delete(row.key);
}

/** A guest's save replaces the account's on link (mergeMiningData), Woodcutting with it. */
export function mergeWoodcuttingData(ctx: Ctx, guest: Identity, account: Identity) {
  removeWoodcuttingData(ctx, account);
  const woodcutting = ctx.db.playerWoodcutting.identity.find(guest);
  if (woodcutting) {
    ctx.db.playerWoodcutting.identity.delete(guest);
    ctx.db.playerWoodcutting.insert({ ...woodcutting, identity: account });
    writeWoodcuttingLevel(ctx, guest);
    writeWoodcuttingLevel(ctx, account);
  }
  for (const row of rowsOf(ctx.db.playerChoppedTree, guest)) {
    ctx.db.playerChoppedTree.key.delete(row.key);
    ctx.db.playerChoppedTree.insert({ ...row, key: choppedTreeKey(account, row.treeId), identity: account });
  }
}

/** The Smith's hatchet reducer, still called by older clients: only starts the row. */
export function claimHatchetFor(ctx: Ctx, deps: MiningDeps) {
  deps.requireControllingPlayer(ctx);
  if (ctx.db.playerWoodcutting.identity.find(ctx.sender)) return;
  ctx.db.playerWoodcutting.insert({ identity: ctx.sender, woodcutting: 0, treesChopped: 0, hatchetAt: ctx.timestamp, lastChopAt: ctx.timestamp, lastTreeId: 0 });
  writeWoodcuttingLevel(ctx, ctx.sender);
}

/**
 * One felled tree, judged as a broken rock is (mineNodeFor): from where the server last heard the player stood
 * (with the walk since), no sooner than the tree allows after their last fall, and only from a tree that is not
 * still a stump for them.
 */
export function chopTreeFor(ctx: Ctx, args: { treeId: number }, deps: MiningDeps) {
  const player = deps.requireControllingPlayer(ctx);
  const tree = woodTree(args.treeId);
  if (!tree) throw new SenderError("There is no tree there.");
  // Every player holds a hatchet; the row comes with the first tree.
  const woodcutting = ctx.db.playerWoodcutting.identity.find(ctx.sender), skill = normalizeWoodcutting(woodcutting?.woodcutting);
  if (!isTownMap(player.mapId) || !withinStationReach(ctx, player, { x: tree.x, y: tree.y - TOWN_FEET_OFFSET }, WOODCUTTING_SERVER_REACH)) {
    throw new SenderError("Walk up to the tree first.");
  }
  if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
  if (!canChopTree(tree, skill)) throw new SenderError(woodStandHint(WOOD_STANDS[tree.stand]));
  // A kind of log not held yet needs a free bag slot before the tree falls; with it held, the bag is not read.
  const ores = oreCountsFor(ctx, ctx.sender);
  if (!((ores[tree.log] ?? 0) > 0)) {
    const progress = readPlayerProgress(ctx, ctx.sender);
    const { needed, room } = roomForOres({
      owned: progress && deps.inventoryForProgress ? deps.inventoryForProgress(progress) : [], equipped: progress ? equippedFields(progress) : [],
      extraCopies: extraCopiesOf(ctx, ctx.sender).length, ores, capacity: bagCapacityFor(ctx, ctx.sender),
    }, [tree.log]);
    if (!room) throw new SenderError(bagFullForOres(needed));
  }
  pruneChoppedTrees(ctx, ctx.sender);
  if (treeFelledFor(ctx, ctx.sender, tree.id)) throw new SenderError("That tree is still growing back.");
  // Chop Speed and Log Find cards among the active cards.
  const hatchet = toolLevelFor(ctx, ctx.sender, "hatchet"), cards = withCourtyardFind(ctx, ctx.sender, cardStatFactors(activeCardTotalsFor(ctx, ctx.sender)));
  if (woodcutting && microsSince(ctx, woodcutting.lastChopAt) < woodcuttingChopSeconds(tree, skill, hatchet, cards.woodcuttingSpeed) * WOODCUTTING_RATE_SLACK * 1_000_000) {
    throw new SenderError("Still chopping.");
  }
  const logs = boostedYield(woodcuttingYield(tree, hatchet > 0 ? toolBonusYield(hatchet, ctx.random()) : 0, cards.logFind,
    cards.logFind > 0 ? ctx.random() : 1), serverBoostGatherMultiplierAt(ctx, millisOf(ctx.timestamp)));
  for (const [logId, count] of Object.entries(logs)) addOres(ctx, ctx.sender, logId as OreId, count ?? 0);
  awardTreeCardDrops(ctx, ctx.sender, [tree]);
  const row = {
    identity: ctx.sender,
    woodcutting: Math.min(U32_MAX, skill + woodcuttingGain(tree)),
    treesChopped: ((woodcutting?.treesChopped ?? 0) + 1) % (U32_MAX + 1),
    hatchetAt: woodcutting?.hatchetAt ?? ctx.timestamp,
    lastChopAt: ctx.timestamp,
    lastTreeId: tree.id,
  };
  if (woodcutting) ctx.db.playerWoodcutting.identity.update(row);
  else ctx.db.playerWoodcutting.insert(row);
  writeWoodcuttingLevel(ctx, ctx.sender);
  const key = choppedTreeKey(ctx.sender, tree.id), stump = ctx.db.playerChoppedTree.key.find(key);
  if (stump) ctx.db.playerChoppedTree.key.update({ ...stump, choppedAt: ctx.timestamp });
  else ctx.db.playerChoppedTree.insert({ key, identity: ctx.sender, treeId: tree.id, choppedAt: ctx.timestamp });
}

/** Every tree felled since the last report, judged and written as a mining report is (reportMiningFor). */
export function reportChoppingFor(ctx: Ctx, args: { chops: readonly { treeId: number; atMs: bigint | number }[] }, deps: MiningDeps) {
  const claims = gatherClaims(args.chops, "treeId");
  const player = deps.requireControllingPlayer(ctx);
  if (!claims.length) return;
  if (!isTownMap(player.mapId)) throw new SenderError("Walk up to the tree first.");
  if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
  const woodcutting = ctx.db.playerWoodcutting.identity.find(ctx.sender), skill = normalizeWoodcutting(woodcutting?.woodcutting);
  const rows = new Map<number, any>();
  for (const row of ctx.db.playerChoppedTree.identity.filter(ctx.sender) as Iterable<any>) rows.set(row.treeId, row);
  const hatchet = toolLevelFor(ctx, ctx.sender, "hatchet"), cards = withCourtyardFind(ctx, ctx.sender, cardStatFactors(activeCardTotalsFor(ctx, ctx.sender)));
  const ores = oreCountsFor(ctx, ctx.sender), progress = progressOnce(ctx, ctx.sender), rank = respawnRankFor(ctx, ctx.sender);
  const { accepted, rejected, skill: reached } = judgeGatherBatch(claims, {
    node: woodTree, canWork: canChopTree, gain: woodcuttingGain, slack: WOODCUTTING_RATE_SLACK, reach: WOODCUTTING_SERVER_REACH,
    seconds: (tree, at) => woodcuttingChopSeconds(tree, at, hatchet, cards.woodcuttingSpeed), respawnMs: () => treeRespawnMs(rank), kinds: tree => [tree.log],
  }, {
    nowMs: millisOf(ctx.timestamp), lastAtMs: woodcutting ? millisOf(woodcutting.lastChopAt) : null, skill,
    brokenAtMs: new Map([...rows.values()].map(row => [row.treeId, millisOf(row.choppedAt)])),
    within: gatherReach(ctx, player, progress), held: new Set(Object.keys(ores) as OreId[]),
    freeSlots: gatherFreeSlots(ctx, ctx.sender, ores, progress, deps.inventoryForProgress),
  });
  logOddGatherRejections("Woodcutting", ctx.sender, rejected);
  const last = new Map<number, number>();
  for (const { node, atMs } of accepted) last.set(node.id, atMs);
  for (const row of rows.values()) if (!last.has(row.treeId) && grownBack(ctx, row, rank)) ctx.db.playerChoppedTree.key.delete(row.key);
  if (!accepted.length) return;
  const gained: Partial<Record<OreId, number>> = {};
  for (const { node, atMs } of accepted) {
    // A Server Boost doubles the logs, judged at the fall's own time; the count of falls is unchanged.
    const logs = boostedYield(woodcuttingYield(node, hatchet > 0 ? toolBonusYield(hatchet, ctx.random()) : 0, cards.logFind,
      cards.logFind > 0 ? ctx.random() : 1), serverBoostGatherMultiplierAt(ctx, atMs));
    for (const [logId, count] of Object.entries(logs)) gained[logId as OreId] = (gained[logId as OreId] ?? 0) + (count ?? 0);
  }
  for (const [logId, count] of Object.entries(gained)) addOres(ctx, ctx.sender, logId as OreId, count ?? 0);
  awardTreeCardDrops(ctx, ctx.sender, accepted.map(({ node }) => node));
  const final = accepted[accepted.length - 1], at = (ms: number) => new Timestamp(BigInt(Math.round(ms)) * 1_000n);
  const row = {
    identity: ctx.sender,
    woodcutting: Math.min(U32_MAX, reached),
    treesChopped: ((woodcutting?.treesChopped ?? 0) + accepted.length) % (U32_MAX + 1),
    hatchetAt: woodcutting?.hatchetAt ?? ctx.timestamp,
    lastChopAt: at(final.atMs),
    lastTreeId: final.node.id,
  };
  if (woodcutting) ctx.db.playerWoodcutting.identity.update(row);
  else ctx.db.playerWoodcutting.insert(row);
  writeWoodcuttingLevel(ctx, ctx.sender);
  for (const [treeId, atMs] of last) {
    const stump = rows.get(treeId);
    if (stump) ctx.db.playerChoppedTree.key.update({ ...stump, choppedAt: at(atMs) });
    else ctx.db.playerChoppedTree.insert({ key: choppedTreeKey(ctx.sender, treeId), identity: ctx.sender, treeId, choppedAt: at(atMs) });
  }
}

const TreeChopEntry = t.object("TreeChopEntry", { treeId: t.u32(), atMs: t.u64() });

/** A fall, a batch of them, the hatchet claim, and the caller's own Woodcutting and stumps. */
export function registerWoodcutting(spacetimedb: typeof spacetimedbType, deps: MiningDeps) {
  const claimHatchet = spacetimedb.reducer({}, (ctx: any) => claimHatchetFor(ctx, deps));
  const chopTree = spacetimedb.reducer({ treeId: t.u32() }, (ctx: any, args: { treeId: number }) => chopTreeFor(ctx, args, deps));
  const reportChopping = spacetimedb.reducer({ chops: t.array(TreeChopEntry) }, (ctx: any, args: any) => reportChoppingFor(ctx, args, deps));
  const myWoodcutting = spacetimedb.view({ name: "my_woodcutting", public: true }, t.array(playerWoodcutting.rowType), (ctx: any) => {
    const row = ctx.db.playerWoodcutting.identity.find(ctx.sender);
    return row ? [row] : [];
  });
  const myChoppedTrees = spacetimedb.view({ name: "my_chopped_trees", public: true }, t.array(playerChoppedTree.rowType),
    (ctx: any) => [...ctx.db.playerChoppedTree.identity.filter(ctx.sender)]);
  return { claimHatchet, chopTree, reportChopping, myWoodcutting, myChoppedTrees };
}
