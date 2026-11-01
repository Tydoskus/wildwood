import { SenderError, table, t } from "spacetimedb/server";
import { Timestamp, type Identity } from "spacetimedb";
import { cardStatFactors } from "../../shared/card-effects";
import { withCourtyardFind } from "./guild-hall-bonus";
import { activeCardTotalsFor } from "./active-cards";
import type spacetimedbType from "./index";
import {
  MINING_NODE_KINDS, MINING_RATE_SLACK, MINING_SERVER_REACH, canMineRock, miningBreakSeconds, miningGain, miningNode, miningRockHint, miningYield,
  normalizeMining, type MiningNode,
} from "../../shared/mining";
import type { OreId } from "../../shared/refine";
import { TOWN_FEET_OFFSET } from "../../shared/town";
import { isTownMap } from "./town";
import { withinStationReach } from "./door-reach";
import { readPlayerProgress } from "./wide-stats";
import { addOres, oreCountsFor } from "./item-refine";
import { extraCopiesOf } from "./equipment-copies";
import { bagCapacityFor } from "./bag-capacity";
import { luckInPlay } from "./luck-research";
import { researchRankFor } from "./research-rank";
import { gatherRespawnMs } from "../../shared/gather-respawn";
import { bagFullForOres, rockOreKinds, roomForOres } from "../../shared/ore-bag";
import { toolBonusYield } from "../../shared/tools";
import { toolLevelFor } from "./tools";
import { boostedYield } from "../../shared/server-boost";
import { serverBoostGatherMultiplierAt } from "./server-boost-tables";
import {
  equippedFields, gatherClaims, gatherFreeSlots, gatherReach, judgeGatherBatch, logOddGatherRejections, millisOf, progressOnce,
} from "./gather-batch";

/**
 * Mining (shared/mining.ts): a player's Mining stat and the rocks they broke that have yet to grow back. Each player
 * has their own rocks, so a rock is bare for whoever broke it and no one else. Private tables, read through the
 * caller's own views.
 *
 * Every player holds a pickaxe. No player_mining row means no rock broken yet, and Mining 0. `rocksBroken` counts up
 * with every break, so the client can tell a new break from the row it found on connect; `lastNodeId` and
 * `lastStarshard` say what that break gave.
 */
export const playerMining = table({ name: "player_mining", public: false }, {
  identity: t.identity().primaryKey(),
  mining: t.u32(),
  rocksBroken: t.u32(),
  pickaxeAt: t.timestamp(),
  lastBreakAt: t.timestamp(),
  lastNodeId: t.u32(),
  lastStarshard: t.bool(),
});

/** A rock a player broke, until it grows back for them. Rows that have grown back are cleared as they mine. */
export const playerMinedNode = table({ name: "player_mined_node", public: false }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  nodeId: t.u32(),
  brokenAt: t.timestamp(),
});

type Ctx = any;
const U32_MAX = 4_294_967_295;

/** Each player's Mining stat, public, for profiles (player_mining stays private); writeMiningLevel keeps it in step. */
export const playerMiningLevel = table({ name: "player_mining_level", public: true }, {
  identity: t.identity().primaryKey(),
  mining: t.u32(),
});

/** Copies a player's Mining stat to player_mining_level, or removes it with no row. */
export function writeMiningLevel(ctx: Ctx, identity: Identity) {
  const row = ctx.db.playerMining.identity.find(identity), level = ctx.db.playerMiningLevel.identity.find(identity);
  if (!row) { if (level) ctx.db.playerMiningLevel.identity.delete(identity); return; }
  const mining = normalizeMining(row.mining);
  if (!level) ctx.db.playerMiningLevel.insert({ identity, mining });
  else if (level.mining !== mining) ctx.db.playerMiningLevel.identity.update({ identity, mining });
}

/** Fills player_mining_level from every pickaxe already handed out (module migration 56). */
export function backfillMiningLevels(ctx: Ctx) {
  for (const row of [...ctx.db.playerMining.iter()] as any[]) writeMiningLevel(ctx, row.identity);
}

export const minedNodeKey = (identity: { toHexString(): string }, nodeId: number) => `${identity.toHexString()}:${nodeId}`;

const microsSince = (ctx: Ctx, at: { microsSinceUnixEpoch: bigint }) => Number(ctx.timestamp.microsSinceUnixEpoch - at.microsSinceUnixEpoch);
/** The player's Resource Respawn rank: rocks grow back sooner for them (shared/gather-respawn.ts). */
const respawnRankFor = (ctx: Ctx, identity: Identity) => researchRankFor(ctx, identity, "resourceRespawn");
const rockRespawnMs = (node: MiningNode, rank: number) => gatherRespawnMs(MINING_NODE_KINDS[node.kind].respawnSeconds, rank);
const grownBack = (ctx: Ctx, row: { nodeId: number; brokenAt: { microsSinceUnixEpoch: bigint } }, rank: number) => {
  const node = miningNode(row.nodeId);
  return !node || microsSince(ctx, row.brokenAt) >= rockRespawnMs(node, rank) * 1_000;
};

