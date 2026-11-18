import { SenderError, table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type spacetimedbType from "./index";
import type { OreId } from "../../shared/refine";
import { miningYield } from "../../shared/mining";
import { woodcuttingYield } from "../../shared/woodcutting";
import { simulateOfflineChopping, simulateOfflineFishing, simulateOfflineMining } from "../../shared/offline-gathering";
import { fishingTimeFactor } from "../../shared/fishing-treasures";
import { normalizeFishingExperience } from "../../shared/fishing";
import { MINING_VEINS } from "../../shared/mining";
import { WOOD_STANDS } from "../../shared/woodcutting";
import { bagFullForOres, roomForOres } from "../../shared/ore-bag";
import { toolBonusYield } from "../../shared/tools";
import { cardStatFactors } from "../../shared/card-effects";
import { activeCardTotalsFor } from "./active-cards";
import { toolLevelFor } from "./tools";
import { luckInPlay } from "./luck-research";
import { researchRankFor } from "./research-rank";
import { addOres, oreCountsFor } from "./item-refine";
import { extraCopiesOf } from "./equipment-copies";
import { bagCapacityFor } from "./bag-capacity";
import { equippedFields } from "./gather-batch";
import { readPlayerProgress } from "./wide-stats";
import { writeMiningLevel } from "./mining";
import { writeWoodcuttingLevel } from "./woodcutting";
import { writeFishingLevel } from "./fishing";
import { guildHallBonusFor, withCourtyardFind } from "./guild-hall-bonus";

/**
 * The mining and chopping a player could collect for their time away, rolled on world entry beside the fight
 * (offline-progress.ts) and paid only if they pick it. Its grantedAtMicros matches the offline_progress row it
 * belongs to; a pending row without one was paid out before choices existed.
 */
export const offlineGatherChoice = table({ name: "offline_gather_choice", public: false }, {
  identity: t.identity().primaryKey(),
  grantedAtMicros: t.u64(),
  rocks: t.u32(),
  miningGain: t.u32(),
  /** Ore id to count, as JSON. */
  mineOres: t.string(),
  trees: t.u32(),
  woodcuttingGain: t.u32(),
  chopOres: t.string(),
});

/**
 * The fishing a player could collect for their time away, stored in its own table beside offline_gather_choice so
 * adding Fishing keeps existing clients decoding my_offline_gather_choice cleanly.
 */
export const offlineFishingChoice = table({ name: "offline_fishing_choice", public: false }, {
  identity: t.identity().primaryKey(),
  grantedAtMicros: t.u64(),
  catches: t.u32(),
  experienceGain: t.u32(),
  /** Fish id to count, as JSON. */
  fishOres: t.string(),
});

/** Auto Mine and Auto Chop picks that 0.917.34-35 clients still send; time away no longer reads them. Goes with the next client break. */
export const playerGatherPicks = table({ name: "player_gather_picks", public: false }, {
  identity: t.identity().primaryKey(),
  mineOres: t.string(),
  chopTrees: t.string(),
});

type Ctx = any;
const MINE_PICKS: readonly string[] = MINING_VEINS.map(vein => vein.ore);
const CHOP_PICKS: readonly string[] = WOOD_STANDS.map(stand => stand.kind);

/** Keeps a device's Auto Mine or Auto Chop picks, only those time away can work. */
function setGatherPicksFor(ctx: Ctx, args: { kind: string; ids: string[] }) {
  if (args.kind !== "mine" && args.kind !== "chop") throw new SenderError("Invalid picks.");
  const allowed = args.kind === "mine" ? MINE_PICKS : CHOP_PICKS;
  const ids = JSON.stringify(allowed.filter(id => args.ids.includes(id)));
  const row = ctx.db.playerGatherPicks.identity.find(ctx.sender) ?? { identity: ctx.sender, mineOres: "[]", chopTrees: "[]" };
  const next = args.kind === "mine" ? { ...row, mineOres: ids } : { ...row, chopTrees: ids };
  if (next.mineOres === row.mineOres && next.chopTrees === row.chopTrees && ctx.db.playerGatherPicks.identity.find(ctx.sender)) return;
  if (ctx.db.playerGatherPicks.identity.find(ctx.sender)) ctx.db.playerGatherPicks.identity.update(next);
  else ctx.db.playerGatherPicks.insert(next);
}

/** The set_gather_picks reducer. */
export const registerGatherPicks = (spacetimedb: typeof spacetimedbType) =>
  spacetimedb.reducer({ kind: t.string(), ids: t.array(t.string()) }, (ctx: any, args: { kind: string; ids: string[] }) => setGatherPicksFor(ctx, args));
const U32_MAX = 4_294_967_295;
type Counts = Partial<Record<OreId, number>>;

function addCounts(into: Counts, from: Counts) {
  for (const [oreId, count] of Object.entries(from)) into[oreId as OreId] = (into[oreId as OreId] ?? 0) + (count ?? 0);
}

/** Rolls both for `seconds` away over every open vein and stand, each break as playing rolls it (no Server Boost, no card drops), and stores them. */
export function storeOfflineGatherChoice(ctx: Ctx, identity: Identity, seconds: number, grantedAtMicros: bigint) {
  const cards = withCourtyardFind(ctx, identity, cardStatFactors(activeCardTotalsFor(ctx, identity))), respawnRank = researchRankFor(ctx, identity, "resourceRespawn");
  // The guild hall's Lanterns: the work goes on faster while away.
  const lanterns = guildHallBonusFor(ctx, identity, "lights");
  const mining = Number(ctx.db.playerMining.identity.find(identity)?.mining ?? 0);
  const pickaxe = toolLevelFor(ctx, identity, "pickaxe");
  const mined = simulateOfflineMining({ mining, seconds, cardSpeed: cards.miningSpeed + lanterns, pickaxe, respawnRank });
  const miningLuck = mined.breaks.some(node => node.kind === "mysterious") ? luckInPlay(ctx, identity).miningLuck : 0;
  const mineOres: Counts = {};
  for (const node of mined.breaks) {
    addCounts(mineOres, miningYield(node, ctx.random(), cards, cards.oreFind > 0 ? ctx.random() : 1, miningLuck,
      pickaxe > 0 ? toolBonusYield(pickaxe, ctx.random()) : 0));
  }
  const woodcutting = Number(ctx.db.playerWoodcutting.identity.find(identity)?.woodcutting ?? 0);
  const hatchet = toolLevelFor(ctx, identity, "hatchet");
  const chopped = simulateOfflineChopping({ woodcutting, seconds, cardSpeed: cards.woodcuttingSpeed + lanterns, hatchet, respawnRank });
  const chopOres: Counts = {};
  for (const tree of chopped.breaks) {
    addCounts(chopOres, woodcuttingYield(tree, hatchet > 0 ? toolBonusYield(hatchet, ctx.random()) : 0, cards.logFind,
      cards.logFind > 0 ? ctx.random() : 1));
  }
  const row = {
    identity, grantedAtMicros,
    rocks: mined.breaks.length, miningGain: Math.min(U32_MAX, Math.floor(mined.skill - mining)), mineOres: JSON.stringify(mineOres),
    trees: chopped.breaks.length, woodcuttingGain: Math.min(U32_MAX, Math.floor(chopped.skill - woodcutting)), chopOres: JSON.stringify(chopOres),
  };
  if (ctx.db.offlineGatherChoice.identity.find(identity)) ctx.db.offlineGatherChoice.identity.update(row);
  else ctx.db.offlineGatherChoice.insert(row);
  const progress = readPlayerProgress(ctx, identity);
  const fishingExp = normalizeFishingExperience(ctx.db.playerFishing.identity.find(identity)?.experience);
  const rod = toolLevelFor(ctx, identity, "rod");
  const courtyard = guildHallBonusFor(ctx, identity, "courtyard");
  const fished = simulateOfflineFishing({
    experience: fishingExp, seconds, timeFactor: fishingTimeFactor(progress?.equippedHead, progress?.equippedChest),
    rod, lanterns, courtyard, random: () => ctx.random(),
  });
  const fishRow = {
    identity, grantedAtMicros,
    catches: Math.min(U32_MAX, fished.catches), experienceGain: Math.min(U32_MAX, fished.experienceGain),
    fishOres: JSON.stringify(fished.fish),
  };
  if (ctx.db.offlineFishingChoice.identity.find(identity)) ctx.db.offlineFishingChoice.identity.update(fishRow);
  else ctx.db.offlineFishingChoice.insert(fishRow);
}

export function clearOfflineGatherChoice(ctx: Ctx, identity: Identity) {
  ctx.db.offlineGatherChoice.identity.delete(identity);
  ctx.db.offlineFishingChoice?.identity.delete(identity);
}

/** Pays the picked mining, chopping or fishing into the bag and the skill. Refused whole when the bag has no slot for a new kind. */
export function collectOfflineGathering(ctx: Ctx, identity: Identity, choice: any, activity: "mine" | "chop" | "fish",
  inventoryForProgress?: (progress: any) => string[]) {
  const fishChoice = activity === "fish" ? ctx.db.offlineFishingChoice?.identity.find(identity) : null;
  if (activity === "fish" && (!fishChoice || fishChoice.grantedAtMicros !== choice.grantedAtMicros)) return;
  const ores = JSON.parse(activity === "mine" ? choice.mineOres : activity === "chop" ? choice.chopOres : fishChoice.fishOres) as Counts;
  const kinds = (Object.keys(ores) as OreId[]).filter(oreId => (ores[oreId] ?? 0) > 0);
  const held = oreCountsFor(ctx, identity);
  if (kinds.some(oreId => !((held[oreId] ?? 0) > 0))) {
    const progress = readPlayerProgress(ctx, identity);
    const { needed, room } = roomForOres({
      owned: progress && inventoryForProgress ? inventoryForProgress(progress) : [], equipped: progress ? equippedFields(progress) : [],
      extraCopies: extraCopiesOf(ctx, identity).length, ores: held, capacity: bagCapacityFor(ctx, identity),
    }, kinds);
    if (!room) throw new SenderError(bagFullForOres(needed));
  }
  for (const oreId of kinds) addOres(ctx, identity, oreId, ores[oreId] ?? 0);
  if (activity === "mine") {
    const row = ctx.db.playerMining.identity.find(identity);
    const next = {
      identity, pickaxeAt: row?.pickaxeAt ?? ctx.timestamp, lastBreakAt: row?.lastBreakAt ?? ctx.timestamp,
      lastNodeId: row?.lastNodeId ?? 0, lastStarshard: row?.lastStarshard ?? false,
      mining: Math.min(U32_MAX, (row?.mining ?? 0) + choice.miningGain),
      rocksBroken: ((row?.rocksBroken ?? 0) + choice.rocks) % (U32_MAX + 1),
    };
    if (row) ctx.db.playerMining.identity.update(next);
    else ctx.db.playerMining.insert(next);
    writeMiningLevel(ctx, identity);
  } else if (activity === "chop") {
    const row = ctx.db.playerWoodcutting.identity.find(identity);
    const next = {
      identity, hatchetAt: row?.hatchetAt ?? ctx.timestamp, lastChopAt: row?.lastChopAt ?? ctx.timestamp, lastTreeId: row?.lastTreeId ?? 0,
      woodcutting: Math.min(U32_MAX, (row?.woodcutting ?? 0) + choice.woodcuttingGain),
      treesChopped: ((row?.treesChopped ?? 0) + choice.trees) % (U32_MAX + 1),
    };
    if (row) ctx.db.playerWoodcutting.identity.update(next);
    else ctx.db.playerWoodcutting.insert(next);
    writeWoodcuttingLevel(ctx, identity);
  } else {
    const row = ctx.db.playerFishing.identity.find(identity);
    const lastFish = kinds[kinds.length - 1] ?? row?.lastFish ?? "minnow";
    const next = {
      identity,
      experience: Math.min(U32_MAX, normalizeFishingExperience(row?.experience) + fishChoice.experienceGain),
      fishCaught: ((row?.fishCaught ?? 0) + fishChoice.catches) % (U32_MAX + 1),
      lastCatchAt: row?.lastCatchAt ?? ctx.timestamp,
      lastFish,
    };
    if (row) ctx.db.playerFishing.identity.update(next);
    else ctx.db.playerFishing.insert(next);
    writeFishingLevel(ctx, identity);
  }
}
