import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { AUTO_FARM_EXPANDED_KEY, AUTO_FARM_MORE_KEY, createAutoFarmPanel } from './auto-farm-panel';
import { createAutoFarmController } from '../game/runtime/auto-farm-controller';
import { createSpawnSites } from '../game/world';
import { createGameBootstrap } from '../game/runtime/game-bootstrap';
import { ENEMY_TYPES, rewardAmountLabel } from '../game/enemies';
import { AUTO_FARM_CHOICE_KEY, AUTO_FARM_SHARES_KEY, AUTO_FARM_WEIGHTS_KEY } from '../game/runtime/auto-farm-plan';
import { soulCampName, SOUL_ENEMY_SPECIES } from '../game/soul-world';
import { SOUL_MAP_ID, SOUL_STAT_DETAILS, type SoulStatId } from '../../shared/soul-dimension';
import { researchStatRewardMultiplier } from '../../shared/research';
import { prestigeStatMultiplier } from '../../shared/prestige';

let destroy: (() => void) | undefined;
afterEach(() => { destroy?.(); destroy = undefined; vi.unstubAllGlobals(); });
/** The panel's view of a controller; tests swap in the members they steer. */
type FarmOverrides = Partial<{ moveStatus: () => string; moveReady: () => boolean; bossStatus: () => string; bossReady: () => boolean; pullAvailable: () => boolean }>;
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
  const sheet = document.querySelector<HTMLElement>('#autoFarmSheet')!;
  const content = sheet.querySelector<HTMLElement>('.farm-card-content')!;
  const click = (selector: string) => document.querySelector(selector)!.dispatchEvent(new window.Event('click', { bubbles: true }));
  return { ...state, farm, panel, document, window, sheet, content, pause, clearInput, click, storage,
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
const values = (s: ReturnType<typeof setup>) => Object.fromEntries([...s.document.querySelectorAll<HTMLElement>('[data-group]')]
  .map(row => [row.dataset.group!, Number(row.querySelector('input')!.value)]));
/** The share each slider shows beside it, as a number. */
const shown = (s: ReturnType<typeof setup>) => Object.fromEntries([...s.document.querySelectorAll<HTMLElement>('.farm-weights [data-group]')]
  .map(row => [row.dataset.group!, Number.parseInt(row.querySelector('output')!.textContent!, 10)]));
const sum = (shares: Record<string, number>) => Object.values(shares).reduce((total, share) => total + share, 0);
it('opens on an even split, moves each slider on its own with its share of 100% beside it, starts farming, and stops from the card', () => {
  const s = setup(true, 'endless_1');
  s.spawnSites.push(...createSpawnSites({x: 580, y: 770}, 'endless_1'));
  s.click('.farm-toggle');
  expect(!s.content.hidden).toBe(true);
  // No Auto or Custom: the sliders are the choice.
  expect(s.document.querySelector('[data-mode]')).toBeNull();
  const keys = Object.keys(values(s));
  expect(keys.length).toBe(4);
  expect(Object.values(values(s))).toEqual([25, 25, 25, 25]);
  expect(s.document.querySelector(`[data-group="${keys[0]}"] output`)!.textContent).toBe('25%');
  // Moving one moves only it; the shares beside them still add up to 100%.
  slide(s, keys[0], 75);
  expect(values(s)).toEqual({ [keys[0]]: 75, [keys[1]]: 25, [keys[2]]: 25, [keys[3]]: 25 });
  expect(shown(s)).toEqual({ [keys[0]]: 50, [keys[1]]: 17, [keys[2]]: 17, [keys[3]]: 16 });
  expect(slider(s, keys[0]).getAttribute('aria-valuetext')).toBe('50%');
  // One stat alone: the rest to 0.
  for (const key of [keys[0], keys[2], keys[3]]) slide(s, key, 0);
  expect(shown(s)).toEqual({ [keys[0]]: 0, [keys[1]]: 100, [keys[2]]: 0, [keys[3]]: 0 });
  expect(s.document.querySelector(`[data-group="${keys[0]}"]`)!.classList.contains('is-zero')).toBe(true);
  for (const value of [3, 99, 0, 41]) { slide(s, keys[2], value); expect(sum(shown(s))).toBe(100); }
  slide(s, keys[2], 0);
  s.click('.farm-start');
  expect(!s.content.hidden).toBe(false);
  expect(s.farm.state()).toMatchObject({ active: true, selected: keys[1], shares: { [keys[1]]: 100 } });
  expect(s.document.querySelector('.farm-badge')!.textContent).toBe('Farming');
  expect(s.document.querySelector('.farm-toggle')!.getAttribute('aria-expanded')).toBe('false');
  // Tapped while farming it opens the window, farming on and unpaused; Stop ends it.
  s.pause.mockClear();
  s.click('.farm-toggle');
  expect(!s.content.hidden).toBe(true);
  expect(s.farm.state().active).toBe(true);
  expect(s.pause).not.toHaveBeenCalledWith(true);
  expect(s.document.querySelector('.farm-close')!.textContent).toBe('Stop');
  expect(s.document.querySelector('.farm-start')!.textContent).toBe('Done');
  s.click('.farm-close');
  expect(s.farm.state().active).toBe(false);
  expect(!s.content.hidden).toBe(false);
});

it('opened while farming, Done keeps farming, applying slider changes; the window shows the live switch lines', () => {
  const s = setup(true, 'endless_1');
  s.spawnSites.push(...createSpawnSites({x: 580, y: 770}, 'endless_1'));
  s.click('.farm-toggle');
  const keys = Object.keys(values(s));
  s.click('.farm-start');
  expect(s.farm.state().active).toBe(true);
  s.pause.mockClear();
  s.click('.farm-toggle');
  expect(!s.content.hidden).toBe(true);
  expect(s.pause).not.toHaveBeenCalled();
  // Done with nothing changed: still farming, same shares.
  s.click('.farm-start');
  expect(!s.content.hidden).toBe(false);
  expect(s.farm.state()).toMatchObject({ active: true, shares: { [keys[0]]: 25 } });
  // Changed: farming goes on with the new sliders.
  s.click('.farm-toggle');
  for (const key of keys.slice(1)) slide(s, key, 0);
  s.click('.farm-start');
  expect(s.farm.state()).toMatchObject({ active: true, shares: { [keys[0]]: 100 } });
  // Closed from outside (Escape): farming goes on.
  s.click('.farm-toggle');
  s.sheet.dispatchEvent(Object.assign(new s.window.Event('keydown'), { key: 'Escape' }));
  expect(!s.content.hidden).toBe(false);
  expect(s.farm.state().active).toBe(true);
});
it('draws one slider per stat, in its colour, from 0 to 100; with every one at 0 there is nothing to start', () => {
  const s = setup(true, 'endless_1');
  s.spawnSites.push(...createSpawnSites({x: 580, y: 770}, 'endless_1'));
  s.click('.farm-toggle');
  const rows = [...s.document.querySelectorAll<HTMLElement>('.farm-weights [data-group]')];
  expect(rows.length).toBe(s.farm.choices().length);
  expect(rows.every(row => row.style.getPropertyValue('--farm-stat-color'))).toBe(true);
  expect(rows.map(row => ['min', 'max', 'step'].map(name => row.querySelector('input')!.getAttribute(name)).join())).toEqual(rows.map(() => '0,100,1'));
  for (const row of rows) slide(s, row.dataset.group!, 0);
  expect(sum(shown(s))).toBe(0);
  expect(s.document.querySelector<HTMLButtonElement>('.farm-start')!.disabled).toBe(true);
  expect(s.document.querySelector('.farm-selection')!.textContent).toBe('Set A Stat Above 0%');
  slide(s, rows[0].dataset.group!, 10);
  expect(s.document.querySelector<HTMLButtonElement>('.farm-start')!.disabled).toBe(false);
});
it('remembers the sliders for the next window, migrating the old 0-200% ones and an old Auto', () => {
  const s = setup(true, 'endless_1');
  s.spawnSites.push(...createSpawnSites({x: 580, y: 770}, 'endless_1'));
  vi.stubGlobal('localStorage', s.storage);
  // The old sliders: Damage at 200%, one at 0%, the rest never set (100%).
  const keys = s.farm.choices().map(choice => choice.key), zero = keys.find(key => key !== 'stat:damage')!;
  s.storage.setItem(AUTO_FARM_WEIGHTS_KEY, JSON.stringify({ auto: false, weights: { 'stat:damage': 200, [zero]: 0 } }));
  s.click('.farm-toggle');
  expect(values(s)).toEqual(Object.fromEntries(keys.map(key => [key, key === 'stat:damage' ? 50 : key === zero ? 0 : 25])));
  slide(s, zero, 40);
  s.click('.farm-start');
  const saved = JSON.parse(s.storage.values.get(AUTO_FARM_SHARES_KEY)!);
  expect(sum(saved)).toBe(100);
  // 40 beside 50, 25 and 25: its share of the four.
  expect(Math.abs(saved[zero] - 40 / 140 * 100)).toBeLessThanOrEqual(1);
  s.click('.farm-toggle');
  expect(values(s)).toEqual(saved);
  // An old Auto, with nothing saved since, opens as an even split.
  s.click('.farm-close');
  s.storage.values.delete(AUTO_FARM_SHARES_KEY);
  s.storage.setItem(AUTO_FARM_WEIGHTS_KEY, JSON.stringify({ auto: true, weights: { 'stat:damage': 200 } }));
  s.click('.farm-toggle');
  expect(Object.values(values(s))).toEqual(keys.map(() => 25));
});
it('canceling the picker preserves the selected enemy without starting farming', () => {
  const s = setup(); s.farm.start('Bramble'); s.farm.stop();
  s.click('.farm-toggle');
  s.sheet.dispatchEvent(Object.assign(new s.window.Event('keydown', { cancelable: true }), { key: 'Escape' }));
  expect(!s.content.hidden).toBe(false);
  expect(s.pause).not.toHaveBeenCalled();
  expect(s.farm.state()).toMatchObject({ active: false, selected: 'stat:health' });
});
it('explains an empty map and disables starting when gameplay becomes unavailable', () => {
  const s = setup(true); s.click('.farm-toggle');
  expect(s.document.querySelector<HTMLElement>('.farm-empty')!.hidden).toBe(false);
  expect(s.document.querySelector('.farm-empty')!.textContent).toContain('No Enemies Here');
  expect(s.document.querySelector<HTMLButtonElement>('.farm-start')!.disabled).toBe(true);
  expect(s.document.querySelector<HTMLElement>('.farm-weights')!.hidden).toBe(true);
  expect(s.document.querySelector<HTMLElement>('.farm-stats-heading')!.hidden).toBe(true);
  s.setUnavailable('Equip a weapon to farm'); s.panel.refresh();
  expect(s.document.querySelector('.farm-selection')!.textContent).toBe('Equip a weapon to farm');
  s.setVisible(false); s.panel.refresh();
  expect(s.sheet.hidden).toBe(true);
  s.setVisible(true); s.panel.refresh();
  expect(s.sheet.hidden).toBe(false);
  expect(s.content.hidden).toBe(false);
  expect(s.pause).not.toHaveBeenCalled();
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
it('shows each switch with its own status, lit only when the controller says it is going and the switch is on', () => {
  let move = 'Next Map At 1.20K', moveReady = false, boss = 'Boss At 1.20K', bossReady = false;
  const s = setup(false, 'forest', { moveStatus: () => move, moveReady: () => moveReady, bossStatus: () => boss, bossReady: () => bossReady });
  s.farm.setAdvance(true);
  s.click('.farm-toggle');
  const line = (name: string) => s.document.querySelector(`[data-switch="${name}"] .farm-boss-status`)!;
  expect(s.document.querySelector('[data-switch="advance"]')!.getAttribute('aria-describedby')).toBe(line('advance').id);
  expect(s.document.querySelector('[data-switch="bosses"]')!.getAttribute('aria-describedby')).toBe(line('bosses').id);
  expect(line('advance').textContent).toBe('Next Map At 1.20K');
  expect(line('bosses').textContent).toBe('Boss At 1.20K');
  expect(line('advance').classList.contains('is-ready')).toBe(false);
  move = 'Moving On'; moveReady = true; s.panel.refresh();
  expect(line('advance').textContent).toBe('Moving On');
  expect(line('advance').classList.contains('is-ready')).toBe(true);
  // Fight Bosses off: its line is what it would do, told quietly; on, lit when it goes.
  expect(line('bosses').classList.contains('is-idle')).toBe(true);
  s.click('[data-switch="bosses"]');
  expect(s.farm.fightBosses()).toBe(true);
  expect(s.document.querySelector('[data-switch="bosses"]')!.getAttribute('aria-checked')).toBe('true');
  boss = 'Fighting Boss'; bossReady = true; s.panel.refresh();
  expect(line('bosses').textContent).toBe('Fighting Boss');
  expect(line('bosses').classList.contains('is-ready')).toBe(true);
  s.click('[data-switch="advance"]');
  expect(s.farm.advance()).toBe(false);
  expect(line('advance').classList.contains('is-ready')).toBe(false);
  expect(line('advance').classList.contains('is-idle')).toBe(true);
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
it('has no Push setting, and keeps Pull Whole Group and Target under More', () => {
  const s = setup();
  s.click('.farm-toggle');
  expect(s.document.querySelector('.farm-push')).toBeNull();
  expect(s.document.querySelector('[data-push]')).toBeNull();
  const more = s.document.querySelector('.farm-more')!;
  expect(more.querySelector('.farm-pull')).not.toBeNull();
  expect(more.querySelector('.farm-target')).not.toBeNull();
  expect([...s.document.querySelectorAll('.farm-body > [data-switch]')].map(entry => entry.getAttribute('data-switch'))).toEqual(['advance', 'bosses']);
});
it('during an Aggro run the button opens the group picker, whose Target is the farm window\'s own', () => {
  let active = true;
  const s = setup(false, 'forest', {}, memoryStorage(), { aggro: () => ({ active, completed: 0 }), identity: () => 'me' });
  s.click('.farm-toggle');
  expect(!s.content.hidden).toBeFalsy();
  expect(s.document.querySelector<HTMLElement>('.aggro-pick-overlay')!.hidden).toBe(false);
  s.click('.aggro-pick-target [data-priority="lowest"]');
  expect(s.farm.priority()).toBe('lowest');
  // After the run, the farm window shows the same choice.
  active = false;
  s.click('.farm-toggle');
  expect(!s.content.hidden).toBe(true);
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
  expect(s.farm.state()).toMatchObject({ active: true, shares: { 'soul:attackSpeed': 67, 'soul:critDamage': 33, 'soul:damage': 0 } });
});

it('the ? opens a page saying what each control does in place of the settings; Back returns to them, then closes', () => {
  const s = setup();
  s.click('.farm-toggle');
  const help = s.document.querySelector<HTMLElement>('.farm-help')!, body = s.document.querySelector<HTMLElement>('.farm-body')!;
  const toggle = s.document.querySelector('.farm-help-toggle')!;
  expect(help.hidden).toBe(true);
  s.click('.farm-help-toggle');
  expect(help.hidden).toBe(false);
  expect(body.hidden).toBe(true);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  // Every control in the window is explained.
  const terms = [...help.querySelectorAll('dt')].map(term => term.textContent);
  expect(terms).toEqual(['Sliders', 'Move On', 'Fight Bosses', 'Deaths', 'Pull Whole Group', 'Target']);
  expect([...help.querySelectorAll('dd')].every(line => (line.textContent ?? '').length > 10)).toBe(true);
  s.click('.farm-close');
  expect(!s.content.hidden).toBe(true);
  expect(help.hidden).toBe(true);
  expect(body.hidden).toBe(false);
  s.click('.farm-close');
  expect(!s.content.hidden).toBe(false);
  // Reopened, it starts on the settings even if it was closed from the help page.
  s.click('.farm-toggle');
  s.click('.farm-help-toggle');
  s.panel.close();
  s.click('.farm-toggle');
  expect(help.hidden).toBe(true);
  expect(body.hidden).toBe(false);
});

it('Fight At sets how much of the boss power to wait for, 0.1x to 10x with 1x in the middle, and rests while Fight Bosses is off', () => {
  const s = setup();
  s.click('.farm-toggle');
  const row = s.document.querySelector<HTMLElement>('.farm-boss-power')!, slider = row.querySelector('input')!;
  expect(row.querySelector('output')!.textContent).toBe('1x');
  expect(slider.getAttribute('min')).toBe('0');
  expect(slider.getAttribute('max')).toBe('10');
  expect(slider.value).toBe('5');
  // Off by default for a new player: the slider rests.
  expect(s.farm.fightBosses()).toBe(false);
  expect(slider.disabled).toBe(true);
  expect(row.classList.contains('is-off')).toBe(true);
  s.click('[data-switch="bosses"]');
  expect(slider.disabled).toBe(false);
  slider.value = '0';
  slider.dispatchEvent(new s.window.Event('input', { bubbles: true }));
  expect(s.farm.bossPower()).toBe(.1);
  expect(row.querySelector('output')!.textContent).toBe('0.1x');
  slider.value = '10';
  slider.dispatchEvent(new s.window.Event('input', { bubbles: true }));
  expect(s.farm.bossPower()).toBe(10);
  expect(row.querySelector('output')!.textContent).toBe('10x');
  expect(slider.getAttribute('aria-valuetext')).toBe('10x');
});

it('Move At sits under Move On, 0.1x to 10x of the next map power, and rests while Move On is off', () => {
  const s = setup();
  s.click('.farm-toggle');
  const row = s.document.querySelector<HTMLElement>('.farm-move-power')!, slider = row.querySelector('input')!;
  expect(row.querySelector('output')!.textContent).toBe('1x');
  expect(slider.disabled).toBe(true);
  s.click('[data-switch="advance"]');
  expect(slider.disabled).toBe(false);
  slider.value = '7';
  slider.dispatchEvent(new s.window.Event('input', { bubbles: true }));
  expect(s.farm.movePower()).toBe(2);
  expect(row.querySelector('output')!.textContent).toBe('2x');
  // Its own setting: Fight At is untouched.
  expect(s.farm.bossPower()).toBe(1);
});


it('is a collapsible HUD card that leaves gameplay running and remembers its expansion', () => {
  const storage = memoryStorage();
  const s = setup(false, 'forest', {}, storage);
  expect(s.sheet.parentElement?.id).toBe('hud');
  expect(s.sheet.tagName).toBe('SECTION');
  expect(s.content.hidden).toBe(true);
  s.click('.farm-toggle');
  expect(s.content.hidden).toBe(false);
  expect(s.pause).not.toHaveBeenCalled();
  expect(storage.getItem(AUTO_FARM_EXPANDED_KEY)).toBe('1');
  s.panel.destroy();
  const restored = setup(false, 'forest', {}, storage);
  expect(restored.content.hidden).toBe(false);
  restored.click('.farm-toggle');
  expect(restored.content.hidden).toBe(true);
  expect(storage.getItem(AUTO_FARM_EXPANDED_KEY)).toBe('0');
});

it('restores an expanded card when gameplay first makes it available', () => {
  let visible = false;
  const s = setup(false, 'forest', {}, memoryStorage(new Map([[AUTO_FARM_EXPANDED_KEY, '1']])), { visible: () => visible });
  expect(s.sheet.hidden).toBe(true);
  visible = true; s.panel.refresh();
  expect(s.content.hidden).toBe(false);
  expect(values(s)).toEqual({ 'stat:health': 100 });
});

it('collapsing the header preserves a running farm and keeps its status visible', () => {
  const s = setup();
  s.click('.farm-toggle'); s.click('.farm-start');
  s.click('.farm-toggle'); s.click('.farm-toggle');
  expect(s.content.hidden).toBe(true);
  expect(s.farm.state().active).toBe(true);
  expect(s.document.querySelector('.farm-badge')!.textContent).toBe('Farming');
});
