import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { AUTO_FARM_MORE_KEY, createAutoFarmPanel } from './auto-farm-panel';
import { createAutoFarmController } from '../game/runtime/auto-farm-controller';
import { createSpawnSites } from '../game/world';
import { createGameBootstrap } from '../game/runtime/game-bootstrap';
import { ENEMY_TYPES, rewardAmountLabel } from '../game/enemies';
import { AUTO_FARM_CHOICE_KEY, AUTO_FARM_WEIGHTS_KEY } from '../game/runtime/auto-farm-plan';
import { soulCampName, SOUL_ENEMY_SPECIES } from '../game/soul-world';
import { SOUL_MAP_ID, SOUL_STAT_DETAILS, type SoulStatId } from '../../shared/soul-dimension';
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
const slider = (s: ReturnType<typeof setup>, key: string) => s.document.querySelector<HTMLInputElement>(`[data-group="${key}"] input`)!;
/** Drags a slider to `value`, as the input event reports it. */
function slide(s: ReturnType<typeof setup>, key: string, value: number) {
  const input = slider(s, key);
  input.value = String(value);
  input.dispatchEvent(new s.window.Event('input', { bubbles: true }));
}
const checked = (s: ReturnType<typeof setup>, mode: 'auto' | 'custom') => s.document.querySelector(`[data-mode="${mode}"]`)!.getAttribute('aria-checked');
it('opens on Auto, switches to Custom when a slider moves, starts farming, and stops from the floating button', () => {
  const s = setup();
  s.click('.farm-toggle');
  expect(s.sheet.open).toBe(true);
  // Auto by default, which can always start; the sliders rest at 100%.
  expect(checked(s, 'auto')).toBe('true');
  expect(s.document.querySelector('.farm-weights')!.classList.contains('is-auto')).toBe(true);
  expect(slider(s, 'stat:health').value).toBe('100');
  expect(s.document.querySelector('[data-group="stat:health"] output')!.textContent).toBe('100%');
  expect(s.document.querySelector<HTMLButtonElement>('.farm-start')!.disabled).toBe(false);
  slide(s, 'stat:health', 200);
  expect(checked(s, 'custom')).toBe('true');
  expect(checked(s, 'auto')).toBe('false');
  expect(s.document.querySelector('.farm-weights')!.classList.contains('is-auto')).toBe(false);
  expect(s.document.querySelector('[data-group="stat:health"] output')!.textContent).toBe('200%');
  expect(slider(s, 'stat:health').getAttribute('aria-valuetext')).toBe('200%');
  s.click('.farm-start');
  expect(s.sheet.open).toBe(false);
  expect(s.farm.state()).toMatchObject({ active: true, selected: 'stat:health', weights: { 'stat:health': 200 } });
  expect(s.document.querySelector('.farm-badge')!.textContent).toBe('');
  expect(s.document.querySelector('.farm-toggle')!.getAttribute('aria-pressed')).toBe('true');
  s.click('.farm-toggle');
  expect(s.farm.state().active).toBe(false);
  expect(s.sheet.open).toBe(false);
});
it('draws one slider per stat, in its colour; with every one at 0% it cannot start, and Auto keeps the sliders for later', () => {
  const s = setup(true, 'endless_1');
  s.spawnSites.push(...createSpawnSites({x: 580, y: 770}, 'endless_1'));
  s.click('.farm-toggle');
  const rows = [...s.document.querySelectorAll<HTMLElement>('.farm-weights [data-group]')];
  expect(rows.length).toBe(s.farm.choices().length);
  expect(rows.every(row => row.style.getPropertyValue('--farm-stat-color'))).toBe(true);
  expect(rows.map(row => ['min', 'max', 'step'].map(name => row.querySelector('input')!.getAttribute(name)).join())).toEqual(rows.map(() => '0,200,25'));
  for (const row of rows) slide(s, row.dataset.group!, 0);
  expect(rows.every(row => row.classList.contains('is-zero'))).toBe(true);
  expect(s.document.querySelector<HTMLButtonElement>('.farm-start')!.disabled).toBe(true);
  expect(s.document.querySelector('.farm-selection')!.textContent).toBe('Set A Stat Above 0%');
  s.click('[data-mode="auto"]');
  expect(checked(s, 'auto')).toBe('true');
  expect(s.document.querySelector<HTMLButtonElement>('.farm-start')!.disabled).toBe(false);
  expect(s.document.querySelector<HTMLElement>('.farm-selection')!.hidden).toBe(true);
  s.click('[data-mode="custom"]');
  expect(rows.map(row => row.querySelector('input')!.value)).toEqual(rows.map(() => '0'));
});
it('remembers the sliders and the mode for the next window, migrating an old route', () => {
  const s = setup(true, 'endless_1');
  s.spawnSites.push(...createSpawnSites({x: 580, y: 770}, 'endless_1'));
  vi.stubGlobal('localStorage', s.storage);
  // Before the sliders: Damage picked with two pips, nothing else.
  s.storage.setItem(AUTO_FARM_CHOICE_KEY, JSON.stringify(['stat:damage*2']));
  s.click('.farm-toggle');
  expect(checked(s, 'custom')).toBe('true');
  const values = () => Object.fromEntries([...s.document.querySelectorAll<HTMLElement>('[data-group]')].map(row => [row.dataset.group, row.querySelector('input')!.value]));
  expect(Object.entries(values()).filter(([, value]) => value !== '0')).toEqual([['stat:damage', '200']]);
  const other = Object.keys(values()).find(key => key !== 'stat:damage')!;
  slide(s, other, 25);
  s.click('.farm-start');
  expect(JSON.parse(s.storage.values.get(AUTO_FARM_WEIGHTS_KEY)!)).toMatchObject({ auto: false, weights: { 'stat:damage': 200, [other]: 25 } });
  s.click('.farm-toggle');
  s.click('.farm-toggle');
  expect(values()[other]).toBe('25');
  // Auto, started, is remembered too, the sliders with it.
  s.click('[data-mode="auto"]');
  s.click('.farm-start');
  expect(s.document.querySelector('.farm-badge')!.textContent).toBe('Auto');
  expect(JSON.parse(s.storage.values.get(AUTO_FARM_WEIGHTS_KEY)!)).toMatchObject({ auto: true, weights: { [other]: 25 } });
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
  expect(s.document.querySelector<HTMLElement>('.farm-weights')!.hidden).toBe(true);
  expect(s.document.querySelector<HTMLElement>('.farm-mode')!.closest<HTMLElement>('.farm-setting')!.hidden).toBe(true);
  s.setUnavailable('Equip a weapon to farm'); s.panel.refresh();
  expect(s.document.querySelector('.farm-selection')!.textContent).toBe('Equip a weapon to farm');
  s.setVisible(false); s.panel.refresh();
  expect(s.sheet.open).toBe(false);
  expect(s.document.querySelector<HTMLElement>('.farm-floating')!.hidden).toBe(true);
  expect(s.pause).toHaveBeenLastCalledWith(false);
});

