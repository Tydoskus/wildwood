import { itemStats } from "../../shared/items";
import { itemArtMarkup } from "../game/item-presentation";
import { formatEquipmentAmount } from "./equipment-stat-format";
import { appendItemTierLabel } from "./item-tier-label";
import { appendRefineBadge } from "./refine-badge";
import { itemGradeRank } from "../../shared/item-tier";
import { REFINE_ORES, type OreId } from "../../shared/refine";
import { oreIconSource } from "./ore-icon";
import { formatCompactNumber } from "./number-format";

/** Colors a tile by the piece's grade (game.css [data-grade]); empty or non-gear tiles keep the plain one. */
export function setTileGrade(tile: HTMLElement, itemId: string | undefined) {
  const rank = itemId ? itemGradeRank(itemId) : undefined;
  if (rank === undefined) delete tile.dataset.grade; else tile.dataset.grade = String(rank);
}

/**
 * A bag tile's insides: the art, the tier over it, the stat values along the bottom and the ★N.
 * `plain` leaves out the tier and stats (cosmetics); `stats: false` leaves out the stats alone.
 */
export function appendBagTileContents(button: HTMLElement, itemId: string,
  options: { refine?: number; tier?: number; artRefine?: number; plain?: boolean; stats?: boolean } = {}) {
  const refine = options.refine ?? 0;
  if (!options.plain) setTileGrade(button, itemId);
  const art = document.createElement("span");
  art.className = "inventory-item-art-wrap";
  art.innerHTML = itemArtMarkup(itemId, true, options.artRefine ?? refine);
  button.append(art);
  if (!options.plain) {
    appendItemTierLabel(button, itemId, "above");
    if (options.stats !== false) button.append(statValues(itemId, options.tier ?? 0, refine));
  }
  appendRefineBadge(button, refine);
}

/** A material stack's insides: its icon, its short name over it as a tier sits over gear, and the count in the corner. */
export function appendOreTileContents(button: HTMLElement, oreId: OreId, count: number) {
  const art = document.createElement("span");
  art.className = "inventory-item-art-wrap";
  const source = oreIconSource(oreId);
  if (source) {
    const image = document.createElement("span");
    image.className = "inventory-item-art";
    image.setAttribute("aria-hidden", "true");
    image.style.backgroundImage = `url(${source})`;
    art.append(image);
  }
  const label = document.createElement("span");
  label.className = "item-tier-label is-above";
  label.textContent = REFINE_ORES[oreId].name.replace(/ (Ore|Arrow)$/, "").replace(/^Arcane /, "");
  const stack = document.createElement("span");
  stack.className = "inventory-stack-count";
  stack.textContent = count < 10_000 ? String(count) : formatCompactNumber(count);
  button.append(art, label, stack);
}

/** Damage, Max Health and Regen as short coloured multipliers. */
function statValues(itemId: string, tier: number, refine: number) {
  const bonuses = document.createElement("span");
  bonuses.className = "inventory-item-bonuses";
  for (const stat of itemStats(itemId, { tier, refine })) {
    // A multiplier ("×1.23") as written; an old flat amount ("+5") shortened.
    const match = /^(DAMAGE|MAX HEALTH|REGEN) (?:(×\S+)|\+([\d.]+))$/.exec(stat);
    if (!match) continue;
    const value = document.createElement("span");
    value.dataset.statKind = match[1] === "DAMAGE" ? "damage" : match[1] === "MAX HEALTH" ? "health" : "regen";
    value.textContent = match[2] ?? `+${formatEquipmentAmount(Number(match[3]))}`;
    value.title = stat;
    value.setAttribute("aria-label", stat);
    bonuses.append(value);
  }
  return bonuses;
}
