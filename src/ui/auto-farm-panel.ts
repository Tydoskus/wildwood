import { ENEMY_TYPES, REWARD_DATA, rewardLabel, rewardAmountLabel, rewardStatLabel, type EnemyDefinition } from '../game/enemies';
import type { AutoFarmController } from '../game/runtime/auto-farm-controller';
import { AUTO_FARM_PRIORITIES } from '../game/runtime/auto-farm-priority';

const farmIcon = '<img class="farm-swords-icon" src="assets/wildstat/icons/Icon_AutoFarm.svg" alt="" aria-hidden="true">';

/** Compact HUD control and a native modal game window with built-in focus trapping. */
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
  floating.innerHTML = `<button type="button" class="farm-toggle" aria-pressed="false" aria-haspopup="dialog" aria-controls="autoFarmSheet">${farmIcon}<svg class="farm-stop-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>`;
  const sheet = document.createElement('dialog');
  sheet.id = 'autoFarmSheet';
  sheet.className = 'farm-sheet';
  sheet.setAttribute('aria-labelledby', 'autoFarmTitle');
  sheet.innerHTML = `<header class="farm-header"><h2 id="autoFarmTitle" class="window-banner"><span>Auto Farm</span></h2></header>`
    + `<p class="farm-map"></p>`
    + `<div class="farm-priority" role="radiogroup" aria-label="Target priority"><span class="farm-priority-label">Target</span>`
    + AUTO_FARM_PRIORITIES.map(entry => `<button type="button" role="radio" data-priority="${entry.id}">${entry.label}</button>`).join('')
    + `</div><div class="farm-choices" role="group" aria-label="Enemy types"></div>`
    + `<footer class="farm-footer"><p class="farm-selection" aria-live="polite"></p>`
    + `<div class="farm-actions"><button type="button" class="window-back-button farm-close">Back</button><button type="button" class="farm-start">Start</button></div></footer>`;
  document.getElementById('hud')!.append(floating);
  document.body.append(sheet);
  const element = <T extends HTMLElement>(selector: string) => sheet.querySelector<T>(selector)!;
  const toggle = floating.querySelector<HTMLButtonElement>('.farm-toggle')!;
  const list = element('.farm-choices');
  const startButton = element<HTMLButtonElement>('.farm-start');
  const selection = element('.farm-selection');
  let draft: string | null = null;
  let priorFocus: HTMLElement | null = null;
  let choiceKey = '';

  const priorityButtons = [...sheet.querySelectorAll<HTMLButtonElement>('[data-priority]')];
  function updateSelection() {
    for (const button of list.querySelectorAll<HTMLButtonElement>('[data-enemy]')) {
      button.setAttribute('aria-pressed', String(button.dataset.enemy === draft));
    }
    const priority = options.farm.priority();
    for (const button of priorityButtons) button.setAttribute('aria-checked', String(button.dataset.priority === priority));
    const reason = options.unavailable();
    startButton.disabled = !draft || Boolean(reason);
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
      if (draft && !choices.some(choice => choice.key === draft)) draft = null;
      for (const choice of choices) {
        const reward = choice.reward ?? ENEMY_TYPES[choice.type].reward;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'farm-enemy';
        button.dataset.enemy = choice.key;
        button.style.setProperty('--farm-stat-color', REWARD_DATA[reward.type].color);
        button.innerHTML = '<span class="farm-enemy-mark" aria-hidden="true"></span><span class="farm-enemy-copy"><strong></strong><span class="farm-reward"></span></span><span class="farm-check" aria-hidden="true">✓</span>';
        button.querySelector('strong')!.textContent = `${choice.total} × ${choice.type}`;
        button.querySelector('.farm-enemy-mark')!.textContent = ({ damage: '⚔', health: '♥', speed: '↗', armor: '◇', regen: '+' })[reward.type];
        const displayedReward = { ...reward, amount: displayAmount(reward) };
        button.querySelector('.farm-reward')!.textContent = choice.maxReward && choice.maxReward > reward.amount
          ? `${rewardAmountLabel(displayedReward)}–${rewardAmountLabel({ ...displayedReward, amount: displayAmount(reward, choice.maxReward) }).slice(1)} ${rewardStatLabel(reward)}`
          : rewardLabel(displayedReward);
        button.addEventListener('click', () => { draft = choice.key; updateSelection(); });
        list.append(button);
        if (previousType === choice.key) button.focus();
      }
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
    draft = options.farm.state().selected;
    choiceKey = '';
    options.clearInput();
    options.setPaused(true);
    sheet.showModal();
    renderChoices();
    element<HTMLButtonElement>('.farm-close').focus();
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
    toggle.title = state.active ? `${state.selectedLabel} · ${state.status} · Tap to stop` : 'Autofarm · Choose enemy';
    if (sheet.open) renderChoices();
  }

  toggle.addEventListener('click', () => {
    if (options.farm.state().active) { options.farm.stop(); refresh(); }
    else open();
  });
  element('.farm-close').addEventListener('click', close);
  for (const button of priorityButtons) button.addEventListener('click', () => {
    const choice = AUTO_FARM_PRIORITIES.find(entry => entry.id === button.dataset.priority);
    if (choice) options.farm.setPriority(choice.id);
    updateSelection();
  });
  sheet.addEventListener('cancel', event => { event.preventDefault(); close(); });
  sheet.addEventListener('click', event => {
    if (event.target !== sheet) return;
    const bounds = sheet.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  startButton.addEventListener('click', () => {
    if (draft && options.farm.start(draft)) close();
    else updateSelection();
  });
  const timer = window.setInterval(refresh, 250);
  refresh();
  return { close, refresh, destroy() { close(); window.clearInterval(timer); floating.remove(); sheet.remove(); } };
}
