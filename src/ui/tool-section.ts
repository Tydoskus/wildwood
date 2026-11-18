import { MATERIAL_NAMES, craftLevel, type PlayerCraftSkill } from "../../shared/crafting";
import { fishingLevel } from "../../shared/fishing";
import type { OreId } from "../../shared/refine";
import {
  TOOLS, TOOL_IDS, TOOL_MAX_LEVEL, TOOL_SKILL_NAMES, normalizeToolLevel, toolEffectText, toolLevelNeed, toolName, toolNeedText, toolUpgradeCost,
  type ToolId, type ToolSkill,
} from "../../shared/tools";
import { toolArtSource } from "../game/runtime/town/tool-sprites";
import { offerButton, offerLine } from "./craft-section";
import { formatGemAmount } from "./number-format";
import { oreIconSource } from "./ore-icon";

type Result = { ok: boolean; error?: string } | undefined;
type Ores = Readonly<Partial<Record<OreId, number>>>;
const GOLD_COIN = `<svg class="smith-coin" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#e3b23c" stroke="#7a4f12" stroke-width="1.5"/><circle cx="10" cy="10" r="5.5" fill="none" stroke="#a8741d" stroke-width="1.2"/></svg>`;
const count = (value: number) => Math.floor(value).toLocaleString("en-US");

export type ToolSectionDeps = {
  toolLevels: () => Readonly<Partial<Record<ToolId, number>>>;
  /** The Mining and Woodcutting stats, and each craft's level. */
  skills: () => Readonly<Record<ToolSkill, number>>;
  ores: () => Ores;
  gold: () => bigint;
  upgrade: (tool: ToolId, expectedLevel: number) => Promise<Result>;
  showMessage: (text: string, color: string) => void;
};

/** Why an upgrade waits, in the order the server checks: the skill, then materials, then gold. */
export function toolButtonText(tool: ToolId, level: number, skill: number, ores: Ores, gold: bigint, busy = false) {
  if (level >= TOOL_MAX_LEVEL) return "Max";
  if (busy) return "Upgrading…";
  const next = level + 1, cost = toolUpgradeCost(tool, next)!;
  if (skill < toolLevelNeed(tool, next)) return `Need ${toolNeedText(tool, next)}`;
  if (Object.entries(cost.materials).some(([id, needed]) => (ores[id as OreId] ?? 0) < needed)) return "Need Materials";
  if (gold < BigInt(cost.gold)) return "Need Gold";
  return "Upgrade";
}

/**
 * The Smith's Tools section: a row per tool, every player holding all five, its art at its level, its name and level, what it does
 * now and at the next level, and the next upgrade's gold and materials against what is held, with a button that
 * says what it does or why it waits. The server decides (upgrade_tool).
 */
