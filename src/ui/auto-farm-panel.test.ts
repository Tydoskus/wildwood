import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { AUTO_FARM_MORE_KEY, createAutoFarmPanel } from './auto-farm-panel';
import { createAutoFarmController } from '../game/runtime/auto-farm-controller';
import { createSpawnSites } from '../game/world';
import { createGameBootstrap } from '../game/runtime/game-bootstrap';
import { ENEMY_TYPES, rewardAmountLabel } from '../game/enemies';
import { MAX_ROUTE_WEIGHT } from '../game/runtime/auto-farm-plan';
import { researchStatRewardMultiplier } from '../../shared/research';
import { prestigeStatMultiplier } from '../../shared/prestige';

let destroy: (() => void) | undefined;
afterEach(() => { destroy?.(); destroy = undefined; vi.unstubAllGlobals(); });
type FarmPush = 'safe' | 'normal' | 'bold';
/** The panel's view of a controller; tests swap in the members they steer. */
type FarmOverrides = Partial<{ bossStatus: () => string; bossStatusReady: () => boolean; push: () => FarmPush; setPush: (next: FarmPush) => void;
  pullAvailable: () => boolean }>;
function memoryStorage(values = new Map<string, string>()) {
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
function setup(empty = false, map = "forest", overrides: FarmOverrides = {}, storage = memoryStorage(), extra: Partial<Parameters<typeof createAutoFarmPanel>[0]> = {}) {
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
  const farm = Object.assign(createAutoFarmController({ ...state, mapId: () => map, unavailable: () => unavailable, paused: () => false, speed: () => 300, obstacles: () => [] }), overrides);
  const pause = vi.fn(), clearInput = vi.fn();
  const panel = createAutoFarmPanel({ farm, mapName: () => 'Tutorial Forest', visible: () => visible,
    unavailable: () => unavailable, setPaused: pause, clearInput,
    rewardMultiplier: () => rewardMultiplier, showBaseStatRewards: () => showBase,
    rewardAmount: (type, amount) => showBase ? amount : amount * rewardMultiplier * (type === 'damage' ? damageBonus : 1),
    storage: () => storage, ...extra });
  destroy = panel.destroy;
  const sheet = document.querySelector<HTMLDialogElement>('dialog')!;
  Object.assign(sheet, { showModal() { sheet.open = true; }, close() { sheet.open = false; } });
  const click = (selector: string) => document.querySelector(selector)!.dispatchEvent(new window.Event('click', { bubbles: true }));
  return { ...state, farm, panel, document, window, sheet, pause, clearInput, click, storage,
    setUnavailable: (value: string | null) => { unavailable = value; }, setVisible: (value: boolean) => { visible = value; },
    setShowBase: (value: boolean) => { showBase = value; }, setRewardMultiplier: (value: number) => { rewardMultiplier = value; },
    setDamageBonus: (value: number) => { damageBonus = value; } };
}
it('opens on Auto, numbers picked stats in order, starts farming, and stops from the floating button', () => {
  const s = setup();
  s.click('.farm-toggle');
  expect(s.sheet.open).toBe(true);
  // Nothing picked is Auto, which can always start.
  expect(s.document.querySelector('.farm-auto')!.getAttribute('aria-pressed')).toBe('true');
  expect(s.document.querySelector('.farm-auto .farm-chip-sub')!.textContent).toBe('Best Gain');
  expect(s.document.querySelector<HTMLButtonElement>('.farm-start')!.disabled).toBe(false);
  expect(s.document.querySelector<HTMLElement>('.farm-clear')!.hidden).toBe(true);
  s.click('[data-enemy="stat:health"]');
  expect(s.document.querySelector('[data-enemy="stat:health"]')!.getAttribute('aria-pressed')).toBe('true');
  expect(s.document.querySelector('[data-enemy="stat:health"] .farm-chip-order')!.textContent).toBe('1');
  expect(s.document.querySelector('.farm-auto')!.getAttribute('aria-pressed')).toBe('false');
  expect(s.document.querySelector<HTMLElement>('.farm-clear')!.hidden).toBe(false);
  s.click('.farm-start');
  expect(s.sheet.open).toBe(false);
  expect(s.farm.state()).toMatchObject({ active: true, selected: 'stat:health', plan: ['stat:health'] });
  expect(s.document.querySelector('.farm-toggle')!.getAttribute('aria-pressed')).toBe('true');
  s.click('.farm-toggle');
  expect(s.farm.state().active).toBe(false);
  expect(s.sheet.open).toBe(false);
});
it('draws one chip per stat, in its colour, and counts time there as pips until a last tap drops it', () => {
  const s = setup(true, 'endless_1');
  s.spawnSites.push(...createSpawnSites({x: 580, y: 770}, 'endless_1'));
  s.click('.farm-toggle');
  const chips = [...s.document.querySelectorAll<HTMLElement>('.farm-chips [data-enemy]')];
  expect(chips.length).toBe(s.farm.choices().length);
  expect(chips.every(chip => chip.classList.contains('farm-chip') && chip.style.getPropertyValue('--farm-stat-color'))).toBe(true);
  const [first, second] = chips.map(chip => chip.dataset.enemy!);
  const chip = (key: string) => s.document.querySelector(`[data-enemy="${key}"]`)!;
  const pipsOn = (key: string) => chip(key).querySelectorAll('.farm-pips > i.is-on').length;
  expect(chip(first).querySelectorAll('.farm-pips > i')).toHaveLength(MAX_ROUTE_WEIGHT);
  s.click(`[data-enemy="${second}"]`);
  s.click(`[data-enemy="${first}"]`);
  expect(chip(second).querySelector('.farm-chip-order')!.textContent).toBe('1');
  expect(chip(first).querySelector('.farm-chip-order')!.textContent).toBe('2');
  expect(pipsOn(first)).toBe(1);
  for (let weight = 2; weight <= MAX_ROUTE_WEIGHT; weight++) {
    s.click(`[data-enemy="${first}"]`);
    expect(pipsOn(first)).toBe(weight);
    expect(chip(first).getAttribute('aria-label')).toContain(`Time ${weight} Of ${MAX_ROUTE_WEIGHT}`);
  }
  s.click(`[data-enemy="${first}"]`);
  expect(chip(first).getAttribute('aria-pressed')).toBe('false');
  expect(chip(first).querySelector('.farm-chip-order')!.textContent).toBe('');
  expect(pipsOn(first)).toBe(0);
  expect(chip(second).querySelector('.farm-chip-order')!.textContent).toBe('1');
  s.click('.farm-clear');
  expect(s.document.querySelector('.farm-auto')!.getAttribute('aria-pressed')).toBe('true');
  expect(s.document.querySelector<HTMLElement>('.farm-clear')!.hidden).toBe(true);
});
it('canceling the picker preserves the selected enemy without starting farming', () => {
  const s = setup(); s.farm.start('Bramble'); s.farm.stop();
  s.click('.farm-toggle');
  s.sheet.dispatchEvent(new s.window.Event('cancel', { cancelable: true }));
  expect(s.sheet.open).toBe(false);
  expect(s.pause).toHaveBeenLastCalledWith(false);
  expect(s.farm.state()).toMatchObject({ active: false, selected: 'stat:health' });
});
it('explains an empty map and disables starting when gameplay becomes unavailable', () => {
  const s = setup(true); s.click('.farm-toggle');
  expect(s.document.querySelector<HTMLElement>('.farm-empty')!.hidden).toBe(false);
  expect(s.document.querySelector('.farm-empty')!.textContent).toContain('No Enemies Here');
  expect(s.document.querySelector<HTMLButtonElement>('.farm-start')!.disabled).toBe(true);
  expect(s.document.querySelector<HTMLElement>('.farm-chips')!.hidden).toBe(true);
  s.setUnavailable('Equip a weapon to farm'); s.panel.refresh();
  expect(s.document.querySelector('.farm-selection')!.textContent).toBe('Equip a weapon to farm');
  s.setVisible(false); s.panel.refresh();
  expect(s.sheet.open).toBe(false);
  expect(s.document.querySelector<HTMLElement>('.farm-floating')!.hidden).toBe(true);
  expect(s.pause).toHaveBeenLastCalledWith(false);
});

it('shows four reward stat chips for a generated map with one species, without enemy counts', () => {
  const s = setup(true, 'endless_1');
  s.spawnSites.push(...createSpawnSites({x: 580, y: 770}, 'endless_1'));
  s.click('.farm-toggle');
  const choices = [...s.document.querySelectorAll('[data-enemy]')];
  expect(choices).toHaveLength(4);
  const damage = choices.find(button => button.querySelector('.farm-chip-label')?.textContent === 'Damage')!;
  expect(damage.textContent).not.toContain('enemies');
  expect(damage.querySelector('.farm-chip-sub')!.textContent).toContain('–');
  expect(s.document.querySelector('.farm-chips')!.textContent).not.toContain('Attack Speed');
  damage.dispatchEvent(new s.window.Event('click', { bubbles: true }));
  s.click('.farm-start');
  expect(s.farm.targetType()).toBe('stat:damage');
});

it('shows earned research and prestige rewards by default, then base rewards when selected', () => {
  const s = setup();
  const base = ENEMY_TYPES.Bramble.reward;
  const multiplier = researchStatRewardMultiplier({ foraging: 5, prosperity: 4 }) * prestigeStatMultiplier(2);
  s.setRewardMultiplier(multiplier);
  s.click('.farm-toggle');
  const displayedReward = () => s.document.querySelector('[data-enemy] .farm-chip-sub')!.textContent;
  expect(displayedReward()).toBe(rewardAmountLabel({ ...base, amount: base.amount * multiplier }));
  s.setShowBase(true);
  s.panel.refresh();
  expect(displayedReward()).toBe(rewardAmountLabel(base));
  s.setShowBase(false);
  s.panel.refresh();
  expect(displayedReward()).toBe(rewardAmountLabel({ ...base, amount: base.amount * multiplier }));
});

it('shows damage rewards after a 75% damage bonus when base rewards are off', () => {
  const s = setup();
  s.spawnSites[0].type = 'Spitter';
  s.setRewardMultiplier(1.2);
  s.setDamageBonus(1.75);
  s.click('.farm-toggle');
  const reward = ENEMY_TYPES.Spitter.reward;
  expect(s.document.querySelector('[data-enemy] .farm-chip-sub')!.textContent).toBe(rewardAmountLabel({ ...reward, amount: reward.amount * 1.2 * 1.75 }));
  s.setShowBase(true);
  s.panel.refresh();
  expect(s.document.querySelector('[data-enemy] .farm-chip-sub')!.textContent).toBe(rewardAmountLabel(reward));
});
it('switches the target priority from More and marks the chosen one', () => {
  const s = setup();
  s.click('.farm-toggle');
  expect(s.document.querySelector('[data-priority="closest"]')!.getAttribute('aria-checked')).toBe('true');
  s.click('[data-priority="strongest"]');
  expect(s.farm.priority()).toBe('strongest');
  expect(s.document.querySelector('[data-priority="strongest"]')!.getAttribute('aria-checked')).toBe('true');
  expect(s.document.querySelector('[data-priority="closest"]')!.getAttribute('aria-checked')).toBe('false');
});
it('leaves the map name and the long hint out, and names Move On', () => {
  const s = setup();
  s.click('.farm-toggle');
  expect(s.document.querySelector('.farm-map')).toBeNull();
  expect(s.sheet.textContent).not.toContain('Tutorial Forest');
  expect(s.sheet.textContent).not.toContain('Tap in order');
  expect(s.document.querySelector('[data-switch="advance"]')!.textContent).toContain('Move On');
  expect(s.sheet.textContent).not.toContain('Boss & Next Map');
  expect(s.document.querySelector('.farm-pull')!.getAttribute('aria-labelledby')).toBe('autoFarmPullLabel');
  expect(s.document.getElementById('autoFarmPullLabel')!.textContent).toBe('Pull Whole Group');
});
it('shows the boss status under Move On and lights it only when the controller calls it ready and Move On is on', () => {
  let status = 'Boss At 1.2K', ready = false;
  const s = setup(false, 'forest', { bossStatus: () => status, bossStatusReady: () => ready });
  s.farm.setAdvance(true);
  s.click('.farm-toggle');
  const element = s.document.querySelector('[data-switch="advance"] .farm-boss-status')!;
  expect(s.document.querySelector('[data-switch="advance"]')!.getAttribute('aria-describedby')).toBe(element.id);
  expect(element.textContent).toBe('Boss At 1.2K');
  expect(element.classList.contains('is-ready')).toBe(false);
  status = 'Boss Next'; ready = true; s.panel.refresh();
  expect(element.textContent).toBe('Boss Next');
  expect(element.classList.contains('is-ready')).toBe(true);
  s.click('[data-switch="advance"]');
  expect(s.farm.advance()).toBe(false);
  expect(s.document.querySelector('[data-switch="advance"]')!.getAttribute('aria-checked')).toBe('false');
  // Off, it is what Move On would do, told quietly.
  expect(element.classList.contains('is-ready')).toBe(false);
  expect(element.classList.contains('is-idle')).toBe(true);
});
it('keeps More folded by default, and remembers it open or closed', () => {
  const storage = memoryStorage();
  const s = setup(false, 'forest', {}, storage);
  s.click('.farm-toggle');
  const more = () => s.document.querySelector<HTMLElement>('.farm-more')!;
  const toggle = () => s.document.querySelector('.farm-more-toggle')!;
  expect(more().hidden).toBe(true);
  expect(toggle().getAttribute('aria-expanded')).toBe('false');
  expect(toggle().getAttribute('aria-controls')).toBe(more().id);
  s.click('.farm-more-toggle');
  expect(more().hidden).toBe(false);
  expect(toggle().getAttribute('aria-expanded')).toBe('true');
  expect(storage.values.get(AUTO_FARM_MORE_KEY)).toBe('1');
  s.panel.destroy();
  // A new window reads it back open.
  const again = setup(false, 'forest', {}, storage);
  destroy = again.panel.destroy;
  expect(again.document.querySelector<HTMLElement>('.farm-more')!.hidden).toBe(false);
  again.click('.farm-more-toggle');
  expect(storage.values.get(AUTO_FARM_MORE_KEY)).toBe('0');
});
it('opens even when storage throws', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const s = setup(false, 'forest', {}, broken as unknown as ReturnType<typeof memoryStorage>);
  s.click('.farm-toggle');
  expect(s.document.querySelector<HTMLElement>('.farm-more')!.hidden).toBe(true);
  s.click('.farm-more-toggle');
  expect(s.document.querySelector<HTMLElement>('.farm-more')!.hidden).toBe(false);
});
it('sets Pull Whole Group from its Off and On, and rests it during an Aggro run', () => {
  let available = true;
  const s = setup(false, 'forest', { pullAvailable: () => available });
  s.click('.farm-toggle');
  const button = (id: 'on' | 'off') => s.document.querySelector<HTMLButtonElement>(`[data-pull="${id}"]`)!;
  s.click('[data-pull="on"]');
  expect(s.farm.pullAll()).toBe(true);
  expect(button('on').getAttribute('aria-checked')).toBe('true');
  expect(button('off').getAttribute('aria-checked')).toBe('false');
  s.click('[data-pull="off"]');
  expect(s.farm.pullAll()).toBe(false);
  available = false; s.panel.refresh();
  expect(button('on').disabled).toBe(true);
  s.click('[data-pull="on"]');
  expect(s.farm.pullAll()).toBe(false);
});
it('picks how hard to push, and rests the picker while Move On is off', () => {
  let push: FarmPush = 'normal';
  const setPush = vi.fn((next: FarmPush) => { push = next; });
  const s = setup(false, 'forest', { push: () => push, setPush });
  s.farm.setAdvance(false);
  s.click('.farm-toggle');
  const row = s.document.querySelector('.farm-push')!;
  const button = (id: FarmPush) => s.document.querySelector<HTMLButtonElement>(`[data-push="${id}"]`)!;
  expect([...row.querySelectorAll('[data-push]')].map(entry => entry.textContent)).toEqual(['Safe', 'Normal', 'Bold']);
  expect(button('normal').getAttribute('aria-checked')).toBe('true');
  // Off, it shows the setting but takes no change.
  expect(row.classList.contains('is-off')).toBe(true);
  expect(button('bold').disabled).toBe(true);
  s.click('[data-push="bold"]');
  expect(setPush).not.toHaveBeenCalled();
  s.click('[data-switch="advance"]');
  expect(row.classList.contains('is-off')).toBe(false);
  expect(button('bold').disabled).toBe(false);
  s.click('[data-push="bold"]');
  expect(setPush).toHaveBeenLastCalledWith('bold');
  expect(button('bold').getAttribute('aria-checked')).toBe('true');
  expect(button('normal').getAttribute('aria-checked')).toBe('false');
});
it('during an Aggro run the button opens the group picker, whose Target is the farm window\'s own', () => {
  let active = true;
  const s = setup(false, 'forest', {}, memoryStorage(), { aggro: () => ({ active, completed: 0 }), identity: () => 'me' });
  s.click('.farm-toggle');
  expect(s.sheet.open).toBeFalsy();
  expect(s.document.querySelector<HTMLElement>('.aggro-pick-overlay')!.hidden).toBe(false);
  s.click('.aggro-pick-target [data-priority="lowest"]');
  expect(s.farm.priority()).toBe('lowest');
  // After the run, the farm window shows the same choice.
  active = false;
  s.click('.farm-toggle');
  expect(s.sheet.open).toBe(true);
  expect(s.document.querySelector('#autoFarmSheet .farm-target [data-priority="lowest"]')!.getAttribute('aria-checked')).toBe('true');
});
