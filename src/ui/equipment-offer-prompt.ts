import { bowSkillLines, isSkillBow, type BowSkillRoll } from "../../shared/bow-skills";
import { itemDisplayName } from "../../shared/items";
import { itemArtMarkup } from "../game/item-presentation";
import type { InventoryState } from "../game/inventory";
import { formatRemaining } from "./format-remaining";
import { itemDropColor } from "./item-drop-color";
import { itemInspectionButtonLabel } from "./item-inspection-controller";

type Offer = { id: bigint; itemId: string; roll: BowSkillRoll; expiresAtMs: number };
type Result = { ok: boolean; error?: string } | undefined;

/** What the prompt needs from the coop session. Everything is optional so an old bundle's API is simply "no offers". */
export type EquipmentOfferPort = {
  equipmentOffers?: () => readonly Offer[];
  equipmentCopies?: () => readonly { id: bigint; itemId: string }[];
  bowSkills?: (itemId: string) => Partial<BowSkillRoll> | null | undefined;
  resolveEquipmentOffer?: (id: bigint, keep: boolean) => Promise<Result>;
  serverNowMs?: () => number;
};

export type EquipmentOfferPromptOptions = {
  coop: EquipmentOfferPort | null | undefined;
  inventory: Pick<InventoryState, "itemIds">;
  /** Kept copies live outside the bag's item list, so the inventory is redrawn when they change. */
  renderInventory: () => void;
  showMessage: (message: string, color?: string) => void;
  /** False while the world is not on screen (loading, sign-in): offers wait without popping up. */
  ready?: () => boolean;
  root?: Document;
  tickMs?: number;
};

const skillList = (roll: Partial<BowSkillRoll> | null | undefined) => {
  const lines = bowSkillLines(roll);
  return lines.length ? lines : ["No skills"];
};

/**
 * The Keep / Ignore window for duplicate equipment drops.
 *
 * It is a small non-modal card: the game keeps running and keeps its input,
 * nothing is paused, and focus is only taken when the player opened it. One
 * offer shows at a time, oldest first. Closing it (the corner button or
 * Escape) leaves the offer waiting; the server ignores it when its five
 * minutes are up either way. A red count on the Inventory button and a line
 * in the inventory lead back to whatever is still waiting.
 */
