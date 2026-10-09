import { itemDefinition, itemDisplayName } from "../../shared/items";
import { OX_SHOP_GEM_PRICE, OX_SHOP_ITEM_IDS } from "../../shared/ox-shop";
import { itemArtMarkup } from "../game/item-presentation";
import { gameConfirm, type ConfirmPrompt } from "./confirm-dialog";
import { gemSpendConfirmation } from "./gem-spend-confirmation";
import { itemInspectionButtonLabel } from "./item-inspection-controller";

type Result = { ok: boolean; error?: string } | undefined;

const SLOT_NAMES: Record<string, string> = { HEAD: "Head", CHEST: "Chest", FEET: "Feet", HAND: "Weapon" };
const gems = (amount: bigint) => `${amount} ${amount === 1n ? "Gem" : "Gems"}`;
const pieceName = (itemId: string) => itemInspectionButtonLabel(itemDisplayName(itemId));

/**
 * Ox's shop, in the bottom-right house in Town: the Galaxy set, one piece at
 * a time. The server checks the Gems and grants the look (buyOxShopCosmetic);
 * this window only shows what is for sale, what is owned, and asks first.
 */
export function createOxShopController(deps: {
  inTown: () => boolean;
  clearInput?: () => void;
  gemBalance: () => bigint;
  owns: (itemId: string) => boolean;
  buy: (itemId: string) => Promise<Result>;
  showMessage: (text: string, color: string) => void;
  confirmGemSpend?: ConfirmPrompt;
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "farm-sheet quest-sheet ox-shop-sheet";
  dialog.setAttribute("aria-labelledby", "oxShopTitle");
  dialog.innerHTML = `<header class="farm-header"><h2 id="oxShopTitle" class="window-banner"><span>Ox's Galaxy Shop</span></h2></header>`
    + `<div class="quest-body"><p class="farm-map ox-shop-intro">Gear made of drifting galaxies. Cosmetic only: it changes how you look, not your stats.</p>`
    + `<p class="ox-shop-balance"></p><div class="quest-list ox-shop-list" role="list" aria-label="Galaxy pieces"></div></div>`
    + `<footer class="farm-footer"><div class="farm-actions"><button type="button" class="window-back-button">Back</button></div></footer>`;
  document.body.append(dialog);
  const list = dialog.querySelector<HTMLElement>(".ox-shop-list")!;
  const balance = dialog.querySelector<HTMLElement>(".ox-shop-balance")!;
  const back = dialog.querySelector<HTMLButtonElement>(".window-back-button")!;
  const confirmGemSpend = deps.confirmGemSpend ?? gameConfirm;
  // A purchase is awaited; without this a second tap opens a second prompt over the first.
  let buying = false;

  function render() {
    balance.textContent = `Your Gems: ${deps.gemBalance()}`;
    list.replaceChildren(...OX_SHOP_ITEM_IDS.map(itemId => {
      const owned = deps.owns(itemId);
      const row = document.createElement("div");
      row.className = "quest-row ox-shop-row";
      row.setAttribute("role", "listitem");
      row.classList.toggle("is-owned", owned);
      row.innerHTML = `<span class="ox-shop-art">${itemArtMarkup(itemId)}</span><span class="quest-copy"><strong></strong><span class="quest-where"></span></span>`
        + `<button type="button" class="farm-start ox-shop-buy"></button>`;
      row.querySelector("strong")!.textContent = pieceName(itemId);
      row.querySelector(".quest-where")!.textContent = SLOT_NAMES[itemDefinition(itemId)?.slot ?? ""] ?? "";
      const button = row.querySelector<HTMLButtonElement>(".ox-shop-buy")!;
      button.textContent = owned ? "Owned" : gems(OX_SHOP_GEM_PRICE);
      button.disabled = owned;
      button.setAttribute("aria-label", owned ? `${pieceName(itemId)}: Owned` : `Buy ${pieceName(itemId)} for ${gems(OX_SHOP_GEM_PRICE)}`);
      button.addEventListener("click", () => { void buy(itemId); });
      return row;
    }));
  }

  async function buy(itemId: string) {
    if (buying || deps.owns(itemId)) return;
    const name = pieceName(itemId), held = deps.gemBalance();
    if (held < OX_SHOP_GEM_PRICE) {
      deps.showMessage(`Not Enough Gems · Need ${OX_SHOP_GEM_PRICE}`, "#ff9b91");
      return;
    }
    buying = true;
    try {
      const confirmation = gemSpendConfirmation(`buy ${name}`, OX_SHOP_GEM_PRICE, held);
      // The shared prompt is an ordinary overlay, and a modal dialog makes the
      // rest of the page inert, so the shop steps aside while it asks.
      dialog.close();
      const agreed = await confirmGemSpend({
        ...confirmation,
        details: [{ label: "Look", value: "Yours to wear in Cosmetics" }, ...(confirmation.details ?? [])],
        confirmLabel: "Buy",
      });
      if (!dialog.open && deps.inTown()) dialog.showModal();
      if (!agreed) return;
      const result = await deps.buy(itemId);
      if (result?.ok) deps.showMessage(`${name} Unlocked · Wear It From Cosmetics`, "#c9b8ff");
      else deps.showMessage(result?.error ?? "Not Connected", "#ff9b91");
    } finally {
      buying = false;
      if (dialog.open) render();
    }
  }

  function close() {
    if (!dialog.open) return false;
    dialog.close();
    deps.clearInput?.();
    return true;
  }

  function open() {
    if (!deps.inTown() || dialog.open) return;
    render();
    deps.clearInput?.();
    dialog.showModal();
    back.focus();
  }

  back.addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  return { open, close, isOpen: () => dialog.open, render, destroy() { close(); dialog.remove(); } };
}

/** The shop as main.ts uses it: buying through the coop session, and the bag shown as owning the piece at once. */
export function createOxShopRuntime(deps: {
  coop: () => { gemBalance?: () => bigint; buyOxShopCosmetic?: (itemId: string) => Promise<Result> } | null | undefined;
  inventory: { itemIds: string[]; cosmeticItemIds?: string[] };
  renderInventory: () => void;
  showMessage: (text: string, color: string) => void;
  clearInput?: () => void;
  inTown: () => boolean;
}) {
  const { inventory } = deps;
  return createOxShopController({
    inTown: deps.inTown, clearInput: deps.clearInput, showMessage: deps.showMessage,
    gemBalance: () => deps.coop()?.gemBalance?.() ?? 0n,
    // Developer accounts own the set through the catalogue; everyone else through a purchase.
    owns: itemId => inventory.itemIds.includes(itemId) || Boolean(inventory.cosmeticItemIds?.includes(itemId)),
    async buy(itemId) {
      const result = await deps.coop()?.buyOxShopCosmetic?.(itemId);
      if (result?.ok) {
        inventory.cosmeticItemIds = [...new Set([...(inventory.cosmeticItemIds ?? []), itemId])];
        deps.renderInventory();
      }
      return result;
    },
  });
}
