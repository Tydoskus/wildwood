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
  Object.assign(dialog, { showModal() { dialog.open = true; } });
  controller.open();
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.gem-shop-pack button')];
  expect(buttons.map(button => button.textContent)).toEqual(['$1.99', '$6.99', '$24.99', '$99.99']);
  expect(buttons.every(button => button.disabled)).toBe(true);
  buttons.forEach(button => button.dispatchEvent(new window.Event('click')));
  expect(load).not.toHaveBeenCalled(); expect(buy).not.toHaveBeenCalled();
  expect(document.querySelector('.gem-shop-notice')?.textContent).toBe('Purchases coming soon · Prices in USD');
});