export function createEquipmentOfferPrompt(options: EquipmentOfferPromptOptions) {
  const doc = options.root ?? document;
  const card = doc.createElement("section");
  card.className = "equipment-offer";
  card.hidden = true;
  card.tabIndex = -1;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-labelledby", "equipmentOfferTitle");
  card.innerHTML = `<button type="button" class="equipment-offer-close" aria-label="Decide later">×</button>`
    + `<header class="equipment-offer-header"><span class="equipment-offer-art" aria-hidden="true"></span>`
    + `<span class="equipment-offer-heading"><h2 id="equipmentOfferTitle" class="equipment-offer-name"></h2>`
    + `<span class="equipment-offer-note"></span></span></header>`
    + `<div class="equipment-offer-compare"><div class="equipment-offer-roll is-yours"><strong>Yours</strong><span class="equipment-offer-lines"></span></div>`
    + `<div class="equipment-offer-roll is-new"><strong>New</strong><span class="equipment-offer-lines"></span></div></div>`
    + `<p class="equipment-offer-timer" aria-live="off"></p>`
    + `<div class="equipment-offer-actions"><button type="button" class="window-back-button equipment-offer-ignore">Ignore</button>`
    + `<button type="button" class="equipment-offer-keep">Keep</button></div>`;
  const part = <T extends HTMLElement>(selector: string) => card.querySelector<T>(selector)!;
  const art = part(".equipment-offer-art");
  const name = part(".equipment-offer-name");
  const note = part(".equipment-offer-note");
  const compare = part(".equipment-offer-compare");
  const [yours, fresh] = [...card.querySelectorAll<HTMLElement>(".equipment-offer-lines")];
  const timer = part(".equipment-offer-timer");
  const keepButton = part<HTMLButtonElement>(".equipment-offer-keep");
  const ignoreButton = part<HTMLButtonElement>(".equipment-offer-ignore");
  doc.body.append(card);

  const badge = doc.createElement("span");
  badge.className = "equipment-offer-badge";
  badge.hidden = true;
  badge.setAttribute("aria-hidden", "true");
  doc.getElementById("inventoryBtn")?.append(badge);

  const review = doc.createElement("button");
  review.type = "button";
  review.className = "equipment-offer-review";
  review.hidden = true;
  // At the top of the bag, above its filter row.
  const bagItems = doc.getElementById("inventoryItems");
  const bagTop = [...(bagItems?.parentElement?.children ?? [])]
    .find(child => child.matches(".inventory-filters") || child.querySelector(".inventory-filters")) ?? bagItems;
  bagTop?.before(review);

  let showing: bigint | null = null;
  let busy = false;
  let copiesSignature = "";
  /** Closed without an answer: not popped up again by itself. */
  const deferred = new Set<bigint>();
  /** Answered and on its way to the server: hidden until the row goes. */
  const answered = new Set<bigint>();

  const now = () => {
    const server = options.coop?.serverNowMs?.();
    return typeof server === "number" && Number.isFinite(server) ? server : Date.now();
  };
  const waiting = () => (options.coop?.equipmentOffers?.() ?? [])
    .filter(offer => !answered.has(offer.id) && offer.expiresAtMs > now());

  function showLines(target: HTMLElement, lines: readonly string[]) {
    target.replaceChildren(...lines.map(line => {
      const span = doc.createElement("span");
      span.textContent = line;
      return span;
    }));
  }

  function render(offer: Offer, position: number, total: number) {
    const holds = options.inventory.itemIds.includes(offer.itemId);
    const extra = (options.coop?.equipmentCopies?.() ?? []).filter(copy => copy.itemId === offer.itemId).length;
    if (art.dataset.itemId !== offer.itemId) {
      art.dataset.itemId = offer.itemId;
      art.innerHTML = itemArtMarkup(offer.itemId);
    }
    name.textContent = itemInspectionButtonLabel(itemDisplayName(offer.itemId));
    name.style.color = itemDropColor(offer.itemId);
    note.textContent = !holds ? "You no longer have this" : extra
      ? `You already have ${extra + 1} of these`
      : "You already have this";
    const skilled = isSkillBow(offer.itemId);
    compare.hidden = !skilled;
    if (skilled) {
      showLines(yours, holds ? skillList(options.coop?.bowSkills?.(offer.itemId)) : ["None"]);
      showLines(fresh, skillList(offer.roll));
    }
    const remaining = formatRemaining(offer.expiresAtMs - now());
    timer.textContent = total > 1 ? `Ignored in ${remaining} · ${position} of ${total}` : `Ignored in ${remaining}`;
    keepButton.disabled = busy;
    ignoreButton.disabled = busy;
  }

  /** Closing for later puts off everything waiting now; only a later drop pops up by itself. */
  function close(defer: boolean) {
    if (defer) for (const offer of waiting()) deferred.add(offer.id);
    showing = null;
    card.hidden = true;
  }

  function refresh() {
    const known = new Set((options.coop?.equipmentOffers?.() ?? []).map(offer => offer.id));
    for (const set of [answered, deferred]) for (const id of set) if (!known.has(id)) set.delete(id);
    const offers = waiting();
    const count = offers.length;
    badge.hidden = count === 0;
    badge.textContent = count > 9 ? "9+" : String(count);
    review.hidden = count === 0;
    review.textContent = count === 1 ? "1 duplicate item waiting · Review" : `${count} duplicate items waiting · Review`;
    const signature = (options.coop?.equipmentCopies?.() ?? []).map(copy => `${copy.id}:${copy.itemId}`).join(",");
    if (signature !== copiesSignature) {
      copiesSignature = signature;
      options.renderInventory();
    }
    let offer = offers.find(candidate => candidate.id === showing);
    if (!offer) {
      if (showing !== null) close(false);
      if (options.ready && !options.ready()) return;
      offer = offers.find(candidate => !deferred.has(candidate.id));
      if (!offer) return;
      showing = offer.id;
      card.hidden = false;
    }
    render(offer, offers.indexOf(offer) + 1, count);
  }

  async function answer(keep: boolean) {
    const id = showing;
    const resolve = options.coop?.resolveEquipmentOffer;
    if (id === null || busy || !resolve) return;
    busy = true;
    refresh();
    const result = await resolve(id, keep);
    busy = false;
    if (result?.ok) {
      answered.add(id);
      if (keep) options.showMessage("KEPT · ADDED TO YOUR BAG", "#72ef58");
    } else options.showMessage(result?.error ?? "NOT CONNECTED", "#ff9b91");
    refresh();
  }

  /** Show everything still waiting, starting with the oldest, including offers closed earlier. */
  function reviewAll() {
    deferred.clear();
    close(false);
    refresh();
    if (!card.hidden) card.focus({ preventScroll: true });
  }

  keepButton.addEventListener("click", () => { void answer(true); });
  ignoreButton.addEventListener("click", () => { void answer(false); });
  part(".equipment-offer-close").addEventListener("click", () => close(true));
  review.addEventListener("click", reviewAll);
  doc.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || card.hidden) return;
    // Escape belongs to a text field or a modal window that has focus.
    const focused = doc.activeElement;
    if (focused && !card.contains(focused) && (/^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName) || focused.closest("dialog[open]"))) return;
    // One Escape closes one layer: the offer, not the window beneath it too.
    event.stopImmediatePropagation();
    close(true);
  }, true);
  const timerId = setInterval(refresh, options.tickMs ?? 1_000);
  refresh();

  return { refresh, review: reviewAll, isOpen: () => !card.hidden, stop: () => clearInterval(timerId) };
}
