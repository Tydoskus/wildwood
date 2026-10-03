import { ENEMY_TYPES, REWARD_DATA, rewardAmountLabel, rewardStatLabel, type EnemyDefinition } from '../game/enemies';
import type { AutoFarmController } from '../game/runtime/auto-farm-controller';
import { AUTO_FARM_PRIORITIES } from '../game/runtime/auto-farm-priority';

const farmIcon = '<img class="farm-swords-icon" src="assets/wildstat/icons/Icon_AutoFarm.svg" alt="" aria-hidden="true">';
const STAT_MARKS: Record<string, string> = { damage: '⚔', health: '♥', speed: '↗', armor: '◇', regen: '+' };

/**
 * The autofarm window. One list does the planning: tap camps in the order to
 * farm them (tap again to drop one); with none picked, Auto chooses. Two
 * switches and the target priority sit under it. The floating button shows
 * what the farm is doing at a glance and stops it with a tap.
 */
export function createAutoFarmPanel(options: {
  farm: AutoFarmController;
  mapName: () => string;
  visible: () => boolean;
  unavailable: () => string | null;
  setPaused: (paused: boolean) => void;
  clearInput: () => void;
  rewardMultiplier: () => number;
  showBaseStatRewards: () => boolean;
  rewardAmount?: (type: EnemyDefinition["reward"]["type"], amount: number) => number;
}) {
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
    + `<p class="farm-map"></p>`
    + `<div class="farm-plan-head"><span class="farm-plan-title">Camps</span><span class="farm-plan-hint">Tap in order</span>`
    + `<button type="button" class="farm-clear" hidden>Clear</button></div>`
    + `<div class="farm-choices" role="group" aria-label="Camps to farm, in order">`
    + `<button type="button" class="farm-enemy farm-auto" aria-pressed="true"><span class="farm-enemy-mark" aria-hidden="true">✦</span>`
    + `<span class="farm-enemy-copy"><strong>Auto</strong><span class="farm-reward">Picks the best camp</span></span><span class="farm-check" aria-hidden="true">✓</span></button>`
    + `<div class="farm-camps"></div></div>`
    + `<div class="farm-switches">`
    + `<button type="button" class="farm-switch" role="switch" data-switch="advance" aria-checked="false"><span class="farm-switch-icon" aria-hidden="true">♛</span><span>Boss &amp; next map<small class="farm-boss-status"></small></span><span class="farm-knob" aria-hidden="true"></span></button>`
    + `<button type="button" class="farm-switch farm-pull" role="switch" data-switch="pull" aria-checked="false"><span class="farm-switch-icon" aria-hidden="true">⊕</span><span>Pull whole group</span><span class="farm-knob" aria-hidden="true"></span></button>`
    + `</div>`
    + `<div class="farm-priority" role="radiogroup" aria-label="Target priority">`
    + AUTO_FARM_PRIORITIES.map(entry => `<button type="button" role="radio" data-priority="${entry.id}">${entry.label}</button>`).join('')
    + `</div>`
    + `<footer class="farm-footer"><p class="farm-selection" aria-live="polite"></p>`
    + `<div class="farm-actions"><button type="button" class="window-back-button farm-close">Back</button><button type="button" class="farm-start">Start</button></div></footer>`;
  document.getElementById('hud')!.append(floating);
  document.body.append(sheet);
  const element = <T extends HTMLElement>(selector: string) => sheet.querySelector<T>(selector)!;
  const toggle = floating.querySelector<HTMLButtonElement>('.farm-toggle')!;
  const badge = floating.querySelector<HTMLElement>('.farm-badge')!;
  const list = element('.farm-camps');
  const autoButton = element<HTMLButtonElement>('.farm-auto');
  const clearButton = element<HTMLButtonElement>('.farm-clear');
  const startButton = element<HTMLButtonElement>('.farm-start');
  const selection = element('.farm-selection');
  /** The camps picked in this window, in order; empty is Auto. */
  let draft: string[] = [];
  let priorFocus: HTMLElement | null = null;
  let choiceKey = '';

  const priorityButtons = [...sheet.querySelectorAll<HTMLButtonElement>('[data-priority]')];
  const advanceSwitch = element<HTMLButtonElement>('[data-switch="advance"]');
  const pullSwitch = element<HTMLButtonElement>('[data-switch="pull"]');
  function updateSelection() {
    for (const button of list.querySelectorAll<HTMLButtonElement>('[data-enemy]')) {
      const order = draft.indexOf(button.dataset.enemy!);
      button.setAttribute('aria-pressed', String(order >= 0));
      button.querySelector('.farm-check')!.textContent = order >= 0 ? String(order + 1) : '';
    }
    autoButton.setAttribute('aria-pressed', String(!draft.length));
    clearButton.hidden = draft.length < 2;
    const priority = options.farm.priority();
    for (const button of priorityButtons) button.setAttribute('aria-checked', String(button.dataset.priority === priority));
    advanceSwitch.setAttribute('aria-checked', String(options.farm.advance()));
    const bossStatus = options.farm.bossStatus();
    const statusElement = advanceSwitch.querySelector<HTMLElement>('.farm-boss-status')!;
    if (statusElement.textContent !== bossStatus) statusElement.textContent = bossStatus;
    statusElement.classList.toggle('is-ready', bossStatus === 'Ready' || bossStatus === 'Next map open');
    pullSwitch.setAttribute('aria-checked', String(options.farm.pullAll()));
    const reason = options.unavailable();
    const empty = !options.farm.choices().length;
    startButton.disabled = empty || Boolean(reason);
    startButton.textContent = draft.length > 1 ? `Start · ${draft.length} camps` : 'Start';
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
      element('.farm-map').textContent = options.mapName();
      const previousType = (document.activeElement as HTMLElement | null)?.dataset?.enemy;
      list.replaceChildren();
      draft = draft.filter(entry => choices.some(choice => choice.key === entry));
      for (const choice of choices) {
        const reward = choice.reward ?? ENEMY_TYPES[choice.type].reward;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'farm-enemy';
        button.dataset.enemy = choice.key;
        button.style.setProperty('--farm-stat-color', REWARD_DATA[reward.type].color);
        button.innerHTML = '<span class="farm-enemy-mark" aria-hidden="true"></span><span class="farm-enemy-copy"><strong></strong><span class="farm-reward"></span></span><span class="farm-check" aria-hidden="true"></span>';
        // The stat is the choice; the amount and how many pay it are the detail.
        button.querySelector('strong')!.textContent = rewardStatLabel(reward);
        button.querySelector('.farm-enemy-mark')!.textContent = STAT_MARKS[reward.type];
        const displayedReward = { ...reward, amount: displayAmount(reward) };
        const amount = choice.maxReward && choice.maxReward > reward.amount
          ? `${rewardAmountLabel(displayedReward)}–${rewardAmountLabel({ ...displayedReward, amount: displayAmount(reward, choice.maxReward) }).slice(1)}`
          : rewardAmountLabel(displayedReward);
        button.querySelector('.farm-reward')!.textContent = `${amount} · ${choice.total} ${choice.total === 1 ? 'enemy' : 'enemies'}`;
        button.title = choice.kinds.join(', ');
        button.addEventListener('click', () => {
          draft = draft.includes(choice.key) ? draft.filter(entry => entry !== choice.key) : [...draft, choice.key];
          updateSelection();
        });
        list.append(button);
        if (previousType === choice.key) button.focus();
      }
      autoButton.hidden = !choices.length;
      if (!choices.length) {
        const empty = document.createElement('p');
        empty.className = 'farm-empty';
        empty.textContent = 'No enemies here.';
        list.append(empty);
      }
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
    if (state.phase === 'portal') return 'Next map';
    if (state.plan.length > 1) return `${state.plan.indexOf(state.selected ?? '') + 1}/${state.plan.length}`;
    return state.plan.length ? '' : 'Auto';
  }

  function refresh() {
    options.farm.refresh();
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
    if (options.farm.state().active) { options.farm.stop(); refresh(); }
    else open();
  });
  element('.farm-close').addEventListener('click', close);
  autoButton.addEventListener('click', () => { draft = []; updateSelection(); });
  clearButton.addEventListener('click', () => { draft = []; updateSelection(); });
  for (const button of priorityButtons) button.addEventListener('click', () => {
    const choice = AUTO_FARM_PRIORITIES.find(entry => entry.id === button.dataset.priority);
    if (choice) options.farm.setPriority(choice.id);
    updateSelection();
  });
  advanceSwitch.addEventListener('click', () => { options.farm.setAdvance(!options.farm.advance()); updateSelection(); });
  pullSwitch.addEventListener('click', () => { options.farm.setPullAll(!options.farm.pullAll()); updateSelection(); });
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