/** The player's Mining stat; 0 before their first rock. */
export function miningFor(ctx: Ctx, identity: Identity) {
  return normalizeMining(ctx.db.playerMining.identity.find(identity)?.mining);
}

/** Whether a rock is bare for this player: broken by them less than its regrowth ago. */
export function nodeBareFor(ctx: Ctx, identity: Identity, node: MiningNode) {
  const row = ctx.db.playerMinedNode.key.find(minedNodeKey(identity, node.id));
  return Boolean(row && !grownBack(ctx, row, respawnRankFor(ctx, identity)));
}

/** Clears the player's rows for rocks that have grown back: only the bare ones are kept. */
function pruneMinedNodes(ctx: Ctx, identity: Identity) {
  const rank = respawnRankFor(ctx, identity);
  for (const row of [...ctx.db.playerMinedNode.identity.filter(identity)]) {
    if (grownBack(ctx, row, rank)) ctx.db.playerMinedNode.key.delete(row.key);
  }
}

function rowsOf(handle: any, identity: Identity): any[] {
  return [...handle.identity.filter(identity)];
}

/** Reset Save and a deleted account take Mining and the bare rocks. Prestige keeps them all. */
export function removeMiningData(ctx: Ctx, identity: Identity) {
  if (ctx.db.playerMining.identity.find(identity)) ctx.db.playerMining.identity.delete(identity);
  writeMiningLevel(ctx, identity);
  for (const row of rowsOf(ctx.db.playerMinedNode, identity)) ctx.db.playerMinedNode.key.delete(row.key);
}

/** A guest's save replaces the account's on link (mergeRefineData), Mining with it. */
export function mergeMiningData(ctx: Ctx, guest: Identity, account: Identity) {
  removeMiningData(ctx, account);
  const mining = ctx.db.playerMining.identity.find(guest);
  if (mining) {
    ctx.db.playerMining.identity.delete(guest);
    ctx.db.playerMining.insert({ ...mining, identity: account });
    writeMiningLevel(ctx, guest);
    writeMiningLevel(ctx, account);
  }
  for (const row of rowsOf(ctx.db.playerMinedNode, guest)) {
    ctx.db.playerMinedNode.key.delete(row.key);
    ctx.db.playerMinedNode.insert({ ...row, key: minedNodeKey(account, row.nodeId), identity: account });
  }
}

export type MiningDeps = {
  requireControllingPlayer: (ctx: Ctx) => any;
  activeDuelFor: (ctx: Ctx, identity: Identity) => unknown;
  /** The bag's items from the saved progress, for its space: each kind of ore takes a slot (shared/ore-bag.ts). */
  inventoryForProgress?: (progress: any) => string[];
};

/** The old Smith's pickaxe, still called by clients from before every player held one: only starts the row. */
export function claimPickaxeFor(ctx: Ctx, deps: MiningDeps) {
  deps.requireControllingPlayer(ctx);
  if (ctx.db.playerMining.identity.find(ctx.sender)) return;
  ctx.db.playerMining.insert({ identity: ctx.sender, mining: 0, rocksBroken: 0, pickaxeAt: ctx.timestamp, lastBreakAt: ctx.timestamp,
    lastNodeId: 0, lastStarshard: false });
  writeMiningLevel(ctx, ctx.sender);
}

/**
 * One broken rock. The client times the swing; the server takes the break from where it last heard the player
 * stood (with the walk since, as a door is judged), no sooner than the rock allows after their last break, and
 * only from a rock that is not still bare for them. The ore is the server's roll.
 */
