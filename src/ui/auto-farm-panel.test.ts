import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { createAutoFarmPanel } from './auto-farm-panel';
import { createAutoFarmController } from '../game/runtime/auto-farm-controller';
import { createSpawnSites } from '../game/world';
import { createGameBootstrap } from '../game/runtime/game-bootstrap';
import { ENEMY_TYPES, rewardLabel } from '../game/enemies';
import { researchStatRewardMultiplier } from '../../shared/research';
import { prestigeStatMultiplier } from '../../shared/prestige';

let destroy: (() => void) | undefined;
afterEach(() => { destroy?.(); destroy = undefined; vi.unstubAllGlobals(); });
function setup(empty = false, map = "forest") {
  const { document, window } = parseHTML('<html><body><div id="hud"><div id="chatPanel"></div></div></body></html>');
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('HTMLElement', window.HTMLElement);
  const state = createGameBootstrap();
  state.enemies.length = 0;
  state.spawnSites.length = 0;
  if (!empty) state.spawnSites.push({ id: 1, type: 'Bramble', x: 1200, y: 500, campName: 'Test', leashRange: 500, alive: false, respawnAt: 50 });
  let unavailable: string | null = null, visible = true;
  let showBase = false;
  let rewardMultiplier = 1;
  let damageBonus = 1;
  const farm = createAutoFarmController({ ...state, mapId: () => map, unavailable: () => unavailable, paused: () => false, speed: () => 300, obstacles: () => [] });
  const pause = vi.fn(), clearInput = vi.fn();
  const panel = createAutoFarmPanel({ farm, mapName: () => 'Tutorial Forest', visible: () => visible,
    unavailable: () => unavailable, setPaused: pause, clearInput,
    rewardMultiplier: () => rewardMultiplier, showBaseStatRewards: () => showBase,
    rewardAmount: (type, amount) => showBase ? amount : amount * rewardMultiplier * (type === 'damage' ? damageBonus : 1) });
  destroy = panel.destroy;
  const sheet = document.querySelector<HTMLDialogElement>('dialog')!;
  Object.assign(sheet, { showModal() { sheet.open = true; }, close() { sheet.open = false; } });
  const click = (selector: string) => document.querySelector(selector)!.dispatchEvent(new window.Event('click', { bubbles: true }));
  return { ...state, farm, panel, document, window, sheet, pause, clearInput, click,
    setUnavailable: (value: string | null) => { unavailable = value; }, setVisible: (value: boolean) => { visible = value; },
    setShowBase: (value: boolean) => { showBase = value; }, setRewardMultiplier: (value: number) => { rewardMultiplier = value; },
    setDamageBonus: (value: number) => { damageBonus = value; } };
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

it('shows four reward camp choices for a generated map with one species', () => {
  const s = setup(true, 'endless_1');
  s.spawnSites.push(...createSpawnSites({x: 580, y: 770}, 'endless_1'));
  s.click('.farm-toggle');
  const choices = [...s.document.querySelectorAll('.farm-enemy')];
  expect(choices).toHaveLength(4);
  const damage = choices.find(button => button.querySelector('.farm-reward')?.textContent?.includes('DAMAGE'))!;
  expect(damage.textContent).toContain(`13 × ${s.spawnSites[0].type}`);
  expect(damage.querySelector('.farm-reward')!.textContent).toContain('–');
  expect(s.document.querySelector('.farm-choices')!.textContent).not.toContain('Attack Speed');
  damage.dispatchEvent(new s.window.Event('click', { bubbles: true }));
  s.click('.farm-start');
  expect(s.farm.targetCamp()).toBe('Damage Camp');
});

it('shows earned research and prestige rewards by default, then base rewards when selected', () => {
  const s = setup();
  const base = ENEMY_TYPES.Bramble.reward;
  const multiplier = researchStatRewardMultiplier({ foraging: 5, prosperity: 4 }) * prestigeStatMultiplier(2);
  s.setRewardMultiplier(multiplier);
  s.click('.farm-toggle');
  const displayedReward = () => s.document.querySelector('.farm-reward')!.textContent;
  expect(displayedReward()).toBe(rewardLabel({ ...base, amount: base.amount * multiplier }));
  s.setShowBase(true);
  s.panel.refresh();
  expect(displayedReward()).toBe(rewardLabel(base));
  s.setShowBase(false);
  s.panel.refresh();
  expect(displayedReward()).toBe(rewardLabel({ ...base, amount: base.amount * multiplier }));
});

it('shows damage rewards after a 75% damage bonus when base rewards are off', () => {
  const s = setup();
  s.spawnSites[0].type = 'Spitter';
  s.setRewardMultiplier(1.2);
  s.setDamageBonus(1.75);
  s.click('.farm-toggle');
  const reward = ENEMY_TYPES.Spitter.reward;
  expect(s.document.querySelector('.farm-reward')!.textContent).toBe(rewardLabel({ ...reward, amount: reward.amount * 1.2 * 1.75 }));
  s.setShowBase(true);
  s.panel.refresh();
  expect(s.document.querySelector('.farm-reward')!.textContent).toBe(rewardLabel(reward));
});
it('switches the target priority from the window and marks the chosen one', () => {
  const s = setup();
  s.click('.farm-toggle');
  expect(s.document.querySelector('[data-priority="closest"]')!.getAttribute('aria-checked')).toBe('true');
  s.click('[data-priority="strongest"]');
  expect(s.farm.priority()).toBe('strongest');
  expect(s.document.querySelector('[data-priority="strongest"]')!.getAttribute('aria-checked')).toBe('true');
  expect(s.document.querySelector('[data-priority="closest"]')!.getAttribute('aria-checked')).toBe('false');
});