it('shows four reward stat sliders for a generated map with one species, without enemy counts', () => {
  const s = setup(true, 'endless_1');
  s.spawnSites.push(...createSpawnSites({x: 580, y: 770}, 'endless_1'));
  s.click('.farm-toggle');
  const choices = [...s.document.querySelectorAll<HTMLElement>('[data-group]')];
  expect(choices).toHaveLength(4);
  const damage = choices.find(row => row.querySelector('.farm-weight-label')?.textContent === 'Damage')!;
  expect(damage.textContent).not.toContain('enemies');
  expect(damage.querySelector('.farm-weight-sub')!.textContent).toContain('–');
  expect(s.document.querySelector('.farm-weights')!.textContent).not.toContain('Attack Speed');
  for (const row of choices) if (row !== damage) slide(s, row.dataset.group!, 0);
  s.click('.farm-start');
  expect(s.farm.targetType()).toBe('stat:damage');
});

it('shows earned research and prestige rewards by default, then base rewards when selected', () => {
  const s = setup();
  const base = ENEMY_TYPES.Bramble.reward;
  const multiplier = researchStatRewardMultiplier({ foraging: 5, prosperity: 4 }) * prestigeStatMultiplier(2);
  s.setRewardMultiplier(multiplier);
  s.click('.farm-toggle');
  const displayedReward = () => s.document.querySelector('[data-group] .farm-weight-sub')!.textContent;
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
  expect(s.document.querySelector('[data-group] .farm-weight-sub')!.textContent).toBe(rewardAmountLabel({ ...reward, amount: reward.amount * 1.2 * 1.75 }));
  s.setShowBase(true);
  s.panel.refresh();
  expect(s.document.querySelector('[data-group] .farm-weight-sub')!.textContent).toBe(rewardAmountLabel(reward));
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
it('in the Soul Dimension draws a slider per soul stat present, in its soul colour, with its flat reward', () => {
  const s = setup(true, SOUL_MAP_ID);
  const soul = (stat: SoulStatId, camp: number) => s.spawnSites.push({ id: s.spawnSites.length, type: SOUL_ENEMY_SPECIES[stat], x: 900, y: 500 + camp * 40,
    campName: soulCampName(stat, { key: `forest:${camp}` }), leashRange: 500, alive: false, respawnAt: 50,
    definition: { ...ENEMY_TYPES[SOUL_ENEMY_SPECIES[stat]], reward: { type: 'damage', amount: 0 } } });
  soul('damage', 0); soul('damage', 1); soul('attackSpeed', 2); soul('critDamage', 3);
  // Rewards shown grown would mislead: soul rewards are flat.
  s.setRewardMultiplier(7);
  // The controller keeps the player's choice in localStorage; this one is an old campaign route.
  vi.stubGlobal('localStorage', s.storage);
  s.storage.setItem(AUTO_FARM_CHOICE_KEY, JSON.stringify(['stat:speed', 'stat:health']));
  s.click('.farm-toggle');
  const row = (stat: SoulStatId) => s.document.querySelector<HTMLElement>(`[data-group="soul:${stat}"]`)!;
  expect([...s.document.querySelectorAll<HTMLElement>('.farm-weights [data-group]')].map(entry => entry.dataset.group))
    .toEqual(['soul:damage', 'soul:attackSpeed', 'soul:critDamage']);
  for (const stat of ['damage', 'attackSpeed', 'critDamage'] as const) {
    expect(row(stat).querySelector('.farm-weight-label')!.textContent).toBe(SOUL_STAT_DETAILS[stat].label);
    expect(row(stat).style.getPropertyValue('--farm-stat-color')).toBe(SOUL_STAT_DETAILS[stat].color);
  }
  expect(row('damage').querySelector('.farm-weight-sub')!.textContent).toBe('+1');
  expect(row('attackSpeed').querySelector('.farm-weight-sub')!.textContent).toBe('+0.001');
  expect(row('critDamage').querySelector('.farm-weight-sub')!.textContent).toBe('+0.2%');
  // The campaign's Attack Speed pick opens as Soul Attack Speed at 100%; what it left unpicked is 0%.
  expect(['damage', 'attackSpeed', 'critDamage'].map(stat => slider(s, `soul:${stat}`).value)).toEqual(['0', '100', '0']);
  slide(s, 'soul:critDamage', 50);
  s.click('.farm-start');
  expect(s.farm.state()).toMatchObject({ active: true, weights: { 'soul:attackSpeed': 100, 'soul:critDamage': 50, 'soul:damage': 0 } });
});
