import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { createGemShopController } from './gem-shop-controller';

afterEach(() => vi.unstubAllGlobals());
it('keeps web checkout disabled and explains availability even if a test bridge exists', () => {
  const { document, window } = parseHTML('<html><body><button id="shop">Shop</button></body></html>');
  const load = vi.fn(), buy = vi.fn();
  Object.assign(window, { wildstatTestPurchases: { mode: 'test', load, buy } });
  vi.stubGlobal('window', window); vi.stubGlobal('document', document);
  const controller = createGemShopController({ button: document.querySelector('button')!, setOpen: vi.fn() });
  const dialog = document.querySelector('dialog')!;
  Object.assign(dialog, { show() { dialog.open = true; } });
  controller.open();
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.gem-shop-pack button')];
  expect(buttons.map(button => button.textContent)).toEqual(['$1.99', '$6.99', '$24.99', '$99.99']);
  expect(buttons.every(button => button.disabled)).toBe(true);
  buttons.forEach(button => button.dispatchEvent(new window.Event('click')));
  expect(load).not.toHaveBeenCalled(); expect(buy).not.toHaveBeenCalled();
  expect(document.querySelector('.gem-shop-notice')?.textContent).toBe('Purchases coming soon · Prices in USD');
});

it('opens without blocking the toolbar and closes when another toolbar window is chosen', () => {
  const { document, window } = parseHTML('<html><body><div class="settings-wrap"><button id="shop">Shop</button><button id="inventory">Inventory</button></div></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document);
  const setOpen = vi.fn();
  const controller = createGemShopController({ button: document.querySelector<HTMLButtonElement>('#shop')!, setOpen });
  const dialog = document.querySelector('dialog')!;
  const show = vi.fn(() => { dialog.open = true; });
  const showModal = vi.fn();
  Object.assign(dialog, { show, showModal, close() { dialog.open = false; dialog.dispatchEvent(new window.Event('close')); } });
  controller.open();
  expect(show).toHaveBeenCalledOnce();
  expect(showModal).not.toHaveBeenCalled();
  expect(document.getElementById('shop')!.getAttribute('aria-expanded')).toBe('true');
  document.getElementById('inventory')!.dispatchEvent(new window.Event('click', { bubbles: true }));
  expect(controller.isOpen()).toBe(false);
  expect(setOpen).toHaveBeenLastCalledWith(false);
  expect(document.getElementById('shop')!.getAttribute('aria-expanded')).toBe('false');
});