export function mineNodeFor(ctx: Ctx, args: { nodeId: number }, deps: MiningDeps) {
  const player = deps.requireControllingPlayer(ctx);
  const node = miningNode(args.nodeId);
  if (!node) throw new SenderError("There is no rock there.");
  // Every player holds a pickaxe; the row comes with the first rock.
  const mining = ctx.db.playerMining.identity.find(ctx.sender), skill = normalizeMining(mining?.mining);
  if (!isTownMap(player.mapId) || !withinStationReach(ctx, player, { x: node.x, y: node.y - TOWN_FEET_OFFSET }, MINING_SERVER_REACH)) {
    throw new SenderError("Walk up to the rock first.");
  }
  if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
  if (!canMineRock(node, skill)) throw new SenderError(miningRockHint(node));
  // A kind of ore not held yet needs a free bag slot, for everything the rock could give, before it is broken.
  // With every kind held already, the bag is not read.
  const held = oreCountsFor(ctx, ctx.sender);
  if (rockOreKinds(node).some(oreId => !((held[oreId] ?? 0) > 0))) {
    const progress = readPlayerProgress(ctx, ctx.sender);
    const { needed, room } = roomForOres({
      owned: progress && deps.inventoryForProgress ? deps.inventoryForProgress(progress) : [], equipped: progress ? equippedFields(progress) : [],
      extraCopies: extraCopiesOf(ctx, ctx.sender).length, ores: held, capacity: bagCapacityFor(ctx, ctx.sender),
    }, rockOreKinds(node));
    if (!room) throw new SenderError(bagFullForOres(needed));
  }
  pruneMinedNodes(ctx, ctx.sender);
  if (nodeBareFor(ctx, ctx.sender, node)) throw new SenderError("That rock is still growing back.");
  // Mining Speed, Ore Find and Starshard cards in the worn gear.
  const cards = withCourtyardFind(ctx, ctx.sender, cardStatFactors(activeCardTotalsFor(ctx, ctx.sender))), pickaxe = toolLevelFor(ctx, ctx.sender, "pickaxe");
  if (mining && microsSince(ctx, mining.lastBreakAt) < miningBreakSeconds(node, skill, cards.miningSpeed, pickaxe) * MINING_RATE_SLACK * 1_000_000) {
    throw new SenderError("Still mining.");
  }
  // Mining Luck raises a Mysterious rock's Starshard chance; other rocks hold none, so no read.
  const miningLuck = node.kind === "mysterious" ? luckInPlay(ctx, ctx.sender).miningLuck : 0;
  const ores = boostedYield(miningYield(node, ctx.random(), cards, cards.oreFind > 0 ? ctx.random() : 1, miningLuck,
    pickaxe > 0 ? toolBonusYield(pickaxe, ctx.random()) : 0), serverBoostGatherMultiplierAt(ctx, millisOf(ctx.timestamp)));
  for (const [oreId, count] of Object.entries(ores)) addOres(ctx, ctx.sender, oreId as OreId, count ?? 0);
  const row = {
    identity: ctx.sender,
    mining: Math.min(U32_MAX, skill + miningGain(node)),
    rocksBroken: ((mining?.rocksBroken ?? 0) + 1) % (U32_MAX + 1),
    pickaxeAt: mining?.pickaxeAt ?? ctx.timestamp,
    lastBreakAt: ctx.timestamp,
    lastNodeId: node.id,
    lastStarshard: Boolean(ores.starshard),
  };
  if (mining) ctx.db.playerMining.identity.update(row);
  else ctx.db.playerMining.insert(row);
  writeMiningLevel(ctx, ctx.sender);
  const key = minedNodeKey(ctx.sender, node.id), bare = ctx.db.playerMinedNode.key.find(key);
  if (bare) ctx.db.playerMinedNode.key.update({ ...bare, brokenAt: ctx.timestamp });
  else ctx.db.playerMinedNode.insert({ key, identity: ctx.sender, nodeId: node.id, brokenAt: ctx.timestamp });
}

/**
 * Every rock broken since the last report (gather-batch.ts judges them), for clients that mine locally and report
 * in batches. The reads are made once for the whole batch, each ore is rolled as mine_node rolls it, and every row
 * is written once. A rock the server does not take is left out; the client reads the rows again and it stands.
 */
