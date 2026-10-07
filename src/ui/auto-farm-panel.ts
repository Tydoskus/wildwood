import { ENEMY_TYPES, REWARD_DATA, rewardAmountLabel, rewardStatLabel, type EnemyDefinition } from '../game/enemies';
import type { AutoFarmController } from '../game/runtime/auto-farm-controller';
import { AUTO_FARM_PRIORITIES, farmGroupRewardType } from '../game/runtime/auto-farm-priority';
import { SOUL_STAT_DETAILS } from '../../shared/soul-dimension';
import { soulRewardText } from '../game/soul-world';
import { MAX_ROUTE_WEIGHT, routeEntry, routeEntryText } from '../game/runtime/auto-farm-plan';
import { aggroPicksNeeded, readAggroPicks, writeAggroPicks } from '../game/runtime/aggro-picks';
import { createAggroPickPrompt } from './aggro-pick-prompt';
import type { AggroChallenge } from '../../shared/aggro-challenge';
import type { RewardType } from '../game/enemies';

const farmIcon = '<img class="farm-swords-icon" src="assets/wildstat/icons/Icon_AutoFarm.svg" alt="" aria-hidden="true">';
/** How hard Move On pushes: when it tries a fight, how many deaths it takes, how much it keeps. */
const PUSH_CHOICES: readonly { id: 'safe' | 'normal' | 'bold'; label: string }[] = [
  { id: 'safe', label: 'Safe' },
  { id: 'normal', label: 'Normal' },
  { id: 'bold', label: 'Bold' },
];
/** Whether the window's More section was left open, per browser. */
export const AUTO_FARM_MORE_KEY = 'wildstat:autofarm-more-open:v1';
type PanelStorage = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStorage = (): PanelStorage | undefined => { try { return window.localStorage; } catch { return undefined; } };
/** The controller's lines are sentence case ("Moving to enemy"); the window shows every word capitalised. */
const titleCase = (text: string) => text.replace(/(^|[\s(/-])(\p{Ll})/gu, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
const segment = (label: string, labelId: string, className: string, buttons: string) =>
  `<div class="farm-setting"><span id="${labelId}" class="farm-setting-label">${label}</span>`
  + `<div class="farm-segment ${className}" role="radiogroup" aria-labelledby="${labelId}">${buttons}</div></div>`;

/**
 * The autofarm window, kept short. One grid of stat chips does the planning: tap stats in the order to farm them, tap a
 * picked one again for more time there each lap (pips, up to three), and once
 * more drops it. With none picked, Auto farms the stat that grows power fastest. Move On takes
 * the boss and the next map; Push, Pull and Target wait under More. The
 * floating button shows what the farm is doing at a glance and stops it with a tap.
 */
export function createAutoFarmPanel(options: {
  farm: AutoFarmController;
  /** Not shown: a new map redraws the chips. */
  mapName: () => string;
  visible: () => boolean;
  unavailable: () => string | null;
  setPaused: (paused: boolean) => void;
  clearInput: () => void;
  rewardMultiplier: () => number;
  showBaseStatRewards: () => boolean;
  rewardAmount?: (type: EnemyDefinition["reward"]["type"], amount: number) => number;
  /** The Aggro challenge and whose picks to read: during a run this button opens the group picker (with Target) instead. */
  aggro?: () => AggroChallenge | null | undefined;
  identity?: () => string | undefined;
  /** Where More's open or closed is kept; localStorage by default. */
  storage?: () => PanelStorage | undefined;
}) {
  const storage = options.storage ?? defaultStorage;
  const aggroRun = () => Boolean(options.aggro?.()?.active);
  const picker = createAggroPickPrompt(document, { picks: () => readAggroPicks(options.identity?.()), setPicks: picks => writeAggroPicks(options.identity?.(), picks),
    priority: () => options.farm.priority(), setPriority: priority => options.farm.setPriority(priority) });
  /** This map's stat groups, as autofarm offers them (a soul group as its run stat); empty while it loads. */
  const mapGroups = () => [...new Set(options.farm.choices().flatMap(choice => farmGroupRewardType(choice.key) ?? []))] as RewardType[];
  const floating = document.createElement('div');
  floating.className = 'farm-floating';
  floating.hidden = true;
  floating.innerHTML = `<button type="button" class="farm-toggle" aria-pressed="false" aria-haspopup="dialog" aria-controls="autoFarmSheet">${farmIcon}<svg class="farm-stop-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>`
    + `<span class="farm-badge" aria-hidden="true"></span>`;
  const sheet = document.createElement('dialog');
  sheet.id = 'autoFarmSheet';
  sheet.className = 'farm-sheet';
  sheet.setAttribute('aria-labelledby', 'autoFarmTitle');
  sheet.innerHTML = `<header class="farm-header"><h2 id="autoFarmTitle" class="window-banner"><span>Auto Farm</span></h2></header>`
    + `<div class="farm-body">`
    + `<div class="farm-stats-head"><span id="autoFarmStatsLabel" class="farm-stats-title">Stats</span><button type="button" class="farm-clear" hidden>Clear</button></div>`
    + `<div class="farm-chips" role="group" aria-labelledby="autoFarmStatsLabel">`
    + `<button type="button" class="farm-chip farm-auto" aria-pressed="true" aria-label="Auto, Farms The Stat That Grows Your Power Fastest"><span class="farm-chip-label">Auto</span><span class="farm-chip-sub">Best Gain</span>`
    + `<span class="farm-chip-order" aria-hidden="true">✓</span></button></div>`
    + `<p class="farm-empty" hidden>No Enemies Here</p>`
    + `<button type="button" class="farm-switch farm-move" role="switch" data-switch="advance" aria-checked="false" aria-describedby="autoFarmBossStatus">`
    + `<span class="farm-switch-copy"><span class="farm-switch-label">Move On</span><small id="autoFarmBossStatus" class="farm-boss-status"></small></span><span class="farm-knob" aria-hidden="true"></span></button>`
    + `<button type="button" class="farm-more-toggle" aria-expanded="false" aria-controls="autoFarmMore"><span>More</span><span class="farm-more-caret" aria-hidden="true"></span></button>`
    + `<div id="autoFarmMore" class="farm-more" hidden>`
    + segment('Push', 'autoFarmPushLabel', 'farm-push', PUSH_CHOICES.map(entry => `<button type="button" role="radio" data-push="${entry.id}">${entry.label}</button>`).join(''))
    + segment('Pull Whole Group', 'autoFarmPullLabel', 'farm-pull', `<button type="button" role="radio" data-pull="off">Off</button><button type="button" role="radio" data-pull="on">On</button>`)
    + segment('Target', 'autoFarmTargetLabel', 'farm-target', AUTO_FARM_PRIORITIES.map(entry => `<button type="button" role="radio" data-priority="${entry.id}">${entry.label}</button>`).join(''))
    + `</div></div>`
    + `<footer class="farm-footer"><p class="farm-selection" aria-live="polite"></p>`
    + `<div class="farm-actions"><button type="button" class="window-back-button farm-close">Back</button><button type="button" class="farm-start">Start</button></div></footer>`;
  document.getElementById('hud')!.append(floating);
  document.body.append(sheet);
  const element = <T extends HTMLElement>(selector: string) => sheet.querySelector<T>(selector)!;
  const toggle = floating.querySelector<HTMLButtonElement>('.farm-toggle')!;
  const badge = floating.querySelector<HTMLElement>('.farm-badge')!;
  const list = element('.farm-chips');
  const autoButton = element<HTMLButtonElement>('.farm-auto');
  const clearButton = element<HTMLButtonElement>('.farm-clear');
  const startButton = element<HTMLButtonElement>('.farm-start');
  const selection = element('.farm-selection');
  const emptyNote = element('.farm-empty');
  const moreToggle = element<HTMLButtonElement>('.farm-more-toggle');
  const more = element('.farm-more');
  /** The stats picked in this window, in order, as route entries (key, with pips); empty is Auto. */
  let draft: string[] = [];
  const draftKeys = () => draft.map(entry => routeEntry(entry).key);
  let priorFocus: HTMLElement | null = null;
  let choiceKey = '';

  const priorityButtons = [...sheet.querySelectorAll<HTMLButtonElement>('[data-priority]')];
  const pushRow = element('.farm-push');
  const pushButtons = [...pushRow.querySelectorAll<HTMLButtonElement>('[data-push]')];
  const pullRow = element('.farm-pull');
  const pullButtons = [...pullRow.querySelectorAll<HTMLButtonElement>('[data-pull]')];
  const advanceSwitch = element<HTMLButtonElement>('[data-switch="advance"]');

  function setMoreOpen(open: boolean, remember: boolean) {
    more.hidden = !open;
    moreToggle.setAttribute('aria-expanded', String(open));
    if (remember) try { storage()?.setItem(AUTO_FARM_MORE_KEY, open ? '1' : '0'); } catch { /* Applies this session. */ }
  }
  let savedMore = false;
  try { savedMore = storage()?.getItem(AUTO_FARM_MORE_KEY) === '1'; } catch { /* Closed. */ }
  setMoreOpen(savedMore, false);

  function updateSelection() {
    for (const button of list.querySelectorAll<HTMLButtonElement>('[data-enemy]')) {
      const order = draftKeys().indexOf(button.dataset.enemy!);
      const weight = order >= 0 ? routeEntry(draft[order]).weight : 0;
      button.setAttribute('aria-pressed', String(order >= 0));
      button.querySelector('.farm-chip-order')!.textContent = order >= 0 ? String(order + 1) : '';
      // Picked, a pip per share of the lap, out of the most it takes.
      const pips = button.querySelectorAll<HTMLElement>('.farm-pips > i');
      pips.forEach((pip, index) => pip.classList.toggle('is-on', index < weight));
      const name = `${button.querySelector('.farm-chip-label')!.textContent}, ${button.querySelector('.farm-chip-sub')!.textContent}`;
      button.setAttribute('aria-label', `${name}${order >= 0 ? `, ${order + 1} In Order, Time ${weight} Of ${MAX_ROUTE_WEIGHT}` : ''}`);
    }
    autoButton.setAttribute('aria-pressed', String(!draft.length));
    clearButton.hidden = !draft.length;
    const priority = options.farm.priority();
    for (const button of priorityButtons) button.setAttribute('aria-checked', String(button.dataset.priority === priority));
    const advance = options.farm.advance();
    advanceSwitch.setAttribute('aria-checked', String(advance));
    const bossStatus = titleCase(options.farm.bossStatus());
    const statusElement = advanceSwitch.querySelector<HTMLElement>('.farm-boss-status')!;
    if (statusElement.textContent !== bossStatus) statusElement.textContent = bossStatus;
    // With Move On off the status is what it would do: told quietly, never as ready.
    statusElement.classList.toggle('is-ready', advance && options.farm.bossStatusReady());
    statusElement.classList.toggle('is-idle', !advance);
    // Push only steers Move On, so it rests with that switch off.
    const push = options.farm.push();
    pushRow.classList.toggle('is-off', !advance);
    pushRow.setAttribute('aria-disabled', String(!advance));
    for (const button of pushButtons) {
      button.setAttribute('aria-checked', String(button.dataset.push === push));
      button.disabled = !advance;
    }
    // Off during an Aggro run: the run's own chasing groups are its pull.
    const pullOff = options.farm.pullAvailable?.() === false;
    const pulling = options.farm.pullAll() && !pullOff;
    pullRow.classList.toggle('is-off', pullOff);
    pullRow.setAttribute('aria-disabled', String(pullOff));
    pullRow.title = pullOff ? 'Off During An Aggro Run' : '';
    for (const button of pullButtons) {
      button.setAttribute('aria-checked', String((button.dataset.pull === 'on') === pulling));
      button.disabled = pullOff;
    }
    const reason = options.unavailable();
    const empty = !options.farm.choices().length;
    startButton.disabled = empty || Boolean(reason);
    startButton.textContent = draft.length > 1 ? `Start · ${draft.length} Stats` : 'Start';
    selection.textContent = reason || '';
    selection.hidden = !reason;
  }

  function renderChoices() {
    const choices = options.farm.choices();
    const multiplier = options.showBaseStatRewards() ? 1 : options.rewardMultiplier();
    const displayAmount = (reward: EnemyDefinition["reward"], amount = reward.amount) =>
      options.rewardAmount?.(reward.type, amount) ?? amount * multiplier;
    const key = `${options.mapName()}:${multiplier}:${choices.map(c => {
      const reward = c.reward ?? ENEMY_TYPES[c.type].reward;
      return `${c.key}:${c.total}:${reward.amount}:${c.maxReward}:${displayAmount(reward)}`;
    }).join('|')}`;
    if (key !== choiceKey) {
      choiceKey = key;
      const previousType = (document.activeElement as HTMLElement | null)?.dataset?.enemy;
      for (const chip of list.querySelectorAll('[data-enemy]')) chip.remove();
      draft = draft.filter(entry => choices.some(choice => choice.key === routeEntry(entry).key));
      for (const choice of choices) {
        const reward = choice.reward ?? ENEMY_TYPES[choice.type].reward;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'farm-chip';
        button.dataset.enemy = choice.key;
        // A soul stat looks as its kill popup does: its own colour, a flat amount (never grown by research or prestige).
        const soul = choice.soul ? SOUL_STAT_DETAILS[choice.soul] : null;
        button.style.setProperty('--farm-stat-color', soul?.color ?? REWARD_DATA[reward.type].color);
        button.innerHTML = '<span class="farm-chip-label"></span><span class="farm-chip-sub"></span>'
          + `<span class="farm-pips" aria-hidden="true">${'<i></i>'.repeat(MAX_ROUTE_WEIGHT)}</span><span class="farm-chip-order" aria-hidden="true"></span>`;
        // The stat is the choice; what one kill pays is the detail.
        button.querySelector('.farm-chip-label')!.textContent = soul?.label ?? rewardStatLabel(reward);
        const displayedReward = { ...reward, amount: displayAmount(reward) };
        const amount = choice.maxReward && choice.maxReward > reward.amount
          ? `${rewardAmountLabel(displayedReward)}–${rewardAmountLabel({ ...displayedReward, amount: displayAmount(reward, choice.maxReward) }).slice(1)}`
          : rewardAmountLabel(displayedReward);
        button.querySelector('.farm-chip-sub')!.textContent = choice.soul ? soulRewardText(choice.soul) : amount;
        button.title = choice.kinds.join(', ');
        button.addEventListener('click', () => {
          const at = draftKeys().indexOf(choice.key);
          const weight = at >= 0 ? routeEntry(draft[at]).weight : 0;
          if (at < 0) draft = [...draft, choice.key];
          else if (weight >= MAX_ROUTE_WEIGHT) draft = draft.filter((_entry, index) => index !== at);
          else draft = draft.map((entry, index) => index === at ? routeEntryText(choice.key, weight + 1) : entry);
          updateSelection();
        });
        list.append(button);
        if (previousType === choice.key) button.focus();
      }
      list.hidden = !choices.length;
      element('.farm-stats-head').hidden = !choices.length;
      emptyNote.hidden = Boolean(choices.length);
    }
    updateSelection();
  }

  function close() {
    if (!sheet.open) return false;
    sheet.close();
    options.clearInput();
    options.setPaused(false);
    priorFocus?.focus();
    refresh();
    return true;
  }

  function open() {
    if (!options.visible() || sheet.open) return;
    priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : toggle;
    const state = options.farm.state();
    // Reopening shows the plan this map was last farmed with.
    draft = state.plan.length ? state.plan : options.farm.savedPlan();
    choiceKey = '';
    options.clearInput();
    options.setPaused(true);
    sheet.showModal();
    renderChoices();
    element<HTMLButtonElement>('.farm-close').focus();
  }

  /** A word or two on the floating button: which camp, its place in the route, the boss, or the way out. */
  function badgeText() {
    const state = options.farm.state();
    if (!state.active) return '';
    if (state.phase === 'boss') return 'Boss';
    if (state.phase === 'portal') return 'Next Map';
    if (state.plan.length > 1) return `${state.plan.map(entry => routeEntry(entry).key).indexOf(state.selected ?? '') + 1}/${state.plan.length}`;
    return state.plan.length ? '' : 'Auto';
  }

  function refresh() {
    options.farm.refresh();
    // A run lacking its picked groups on this map gets the picker, which stays until they are picked.
    const groups = mapGroups(), needed = aggroPicksNeeded(options.aggro?.());
    if (aggroRun() && options.visible() && groups.length && !picker.isOpen() && picker.lacking(needed, groups)) picker.open(needed, groups);
    const visible = options.visible();
    floating.hidden = !visible;
    if (!visible && sheet.open) { close(); return; }
    const state = options.farm.state();
    floating.classList.toggle('is-farming', state.active);
    toggle.setAttribute('aria-pressed', String(state.active));
    toggle.setAttribute('aria-label', state.active ? `Stop farming ${state.selectedLabel}` : 'Set up autofarm');
    toggle.setAttribute('aria-haspopup', state.active ? 'false' : 'dialog');
    toggle.title = state.active ? `${state.selectedLabel} · ${state.status} · Tap to stop` : 'Autofarm';
    const text = badgeText();
    if (badge.textContent !== text) badge.textContent = text;
    badge.hidden = !text;
    if (sheet.open) renderChoices();
  }

  toggle.addEventListener('click', () => {
    // In an Aggro run the button picks or switches the groups that chase you.
    if (aggroRun()) { const groups = mapGroups(); if (groups.length) picker.open(aggroPicksNeeded(options.aggro?.()), groups); return; }
    if (options.farm.state().active) { options.farm.stop(); refresh(); }
    else open();
  });
  element('.farm-close').addEventListener('click', close);
  moreToggle.addEventListener('click', () => setMoreOpen(more.hidden, true));
  autoButton.addEventListener('click', () => { draft = []; updateSelection(); });
  clearButton.addEventListener('click', () => { draft = []; updateSelection(); });
  for (const button of priorityButtons) button.addEventListener('click', () => {
    const choice = AUTO_FARM_PRIORITIES.find(entry => entry.id === button.dataset.priority);
    if (choice) options.farm.setPriority(choice.id);
    updateSelection();
  });
  for (const button of pushButtons) button.addEventListener('click', () => {
    const choice = PUSH_CHOICES.find(entry => entry.id === button.dataset.push);
    if (choice && options.farm.advance()) options.farm.setPush(choice.id);
    updateSelection();
  });
  advanceSwitch.addEventListener('click', () => { options.farm.setAdvance(!options.farm.advance()); updateSelection(); });
  for (const button of pullButtons) button.addEventListener('click', () => {
    if (options.farm.pullAvailable?.() !== false) options.farm.setPullAll(button.dataset.pull === 'on');
    updateSelection();
  });
  sheet.addEventListener('cancel', event => { event.preventDefault(); close(); });
  sheet.addEventListener('click', event => {
    if (event.target !== sheet) return;
    const bounds = sheet.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  startButton.addEventListener('click', () => {
    if (options.farm.start(draft)) close();
    else updateSelection();
  });
  // Hidden, there is no button to update; autofarm itself refreshes from its movement step.
  const timer = window.setInterval(() => { if (!document.hidden || sheet.open) refresh(); }, 250);
  refresh();
  return { close, refresh, destroy() { close(); window.clearInterval(timer); floating.remove(); sheet.remove(); } };
}
