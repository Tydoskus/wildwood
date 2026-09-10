import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { createAutoFarmPanel } from './auto-farm-panel';
import { createAutoFarmController } from '../game/runtime/auto-farm-controller';
import { createGameBootstrap } from '../game/runtime/game-bootstrap';

let destroy: (() => void) | undefined;
afterEach(() => { destroy?.(); destroy = undefined; vi.unstubAllGlobals(); });
function setup(empty = false) {
  const { document, window } = parseHTML('<html><body><div id="hud"><div id="chatPanel"></div></div></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('HTMLElement', window.HTMLElement);
  const state = createGameBootstrap();
  state.enemies.length = 0;
  state.spawnSites.length = 0;
  if (!empty) state.spawnSites.push({ id: 1, type: 'Bramble', x: 1200, y: 500, campName: 'Test', leashRange: 500, alive: false, respawnAt: 50 });
  let unavailable: string | null = null, visible = true;
  const farm = createAutoFarmController({ ...state, mapId: () => 'forest', unavailable: () => unavailable, paused: () => false, speed: () => 300, obstacles: () => [] });
  const pause = vi.fn(), clearInput = vi.fn();
  const panel = createAutoFarmPanel({ farm, mapName: () => 'Tutorial Forest', visible: () => visible,
    unavailable: () => unavailable, setPaused: pause, clearInput });
  destroy = panel.destroy;
  const sheet = document.querySelector<HTMLDialogElement>('dialog')!;
  Object.assign(sheet, { showModal() { sheet.open = true; }, close() { sheet.open = false; } });
  const click = (selector: string) => document.querySelector(selector)!.dispatchEvent(new window.Event('click', { bubbles: true }));
  return { farm, panel, document, window, sheet, pause, clearInput, click,
    setUnavailable: (value: string | null) => { unavailable = value; }, setVisible: (value: boolean) => { visible = value; } };
}
it('opens the picker, requires a selection, starts farming, and stops from the floating button', () => {
  const s = setup();
  s.click('.farm-toggle');
  expect(s.sheet.open).toBe(true);
  expect(s.pause).toHaveBeenLastCalledWith(true);
  expect(s.document.querySelector<HTMLButtonElement>('.farm-start')!.disabled).toBe(true);
  s.click('[data-enemy="Bramble"]');
  expect(s.document.querySelector('[data-enemy="Bramble"]')!.getAttribute('aria-pressed')).toBe('true');
  expect(s.document.querySelector<HTMLButtonElement>('.farm-start')!.disabled).toBe(false);
  s.click('.farm-start');
  expect(s.sheet.open).toBe(false);
  expect(s.farm.state()).toMatchObject({ active: true, selected: 'Bramble' });
  expect(s.pause).toHaveBeenLastCalledWith(false);
  expect(s.document.querySelector('.farm-toggle')!.getAttribute('aria-pressed')).toBe('true');
  s.click('.farm-toggle');
  expect(s.farm.state().active).toBe(false);
  expect(s.sheet.open).toBe(false);
});
it('canceling the picker preserves the selected enemy without starting farming', () => {
  const s = setup(); s.farm.start('Bramble'); s.farm.stop();
  s.click('.farm-toggle');
  s.sheet.dispatchEvent(new s.window.Event('cancel', { cancelable: true }));
  expect(s.sheet.open).toBe(false);
  expect(s.pause).toHaveBeenLastCalledWith(false);
  expect(s.farm.state()).toMatchObject({ active: false, selected: 'Bramble' });
});
it('explains an empty map and disables starting when gameplay becomes unavailable', () => {
  const s = setup(true); s.click('.farm-toggle');
  expect(s.document.querySelector('.farm-empty')!.textContent).toContain('No enemies here');
  expect(s.document.querySelector<HTMLButtonElement>('.farm-start')!.disabled).toBe(true);
  s.setUnavailable('Equip a weapon to farm'); s.panel.refresh();
  expect(s.document.querySelector('.farm-selection')!.textContent).toBe('Equip a weapon to farm');
  s.setVisible(false); s.panel.refresh();
  expect(s.sheet.open).toBe(false);
  expect(s.document.querySelector<HTMLElement>('.farm-floating')!.hidden).toBe(true);
  expect(s.pause).toHaveBeenLastCalledWith(false);
});