export function reportMiningFor(ctx: Ctx, args: { breaks: readonly { nodeId: number; atMs: bigint | number }[] }, deps: MiningDeps) {
  const claims = gatherClaims(args.breaks, "nodeId");
  const player = deps.requireControllingPlayer(ctx);
  if (!claims.length) return;
  if (!isTownMap(player.mapId)) throw new SenderError("Walk up to the rock first.");
  if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
  const mining = ctx.db.playerMining.identity.find(ctx.sender), skill = normalizeMining(mining?.mining);
  const rows = new Map<number, any>();
  for (const row of ctx.db.playerMinedNode.identity.filter(ctx.sender) as Iterable<any>) rows.set(row.nodeId, row);
  const cards = withCourtyardFind(ctx, ctx.sender, cardStatFactors(activeCardTotalsFor(ctx, ctx.sender))), pickaxe = toolLevelFor(ctx, ctx.sender, "pickaxe");
  const ores = oreCountsFor(ctx, ctx.sender), progress = progressOnce(ctx, ctx.sender), rank = respawnRankFor(ctx, ctx.sender);
  const { accepted, rejected, skill: reached } = judgeGatherBatch(claims, {
    node: miningNode, canWork: canMineRock, gain: miningGain, slack: MINING_RATE_SLACK, reach: MINING_SERVER_REACH,
    seconds: (node, at) => miningBreakSeconds(node, at, cards.miningSpeed, pickaxe),
    respawnMs: node => rockRespawnMs(node, rank), kinds: rockOreKinds,
  }, {
    nowMs: millisOf(ctx.timestamp), lastAtMs: mining ? millisOf(mining.lastBreakAt) : null, skill,
    brokenAtMs: new Map([...rows.values()].map(row => [row.nodeId, millisOf(row.brokenAt)])),
    within: gatherReach(ctx, player, progress), held: new Set(Object.keys(ores) as OreId[]),
    freeSlots: gatherFreeSlots(ctx, ctx.sender, ores, progress, deps.inventoryForProgress),
  });
  logOddGatherRejections("Mining", ctx.sender, rejected);
  // Grown-back rows are deleted; the rocks broken in this batch are written once each, at their last break.
  const last = new Map<number, number>();
  for (const { node, atMs } of accepted) last.set(node.id, atMs);
  for (const row of rows.values()) if (!last.has(row.nodeId) && grownBack(ctx, row, rank)) ctx.db.playerMinedNode.key.delete(row.key);
  if (!accepted.length) return;
  const miningLuck = accepted.some(({ node }) => node.kind === "mysterious") ? luckInPlay(ctx, ctx.sender).miningLuck : 0;
  const gained: Partial<Record<OreId, number>> = {};
  let starshard = false;
  for (const { node, atMs } of accepted) {
    // A Server Boost doubles what a break gives, judged at the break's own time; the count of breaks is unchanged.
    const rolled = boostedYield(miningYield(node, ctx.random(), cards, cards.oreFind > 0 ? ctx.random() : 1, miningLuck,
      pickaxe > 0 ? toolBonusYield(pickaxe, ctx.random()) : 0), serverBoostGatherMultiplierAt(ctx, atMs));
    for (const [oreId, count] of Object.entries(rolled)) gained[oreId as OreId] = (gained[oreId as OreId] ?? 0) + (count ?? 0);
    starshard = Boolean(rolled.starshard);
  }
  for (const [oreId, count] of Object.entries(gained)) addOres(ctx, ctx.sender, oreId as OreId, count ?? 0);
  const final = accepted[accepted.length - 1], at = (ms: number) => new Timestamp(BigInt(Math.round(ms)) * 1_000n);
  const row = {
    identity: ctx.sender,
    mining: Math.min(U32_MAX, reached),
    rocksBroken: ((mining?.rocksBroken ?? 0) + accepted.length) % (U32_MAX + 1),
    pickaxeAt: mining?.pickaxeAt ?? ctx.timestamp,
    lastBreakAt: at(final.atMs),
    lastNodeId: final.node.id,
    lastStarshard: starshard,
  };
  if (mining) ctx.db.playerMining.identity.update(row);
  else ctx.db.playerMining.insert(row);
  writeMiningLevel(ctx, ctx.sender);
  for (const [nodeId, atMs] of last) {
    const bare = rows.get(nodeId);
    if (bare) ctx.db.playerMinedNode.key.update({ ...bare, brokenAt: at(atMs) });
    else ctx.db.playerMinedNode.insert({ key: minedNodeKey(ctx.sender, nodeId), identity: ctx.sender, nodeId, brokenAt: at(atMs) });
  }
}

const MiningBreakEntry = t.object("MiningBreakEntry", { nodeId: t.u32(), atMs: t.u64() });

/** A break, a batch of them, the old pickaxe claim, and the caller's own Mining and bare rocks. */
export function registerMining(spacetimedb: typeof spacetimedbType, deps: MiningDeps) {
  const claimPickaxe = spacetimedb.reducer({}, (ctx: any) => claimPickaxeFor(ctx, deps));
  const mineNode = spacetimedb.reducer({ nodeId: t.u32() }, (ctx: any, args: { nodeId: number }) => mineNodeFor(ctx, args, deps));
  const reportMining = spacetimedb.reducer({ breaks: t.array(MiningBreakEntry) }, (ctx: any, args: any) => reportMiningFor(ctx, args, deps));
  const myMining = spacetimedb.view({ name: "my_mining", public: true }, t.array(playerMining.rowType), (ctx: any) => {
    const row = ctx.db.playerMining.identity.find(ctx.sender);
    return row ? [row] : [];
  });
  const myMinedNodes = spacetimedb.view({ name: "my_mined_nodes", public: true }, t.array(playerMinedNode.rowType),
    (ctx: any) => [...ctx.db.playerMinedNode.identity.filter(ctx.sender)]);
  return { claimPickaxe, mineNode, reportMining, myMining, myMinedNodes };
}
