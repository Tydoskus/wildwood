import { itemDisplayName } from "../../shared/items";
import { REFINE_ORES, type OreId } from "../../shared/refine";
import { appendBagTileContents, appendOreTileContents } from "./bag-item-tile";
import { itemInspectionButtonLabel } from "./item-inspection-controller";
import { withRefineStars } from "./refine-badge";

/** One tile in a station's grid: a piece the tab offers or holds. */
export type StationTile = {
  key: string;
  itemId: string;
  copyId?: bigint;
  refine?: number;
  /** The slot tier its stat values are shown at. */
  tier?: number;
  /** A word under the art in place of the stats: Worn, Owned, Locked. */
  badge?: string;
  /** Its button cannot act right now: the tile is dimmed. */
  waits?: boolean;
  /** Why it cannot be had at all yet, said in a message when it is tapped. */
  why?: string;
  /** A material stack (crafted arrows): itemId is its ore id, drawn as the bag draws it with this many held. */
  oreCount?: number;
};

/**
 * A station tab's markup: the picked piece's detail pinned on top, and under it a scroll holding the
 * grid, with `before` and `after` around it.
 */
export function stationViewMarkup(view: string, label: string, parts: { before?: string; after?: string; className?: string } = {}) {
  return `<section class="smith-view station-view ${parts.className ?? ""}" data-view="${view}">`
    + `<section class="station-detail" aria-live="polite"></section>`
    + `<div class="station-scroll">${parts.before ?? ""}<div class="inventory-items station-grid" role="listbox" aria-label="${label}"></div>${parts.after ?? ""}</div></section>`;
}

/** The tile to show: the one picked while it is still there, else the first that can act, else the first. */
export function stationPick(tiles: readonly StationTile[], current: string | null) {
  if (current && tiles.some(tile => tile.key === current)) return current;
  return (tiles.find(tile => !tile.waits) ?? tiles[0])?.key ?? null;
}

/** Fills a station's grid with tiles drawn as the bag draws them; tapping one picks it. */
export function renderStationGrid(grid: HTMLElement, tiles: readonly StationTile[], selected: string | null, onPick: (key: string) => void) {
  grid.replaceChildren(...tiles.map(tile => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inventory-item is-filled";
    button.setAttribute("role", "option");
    const isSelected = tile.key === selected;
    button.setAttribute("aria-selected", String(isSelected));
    button.classList.toggle("is-selected", isSelected);
    button.classList.toggle("is-waiting", Boolean(tile.waits));
    button.dataset.itemId = tile.itemId;
    if (tile.copyId !== undefined) button.dataset.copyId = String(tile.copyId);
    const ore = tile.oreCount !== undefined ? tile.itemId as OreId : null;
    const name = ore ? `${REFINE_ORES[ore].name}, ${tile.oreCount} Held`
      : withRefineStars(itemInspectionButtonLabel(itemDisplayName(tile.itemId)), tile.refine ?? 0);
    button.setAttribute("aria-label", tile.badge ? `${name}, ${tile.badge}` : name);
    if (ore) appendOreTileContents(button, ore, tile.oreCount!);
    else appendBagTileContents(button, tile.itemId, { refine: tile.refine, tier: tile.tier, stats: !tile.badge });
    if (tile.badge) {
      const badge = document.createElement("span");
      badge.className = "station-tile-badge";
      badge.textContent = tile.badge;
      button.append(badge);
    }
    button.addEventListener("click", () => onPick(tile.key));
    return button;
  }));
}

/** A piece's row used as the pinned detail: no longer one of a list. */
export function asDetail(row: HTMLElement) {
  row.removeAttribute("role");
  row.classList.add("station-detail-row");
  return row;
}
