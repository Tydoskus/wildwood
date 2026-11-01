import { SenderError, table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type spacetimedbType from "./index";
import { ARROW_KINDS, isArrowId, type ArrowId } from "../../shared/arrows";
import { bagFullForOres, roomForOres } from "../../shared/ore-bag";
import { CRAFT_TOOL, toolCraftCost } from "../../shared/tools";
import type { OreId } from "../../shared/refine";
import { addOres, oreCount, oreCountsFor, standsAtTheSmith, takeOres } from "./item-refine";
import { readPlayerProgress } from "./wide-stats";
import { equippedFields } from "./gather-batch";
import { extraCopiesOf } from "./equipment-copies";
import { bagCapacityFor } from "./bag-capacity";
import { toolLevelFor } from "./tools";
import type { CraftingDeps } from "./crafting";

/** The arrow kind the player has nocked (arrows.ts): the bow spends it a shot while any are held. No row, plain arrows. */
export const playerNockedArrow = table({ name: "player_nocked_arrow", public: false }, {
  identity: t.identity().primaryKey(),
  arrowId: t.string(),
});

type Ctx = any;
/** The most crafts one call makes, and the most arrows one spend report takes. */
const MAX_CRAFTS = 50;
const MAX_SPENT = 100_000;

/** The kind nocked, whether or not any are held. */
export function nockedArrowFor(ctx: Ctx, identity: Identity): ArrowId | null {
  const arrowId = ctx.db.playerNockedArrow.identity.find(identity)?.arrowId;
  return isArrowId(arrowId) ? arrowId : null;
}

/** The kind the bow is shooting: nocked and held. The kill bound counts its effect only then. */
export const arrowInPlay = (ctx: Ctx, identity: Identity): ArrowId | null => {
  const arrowId = nockedArrowFor(ctx, identity);
  return arrowId && oreCount(ctx, identity, arrowId) > 0 ? arrowId : null;
};

/**
 * `crafts` stacks of an arrow made at the Smith from its log and ore, less what the Fletching knife saves, into a bag
 * slot (one stack a kind, as materials take).
 */
function craftArrowsFor(ctx: Ctx, args: { arrowId: string; crafts: number }, deps: CraftingDeps) {
  const player = deps.requireControllingPlayer(ctx);
  const { arrowId, crafts } = args;
  if (!isArrowId(arrowId)) throw new SenderError("That cannot be crafted.");
  if (!Number.isInteger(crafts) || crafts < 1 || crafts > MAX_CRAFTS) throw new SenderError("Craft between 1 and 50 at a time.");
  if (!standsAtTheSmith(ctx, player)) throw new SenderError("Talk to the Smith first.");
  if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
  const kind = ARROW_KINDS[arrowId];
  const recipe = Object.fromEntries(Object.entries(kind.recipe).map(([id, count]) => [id, (count ?? 0) * crafts])) as Record<OreId, number>;
  const need = toolCraftCost(recipe, toolLevelFor(ctx, ctx.sender, CRAFT_TOOL.fletching)) as Partial<Record<OreId, number>>;
  const ores = oreCountsFor(ctx, ctx.sender);
  if (!((ores[arrowId] ?? 0) > 0)) {
    const progress = readPlayerProgress(ctx, ctx.sender);
    const emptied = Object.entries(need).filter(([id, count]) => (ores[id as OreId] ?? 0) === count).length;
    const { needed, room } = roomForOres({
      owned: progress ? deps.inventoryForProgress(progress) : [], equipped: progress ? equippedFields(progress) : [],
      extraCopies: extraCopiesOf(ctx, ctx.sender).length, ores, capacity: bagCapacityFor(ctx, ctx.sender) + emptied,
    }, [arrowId]);
    if (!room) throw new SenderError(bagFullForOres(needed));
  }
  if (!takeOres(ctx, ctx.sender, need)) throw new SenderError("You need more materials. Take another look.");
  addOres(ctx, ctx.sender, arrowId, kind.makes * crafts);
}

/** Nocks a kind, or none (plain arrows). A Build puts back the one it was saved with (builds.ts). */
export function setNockedArrow(ctx: Ctx, identity: Identity, arrowId: ArrowId | null) {
  const existing = ctx.db.playerNockedArrow.identity.find(identity);
  if (!arrowId) { if (existing) ctx.db.playerNockedArrow.identity.delete(identity); return; }
  const row = { identity, arrowId };
  if (existing) ctx.db.playerNockedArrow.identity.update(row); else ctx.db.playerNockedArrow.insert(row);
}

/** Nocks a kind (it need not be held yet), or none: the bow shoots plain arrows. */
function nockArrowFor(ctx: Ctx, args: { arrowId: string }, deps: CraftingDeps) {
  deps.requireControllingPlayer(ctx);
  if (args.arrowId && !isArrowId(args.arrowId)) throw new SenderError("That is not an arrow.");
  setNockedArrow(ctx, ctx.sender, args.arrowId ? args.arrowId as ArrowId : null);
}

/** Arrows the bow fired, reported in batches: as many as are held are taken, never more. */
function spendArrowsFor(ctx: Ctx, args: { arrowId: string; count: number }, deps: CraftingDeps) {
  deps.requireControllingPlayer(ctx);
  if (!isArrowId(args.arrowId) || !Number.isInteger(args.count) || args.count < 1 || args.count > MAX_SPENT) throw new SenderError("Invalid arrows.");
  const taken = Math.min(args.count, oreCount(ctx, ctx.sender, args.arrowId));
  if (taken > 0) takeOres(ctx, ctx.sender, { [args.arrowId]: taken });
}

/** The craft_arrows, nock_arrow and spend_arrows reducers, and the player's own nocked arrow. */
export function registerArrows(spacetimedb: typeof spacetimedbType, deps: CraftingDeps) {
  const craftArrows = spacetimedb.reducer({ arrowId: t.string(), crafts: t.u32() }, (ctx: any, args: { arrowId: string; crafts: number }) => craftArrowsFor(ctx, args, deps));
  const nockArrow = spacetimedb.reducer({ arrowId: t.string() }, (ctx: any, args: { arrowId: string }) => nockArrowFor(ctx, args, deps));
  const spendArrows = spacetimedb.reducer({ arrowId: t.string(), count: t.u32() }, (ctx: any, args: { arrowId: string; count: number }) => spendArrowsFor(ctx, args, deps));
  const myNockedArrow = spacetimedb.view({ name: "my_nocked_arrow", public: true }, t.array(playerNockedArrow.rowType),
    (ctx: any) => { const row = ctx.db.playerNockedArrow.identity.find(ctx.sender); return row ? [row] : []; });
  return { craftArrows, nockArrow, spendArrows, myNockedArrow };
}
