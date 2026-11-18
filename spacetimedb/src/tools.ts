import { SenderError, table, t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import type spacetimedbType from "./index";
import {
  TOOLS, TOOL_MAX_LEVEL, isToolId, materialText, normalizeToolLevel, toolLevelNeed, toolNeedText, toolUpgradeCost, type ToolId,
} from "../../shared/tools";
import { craftLevel } from "../../shared/crafting";
import type { OreId } from "../../shared/refine";
import { oreCount, standsAtTheSmith, takeOres } from "./item-refine";
import { goldFor, takeGold } from "./gold";
import { normalizeMining } from "../../shared/mining";
import { normalizeWoodcutting } from "../../shared/woodcutting";
import { fishingLevel } from "../../shared/fishing";

/**
 * Each player's tool levels (shared/tools.ts), one row per upgraded tool. No row means Worn (level 0). Private;
 * the player reads their own through my_tools.
 */
export const playerTool = table({ name: "player_tool", public: false }, {
  key: t.string().primaryKey(),
  identity: t.identity().index("btree"),
  tool: t.string(),
  level: t.u8(),
});

type Ctx = any;
export const toolKey = (identity: { toHexString(): string }, tool: ToolId) => `${identity.toHexString()}:${tool}`;

export function toolLevelFor(ctx: Ctx, identity: Identity, tool: ToolId) {
  return normalizeToolLevel(ctx.db.playerTool.key.find(toolKey(identity, tool))?.level);
}

/** The skill a tool's levels are gated by: the Mining or Woodcutting stat, Fishing level, or craft level. */
function toolSkillFor(ctx: Ctx, identity: Identity, tool: ToolId) {
  const skill = TOOLS[tool].skill;
  if (skill === "mining") return normalizeMining(ctx.db.playerMining.identity.find(identity)?.mining);
  if (skill === "woodcutting") return normalizeWoodcutting(ctx.db.playerWoodcutting.identity.find(identity)?.woodcutting);
  if (skill === "fishing") return fishingLevel(ctx.db.playerFishing.identity.find(identity)?.experience);
  return craftLevel(ctx.db.playerCraftSkill.key.find(`${identity.toHexString()}:${skill}`)?.experience ?? 0n);
}

export type ToolDeps = {
  requireControllingPlayer: (ctx: Ctx) => any;
  activeDuelFor: (ctx: Ctx, identity: Identity) => unknown;
};

/**
 * One level up for a tool, at the Smith, for its gold and materials once its skill reaches the level's mark. Every
 * player holds every tool. `expectedLevel` is the level the player saw.
 */
export function upgradeToolFor(ctx: Ctx, args: { tool: string; expectedLevel: number }, deps: ToolDeps) {
  const player = deps.requireControllingPlayer(ctx);
  if (!standsAtTheSmith(ctx, player)) throw new SenderError("Talk to the Smith first.");
  if (deps.activeDuelFor(ctx, ctx.sender)) throw new SenderError("Finish your duel first.");
  const tool = args.tool;
  if (!isToolId(tool)) throw new SenderError("There is no such tool.");
  const from = toolLevelFor(ctx, ctx.sender, tool);
  if (from !== args.expectedLevel) throw new SenderError("Your tool changed. Take another look.");
  if (from >= TOOL_MAX_LEVEL) throw new SenderError("That tool is fully upgraded.");
  const level = from + 1, cost = toolUpgradeCost(tool, level)!;
  if (toolSkillFor(ctx, ctx.sender, tool) < toolLevelNeed(tool, level)) throw new SenderError(`You need ${toolNeedText(tool, level)}.`);
  const short = Object.entries(cost.materials).filter(([id, count]) => oreCount(ctx, ctx.sender, id) < count);
  if (short.length) throw new SenderError(`You need ${short.map(([id, count]) => materialText(id, count)).join(" and ")}.`);
  if (goldFor(ctx, ctx.sender) < BigInt(cost.gold)) throw new SenderError(`You need ${cost.gold.toLocaleString("en-US")} Gold.`);
  if (!takeGold(ctx, ctx.sender, cost.gold) || !takeOres(ctx, ctx.sender, cost.materials as Partial<Record<OreId, number>>)) {
    throw new SenderError("Your materials changed. Take another look.");
  }
  const key = toolKey(ctx.sender, tool), row = ctx.db.playerTool.key.find(key);
  if (row) ctx.db.playerTool.key.update({ ...row, level });
  else ctx.db.playerTool.insert({ key, identity: ctx.sender, tool, level });
}

/** Reset Save and a deleted account take every tool back to Worn. Prestige keeps them. */
export function removeTools(ctx: Ctx, identity: Identity) {
  for (const row of [...ctx.db.playerTool.identity.filter(identity)]) ctx.db.playerTool.key.delete(row.key);
}

/** A guest's save replaces the account's on link, as Mining does, its tools with it. */
export function mergeTools(ctx: Ctx, guest: Identity, account: Identity) {
  removeTools(ctx, account);
  for (const row of [...ctx.db.playerTool.identity.filter(guest)]) {
    ctx.db.playerTool.key.delete(row.key);
    if (isToolId(row.tool)) ctx.db.playerTool.insert({ ...row, key: toolKey(account, row.tool), identity: account });
  }
}

/** The upgrade_tool reducer, and the player's own tools. */
export function registerTools(spacetimedb: typeof spacetimedbType, deps: ToolDeps) {
  const upgradeTool = spacetimedb.reducer({ tool: t.string(), expectedLevel: t.u8() },
    (ctx: any, args: { tool: string; expectedLevel: number }) => upgradeToolFor(ctx, args, deps));
  const myTools = spacetimedb.view({ name: "my_tools", public: true }, t.array(playerTool.rowType),
    (ctx: any) => [...ctx.db.playerTool.identity.filter(ctx.sender)]);
  return { upgradeTool, myTools };
}
