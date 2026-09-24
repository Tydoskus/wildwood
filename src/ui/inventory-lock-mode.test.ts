import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { createInventoryLockMode } from './inventory-lock-mode';
afterEach(() => vi.unstubAllGlobals());
it('toggles locks, shows badges and leaves the mode when closed', async () => {
  const { document } = parseHTML('<html><body><div id="panel"><button data-item-id="iron_bow"></button></div></body></html>');
  vi.stubGlobal('document', document);
  const panel = document.getElementById('panel')!;
  let locked = false;
  const setLocked = vi.fn(async (_item: string, value: boolean) => { locked = value; return { ok: true }; });
  const mode = createInventoryLockMode({ panel: panel as unknown as HTMLElement, locked: () => locked, setLocked, onEnter: vi.fn(), render: () => mode.decorate(), showMessage: vi.fn() });
  mode.button.click();
  expect(mode.active()).toBe(true);
  await mode.pick('iron_bow');
  expect(setLocked).toHaveBeenCalledWith('iron_bow', true, 0n);
  expect(panel.querySelector('.equipment-lock-badge')).not.toBeNull();
  await mode.pick('iron_bow');
  expect(panel.querySelector('.equipment-lock-badge')).toBeNull();
  mode.exit(); expect(mode.button.getAttribute('aria-pressed')).toBe('false');
});
it('marks and toggles only the selected duplicate', async () => {
  const { document } = parseHTML('<html><body><div id="panel"><button data-item-id="iron_bow"></button><button data-item-id="iron_bow" data-copy-id="9"></button></div></body></html>');
  vi.stubGlobal('document', document);
  const panel = document.getElementById('panel')!;
  const locks = new Set<bigint>();
  const mode = createInventoryLockMode({ panel: panel as unknown as HTMLElement,
    locked: (_item, copyId = 0n) => locks.has(copyId),
    setLocked: async (_item, locked, copyId = 0n) => { if (locked) locks.add(copyId); else locks.delete(copyId); return { ok: true }; },
    onEnter: vi.fn(), render: () => mode.decorate(), showMessage: vi.fn() });
  await mode.pick('iron_bow', 9n);
  expect(panel.querySelectorAll('.equipment-lock-badge')).toHaveLength(1);
  expect(panel.querySelector('[data-copy-id="9"] .equipment-lock-badge')).not.toBeNull();
  expect(panel.querySelector('button:not([data-copy-id]) .equipment-lock-badge')).toBeNull();
});