export function createToolSection(deps: ToolSectionDeps, options: { onChange?: () => void } = {}) {
  const section = document.createElement("section");
  section.className = "smith-shop tool-section";
  section.setAttribute("aria-labelledby", "smithToolsTitle");
  section.innerHTML = `<div class="smith-shop-head"><h3 id="smithToolsTitle">Tools</h3></div>`
    + `<div class="smith-shop-rows" role="list" aria-label="Tools to upgrade"></div>`;
  const rows = section.querySelector<HTMLElement>(".smith-shop-rows")!;
  let upgrading: ToolId | null = null, rendered = "";

  function state() {
    return JSON.stringify([deps.toolLevels(), deps.skills(), deps.ores(), String(deps.gold()), upgrading]);
  }

  function render() {
    const now = state();
    if (now === rendered) return;
    rendered = now;
    rows.replaceChildren(...TOOL_IDS.map(row));
  }

  function row(tool: ToolId) {
    const level = normalizeToolLevel(deps.toolLevels()[tool]), next = level + 1, max = level >= TOOL_MAX_LEVEL;
    const skill = deps.skills()[TOOLS[tool].skill] ?? 0, ores = deps.ores(), gold = deps.gold();
    const element = document.createElement("article");
    element.className = "smith-shop-row tool-row";
    element.setAttribute("role", "listitem");
    element.dataset.tool = tool;
    element.innerHTML = `<span class="smith-shop-art" aria-hidden="true"><span class="inventory-item-art"></span></span>`
      + `<span class="smith-shop-copy"><strong></strong><span class="smith-shop-grade"></span><span class="smith-shop-stat"></span></span>`
      + `<div class="smith-shop-deal"></div>`;
    const art = toolArtSource(tool, level);
    if (art) element.querySelector<HTMLElement>(".inventory-item-art")!.style.backgroundImage = `url(${art})`;
    element.querySelector("strong")!.textContent = toolName(tool, level);
    element.querySelector(".smith-shop-grade")!.textContent = `Lv ${level} / ${TOOL_MAX_LEVEL} · ${TOOL_SKILL_NAMES[TOOLS[tool].skill]} Tool`;
    element.querySelector(".smith-shop-stat")!.textContent = toolEffectText(tool, level);
    const copy = element.querySelector(".smith-shop-copy")!;
    if (max) {
      const top = document.createElement("span");
      top.className = "smith-shop-owned";
      top.textContent = "Fully Upgraded";
      copy.append(top);
      return element;
    }
    // The next level's effect, and the skill it needs: unmet stands out, met steps back.
    const needs = document.createElement("span");
    needs.className = "craft-needs";
    const part = (text: string, met: boolean) => {
      const span = document.createElement("span");
      span.className = met ? "is-met" : "is-unmet";
      span.textContent = text;
      return span;
    };
    needs.append(part(`Next: ${toolEffectText(tool, next)}`, true), " · ", part(toolNeedText(tool, next), skill >= toolLevelNeed(tool, next)));
    copy.append(needs);
    const cost = toolUpgradeCost(tool, next)!;
    const price = document.createElement("span");
    price.className = "smith-shop-price";
    price.innerHTML = `${GOLD_COIN}<span></span>`;
    // The price alone, muted while the gold held is short; the button says Need Gold.
    price.lastElementChild!.textContent = formatGemAmount(BigInt(cost.gold));
    if (gold < BigInt(cost.gold)) price.classList.add("is-short");
    price.setAttribute("aria-label", `${formatGemAmount(BigInt(cost.gold))} Gold, ${formatGemAmount(gold)} held`);
    const text = toolButtonText(tool, level, skill, ores, gold, upgrading === tool);
    const button = offerButton(text, text === "Upgrade" && upgrading === null, () => { void upgrade(tool, level); });
    const line = offerLine([price, materialList(cost.materials, ores)], button);
    line.classList.add("craft-offer");
    element.querySelector(".smith-shop-deal")!.append(line);
    return element;
  }

  function materialList(materials: Readonly<Record<string, number>>, ores: Ores) {
    const list = document.createElement("ul");
    list.className = "craft-materials";
    list.setAttribute("aria-label", "Materials");
    list.append(...Object.entries(materials).map(([id, needed]) => {
      const item = document.createElement("li"), have = ores[id as OreId] ?? 0;
      item.className = have >= needed ? "craft-material" : "craft-material is-short";
      item.dataset.material = id;
      const icon = document.createElement("span");
      icon.className = "craft-material-icon";
      icon.setAttribute("aria-hidden", "true");
      const source = oreIconSource(id as OreId);
      if (source) icon.style.backgroundImage = `url(${source})`;
      const label = document.createElement("span");
      label.textContent = `${count(have)} / ${count(needed)} ${MATERIAL_NAMES[id] ?? id}`;
      item.append(icon, label);
      return item;
    }));
    return list;
  }

  async function upgrade(tool: ToolId, level: number) {
    if (upgrading) return;
    upgrading = tool;
    changed();
    try {
      const result = await deps.upgrade(tool, level);
      if (result?.ok) deps.showMessage(`Upgraded · ${toolName(tool, level + 1)}. ${toolEffectText(tool, level + 1)}.`, "#ffd75e");
      else deps.showMessage(result?.error ?? "Not Connected", "#ff9b91");
    } finally {
      upgrading = null;
      changed();
    }
  }

  function changed() {
    render();
    options.onChange?.();
  }

  return { element: section, render, state, reset() { rendered = ""; } };
}

/** What the Tools section reads from the coop session. */
export type ToolCoop = {
  toolLevels?: () => Readonly<Partial<Record<ToolId, number>>>;
  upgradeTool?: (tool: ToolId, expectedLevel: number) => Promise<Result>;
  mining?: () => number;
  woodcutting?: () => number;
  fishingExperience?: () => number;
  craftSkills?: () => Readonly<Partial<Record<PlayerCraftSkill, bigint>>>;
  ores?: () => Ores;
  gold?: () => bigint;
};

/** A Tools section's deps from the coop session. */
export function toolDepsFor(coop: () => ToolCoop | null | undefined, showMessage: ToolSectionDeps["showMessage"]): ToolSectionDeps {
  return {
    toolLevels: () => coop()?.toolLevels?.() ?? {},
    skills: () => {
      const session = coop(), crafts = session?.craftSkills?.() ?? {};
      return {
        mining: session?.mining?.() ?? 0, woodcutting: session?.woodcutting?.() ?? 0,
        fishing: fishingLevel(session?.fishingExperience?.() ?? 0),
        cooking: craftLevel(crafts.cooking ?? 0n),
        smithing: craftLevel(crafts.smithing ?? 0n), fletching: craftLevel(crafts.fletching ?? 0n), enchanting: craftLevel(crafts.enchanting ?? 0n),
      };
    },
    ores: () => coop()?.ores?.() ?? {},
    gold: () => coop()?.gold?.() ?? 0n,
    upgrade: async (tool, expectedLevel) => coop()?.upgradeTool?.(tool, expectedLevel) ?? { ok: false, error: "Not Connected" },
    showMessage,
  };
}

/** Puts the Tools section in the Smith's Upgrade tab (at the foot of his window without one), and returns it for the window to render. */
export function mountToolSection(dialog: HTMLElement, deps: ToolSectionDeps | undefined, onChange: () => void) {
  if (!deps) return null;
  const tools = createToolSection(deps, { onChange });
  (dialog.querySelector(".smith-tools") ?? dialog.querySelector(".quest-body") ?? dialog).append(tools.element);
  return tools;
}
