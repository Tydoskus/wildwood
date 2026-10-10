import { ITEM_DEFINITIONS, type ItemId } from "../../shared/items";
import type { PendingItemGift } from "../../shared/item-gifts";
import { itemArtImage, itemHasGalaxyFinish, itemPresentation } from "../game/item-presentation";

type Hooks = {
  canShow: () => boolean;
  identity: () => string;
  gift: () => PendingItemGift | null;
  claim: (key: string) => Promise<{ ok: boolean; error?: string } | undefined>;
  setPaused: (paused: boolean) => void;
  showMessage: (message: string, color: string) => void;
  afterDismiss: () => void;
};

/** Uses the daily reward presentation, with account-scoped server claim receipts. */
export function createItemGiftController(hooks: Hooks) {
  const overlay = document.createElement("div");
  overlay.id = "developerItemGift";
  overlay.className = "daily-gem-bonus developer-item-gift";
  overlay.hidden = true;
  overlay.innerHTML = `<section class="daily-gem-bonus-card" role="dialog" aria-modal="true" aria-labelledby="developerItemGiftTitle">
    <div class="daily-gem-bonus-kicker">GIFT FROM DEVELOPER</div>
    <div class="daily-gem-bonus-art" aria-hidden="true"><img alt="" draggable="false" /></div>
    <h2 id="developerItemGiftTitle"></h2>
    <button class="daily-gem-claim-button" type="button">CLAIM</button>
  </section>`;
  document.body.append(overlay);
  const title = overlay.querySelector<HTMLElement>("h2")!;
  const art = overlay.querySelector<HTMLImageElement>("img")!;
  const artBox = art.parentElement!;
  const button = overlay.querySelector<HTMLButtonElement>("button")!;
  let owner = hooks.identity(), generation = 0, visible = false;
  let pending = false, celebrating = false;
  let displayed: PendingItemGift | null = null;
  let timer: number | undefined;
  const completed = new Set<string>();

  function refresh() {
    if (owner !== hooks.identity()) {
      owner = hooks.identity(); generation++;
      window.clearTimeout(timer);
      pending = celebrating = false;
      displayed = null;
      completed.clear();
    }
    if (!pending && !celebrating) displayed = hooks.gift();
    const show = hooks.canShow() && Boolean(displayed && (!completed.has(displayed.key) || celebrating));
    overlay.hidden = !show;
    overlay.classList.toggle("is-claimed", celebrating);
    overlay.setAttribute("aria-busy", String(pending));
    button.disabled = pending || celebrating;
    button.textContent = celebrating ? "CLAIMED!" : pending ? "CLAIMING…" : "CLAIM";
    if (displayed) {
      title.textContent = ITEM_DEFINITIONS[displayed.itemId as ItemId]?.name ?? "GIFT";
      const source = itemPresentation(displayed.itemId)?.inventory.source ?? "";
      if (art.getAttribute("src") !== source) art.src = source;
      // A galaxy piece's sky moves: a masked span stands in for the picture.
      const galaxy = itemHasGalaxyFinish(displayed.itemId);
      art.hidden = galaxy;
      const shown = artBox.querySelector<HTMLElement>(":scope > .item-art-image");
      if (shown?.dataset.itemId !== (galaxy ? displayed.itemId : undefined)) {
        shown?.remove();
        if (galaxy) { const span = itemArtImage(displayed.itemId); span.dataset.itemId = displayed.itemId; artBox.append(span); }
      }
    }
    hooks.setPaused(show);
    if (show && !visible) requestAnimationFrame(() => button.focus());
    visible = show;
  }
  async function claim() {
    if (!hooks.canShow() || !displayed || pending || celebrating || completed.has(displayed.key)) return;
    const gift = displayed, identity = owner, started = generation;
    pending = true;
    refresh();
    let result;
    try { result = await hooks.claim(gift.key); }
    catch { result = { ok: false, error: "GIFT UNAVAILABLE · TRY AGAIN" }; }
    if (identity !== hooks.identity() || started !== generation) return;
    pending = false;
    if (!result?.ok) {
      hooks.showMessage(result?.error ?? "GIFT UNAVAILABLE · TRY AGAIN", "#ff9b91");
      refresh();
      return;
    }
    completed.add(gift.key);
    celebrating = true;
    refresh();
    timer = window.setTimeout(() => {
      celebrating = false;
      refresh();
      hooks.afterDismiss();
    }, 900);
  }
  button.addEventListener("click", () => { void claim(); });
  refresh();
  return { refresh, isOpen: () => visible };
}
