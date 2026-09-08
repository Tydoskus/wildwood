import { nativeTestPurchases } from '../app/native-purchases';
import { GEM_PACKS } from '../../shared/gem-packs';

/** Fullscreen catalog. Checkout stays disabled until verified fulfillment exists. */
export function createGemShopController(options: {
  button: HTMLButtonElement;
  setOpen: (open: boolean) => void;
}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'gemShop';
  dialog.className = 'gem-shop';
  dialog.setAttribute('aria-labelledby', 'gemShopTitle');
  dialog.setAttribute('aria-describedby', 'gemShopLimit');
  dialog.innerHTML = `
    <div class="gem-shop-content">
      <header class="gem-shop-header">
        <h1 id="gemShopTitle">Shop</h1>
        <p id="gemShopLimit">One of each pack per day · resets at 00:00 UTC</p>
      </header>
      <div class="gem-shop-packs"></div>
      <p class="gem-shop-notice">Purchases coming soon · Prices in USD</p>
      <button class="gem-shop-back" type="button">Back</button>
    </div>`;
  const testStore = nativeTestPurchases();
  const notice = dialog.querySelector<HTMLElement>('.gem-shop-notice')!;
  notice.setAttribute('role', 'status');
  const buttons = new Map<string, HTMLButtonElement>();
  let purchasePending = false;
  let loaded = false;
  const available = new Set<string>();
  const refreshButtons = () => {
    for (const [id, button] of buttons) button.disabled = purchasePending || !available.has(id);
  };
  async function loadTestProducts() {
    if (!testStore || loaded) return;
    notice.textContent = 'Loading test purchases…';
    try {
      const products = await testStore.load();
      for (const product of products) {
        const button = buttons.get(product.id);
        if (!button) continue;
        button.textContent = product.price;
        button.setAttribute('aria-label', `Test purchase: ${product.title}, ${product.price}. No charge or Gems.`);
        available.add(product.id);
      }
      loaded = true;
      notice.textContent = 'Test purchases · no charge or Gems';
      refreshButtons();
    } catch {
      notice.textContent = 'Test Store unavailable. Reopen Shop to retry.';
    }
  }
  const packs = dialog.querySelector<HTMLElement>('.gem-shop-packs')!;
  for (const pack of GEM_PACKS) {
    const row = document.createElement('div');
    row.className = 'gem-shop-pack';
    const amount = pack.gems === 3300 ? '3.3k' : String(pack.gems);
    row.innerHTML = `
      <img src="assets/wildstat/gems/gem-icon-v2.png" alt="" draggable="false">
      <div class="gem-shop-amount"><strong>${amount}</strong><span>Gems</span></div>
      <button type="button" disabled aria-label="${pack.gems} Gems for $${(pack.priceCents / 100).toFixed(2)} USD. Purchases coming soon.">$${(pack.priceCents / 100).toFixed(2)}</button>`;
    const button = row.querySelector<HTMLButtonElement>('button')!;
    buttons.set(pack.id, button);
    button.addEventListener('click', async () => {
      if (!testStore || purchasePending || !available.has(pack.id)) return;
      purchasePending = true;
      refreshButtons();
      notice.textContent = 'Test purchase in progress…';
      try {
        await testStore.buy(pack.id);
        notice.textContent = 'Test successful · no charge or Gems added';
      } catch (error) {
        notice.textContent = error && typeof error === 'object' && 'userCancelled' in error && error.userCancelled
          ? 'Test canceled · no charge or Gems added'
          : 'Test purchase failed. Try again.';
      } finally {
        purchasePending = false;
        refreshButtons();
      }
    });
    packs.append(row);
  }
  const back = dialog.querySelector<HTMLButtonElement>('.gem-shop-back')!;
  options.button.setAttribute('aria-controls', dialog.id);
  options.button.setAttribute('aria-expanded', 'false');
  document.body.append(dialog);
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => {
    options.setOpen(false);
    options.button.setAttribute('aria-expanded', 'false');
    options.button.focus();
  });
  // Do not let game keyboard shortcuts act on the world behind the modal.
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  dialog.addEventListener('keyup', event => event.stopPropagation());
  back.addEventListener('click', close);
  return {
    open() {
      if (dialog.open) return;
      dialog.showModal();
      options.setOpen(true);
      options.button.setAttribute('aria-expanded', 'true');
      back.focus();
      void loadTestProducts();
    },
    close,
    isOpen: () => dialog.open,
  };
}
