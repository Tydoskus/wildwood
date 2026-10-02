import { nativeTestPurchases } from '../app/native-purchases';
import { GEM_PACKS } from '../../shared/gem-packs';
import { isNativePreview } from '../app/native-preview';
import { PATREON_PAGE, avatarFrameAsset } from '../../shared/avatar-frames';
import { createAvatarFrameGlow } from '../app/avatar-frame-glow';
import { applyProfileIcon } from '../app/profile-icons';
import type { SupporterActions } from './avatar-frame-picker';

/** Fullscreen catalog. Checkout stays disabled until verified fulfillment exists. */
export function createGemShopController(options: {
  button: HTMLButtonElement;
  setOpen: (open: boolean) => void;
  openSupporter?: () => void;
  supporter?: Pick<SupporterActions, 'patreonStatus' | 'beginPatreonLink'>;
}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'gemShop';
  dialog.className = 'gem-shop';
  dialog.setAttribute('aria-labelledby', 'gemShopTitle');
  const nativeShop = isNativePreview();
  if (nativeShop) dialog.setAttribute('aria-describedby', 'gemShopLimit');
  dialog.innerHTML = `
    <div class="gem-shop-content">
      <header class="gem-shop-header">
        <h1 id="gemShopTitle" class="window-banner window-banner--purple"><span>Shop</span></h1>
        ${nativeShop ? '<p id="gemShopLimit">One of each pack per day · resets at 00:00 UTC</p>' : ''}
      </header>
      <div class="gem-shop-scroll">
        ${nativeShop ? '<div class="gem-shop-packs"></div><p class="gem-shop-notice">Purchases coming soon</p>' : ''}
      </div>
      <footer class="window-back-footer">
        <button class="gem-shop-back window-back-button" type="button">Back</button>
      </footer>
    </div>`;
  {
    const support = document.createElement('a');
    support.className = 'shop-patreon-button';
    support.href = PATREON_PAGE; support.target = '_blank'; support.rel = 'noopener noreferrer';
    support.innerHTML = '<span class="shop-patreon-heart" aria-hidden="true">♥</span><span><strong>Support WildStat on Patreon</strong><small>Support this game’s development and server costs</small></span><span class="shop-patreon-arrow" aria-hidden="true">↗</span>';
    dialog.querySelector('.gem-shop-scroll')!.prepend(support);
    if (options.supporter) {
      const actions = options.supporter;
      const status = document.createElement('p'); status.className = 'shop-patreon-status'; status.setAttribute('role', 'status');
      support.after(status);
      let busy = false, continueUrl = '';
      support.addEventListener('click', async event => {
        if (continueUrl) return; // A blocked popup gets an ordinary second-tap link.
        event.preventDefault();
        if (busy) return;
        busy = true; support.setAttribute('aria-disabled', 'true');
        const native = (window as unknown as { wildstatOpenPatreon?: (url: string) => Promise<void> }).wildstatOpenPatreon;
        const popup = native ? null : window.open('about:blank', '_blank');
        if (popup) popup.opener = null;
        status.textContent = 'Connecting your character…';
        try {
          const membership = await actions.patreonStatus();
          const url = membership.linked ? PATREON_PAGE : await actions.beginPatreonLink();
          const parsed = new URL(url);
          if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.patreon.com' || !['/oauth2/authorize', '/c/wildstat/membership'].includes(parsed.pathname)) throw new Error('Could not open Patreon. Try again.');
          if (native || popup) {
            if (native) await native(url); else popup!.location.replace(url);
            status.textContent = 'Finish on Patreon, then return here. Your frame applies automatically.';
          }
          else { continueUrl = url; support.href = url; status.textContent = 'Tap Support again to continue to Patreon.'; }
        } catch (error) {
          popup?.close();
          status.textContent = error instanceof Error ? error.message : 'Could not connect Patreon. Try again.';
        } finally { busy = false; support.removeAttribute('aria-disabled'); }
      });
    }
    if (options.openSupporter) {
      const connect = document.createElement('button');
      connect.type = 'button'; connect.className = 'shop-patreon-connect';
      connect.textContent = 'Already supporting? Connect your frame';
      connect.addEventListener('click', () => { close(); options.openSupporter!(); });
      support.after(connect);
    }
    // A note from the dev, in his words, with the three supporter frames under it.
    const note = document.createElement('section');
    note.className = 'shop-dev-note';
    note.setAttribute('aria-labelledby', 'shopDevNoteTitle');
    note.innerHTML = '<h2 id="shopDevNoteTitle">From the dev</h2>'
      + '<p>I’m a solo dev and I’ve been making WildStat since late July 2026. I’m building it to be the kind of game I’d want to play myself.</p>'
      + '<p>It’s still in alpha, so expect changes and the odd bug. Thanks for playing it this early.</p>'
      + '<p>Supporting on Patreon really helps. It covers the servers and lets me spend more time working on the game. More cosmetics for supporters are coming too.</p>'
      + '<div class="shop-frame-tiers" role="list" aria-label="Patreon supporter frames"></div>';
    const tiers = note.querySelector('.shop-frame-tiers')!;
    // A face in each frame, from the featured portrait sheet, so they read like they do in game.
    for (const [frame, face] of [['silver', 64], ['gold', 65], ['diamond', 66]] as const) {
      const tier = document.createElement('div');
      tier.className = 'shop-frame-tier'; tier.setAttribute('role', 'listitem');
      const portrait = document.createElement('span');
      portrait.className = 'shop-frame-portrait avatar-frame-portrait profile-icon';
      portrait.dataset.avatarFrame = frame;
      applyProfileIcon(portrait, face);
      const art = document.createElement('img');
      art.className = 'avatar-frame-art'; art.src = avatarFrameAsset(frame); art.alt = ''; art.setAttribute('aria-hidden', 'true');
      portrait.append(art, createAvatarFrameGlow());
      const name = document.createElement('span');
      name.className = 'shop-frame-name'; name.textContent = frame[0].toUpperCase() + frame.slice(1);
      tier.append(portrait, name);
      tier.setAttribute('aria-label', `${name.textContent} supporter frame`);
      tiers.append(tier);
    }
    const patreonRows = dialog.querySelectorAll('.shop-patreon-button, .shop-patreon-connect, .shop-patreon-status');
    patreonRows[patreonRows.length - 1].after(note);
  }
  let loadTestProducts = async () => {};
  if (nativeShop) {
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
    loadTestProducts = async () => {
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
    };
    const packs = dialog.querySelector<HTMLElement>('.gem-shop-packs')!;
    for (const pack of GEM_PACKS) {
      const row = document.createElement('div');
      row.className = 'gem-shop-pack';
      const amount = pack.gems === 3300 ? '3.3k' : String(pack.gems);
      row.innerHTML = `
        <img src="assets/wildstat/gems/gem-icon-v2.webp" alt="" draggable="false">
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
  }
  const back = dialog.querySelector<HTMLButtonElement>('.gem-shop-back')!;
  options.button.setAttribute('aria-controls', dialog.id);
  options.button.setAttribute('aria-expanded', 'false');
  document.body.append(dialog);
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => {
    options.setOpen(false);
    options.button.setAttribute('aria-expanded', 'false');
    if (dialog.contains(document.activeElement) || document.activeElement === document.body) options.button.focus();
  });
  // Do not let game keyboard shortcuts act on the world behind the modal.
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  dialog.addEventListener('keyup', event => event.stopPropagation());
  back.addEventListener('click', close);
  // The catalog is a normal game window, so the toolbar can switch away from it.
  options.button.closest('.settings-wrap')?.addEventListener('click', event => {
    const button = (event.target as Element).closest('button');
    if (button && button !== options.button) close();
  }, true);
  return {
    open() {
      if (dialog.open) return;
      // Non-modal dialogs leave the shared bottom toolbar interactive.
      dialog.show();
      options.setOpen(true);
      options.button.setAttribute('aria-expanded', 'true');
      back.focus();
      void loadTestProducts();
    },
    close,
    isOpen: () => dialog.open,
  };
}
