import { ENEMY_TYPES, REWARD_DATA, rewardLabel, type EnemyKind } from '../game/enemies';
import type { AutoFarmController } from '../game/runtime/auto-farm-controller';

const farmIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 14-2 2L3 5V3h2zm14 0L5 17l2 2L21 5V3h-2zM3 16l5 5m8 0l5-5M4 20l-1 1m17-1l1 1"/></svg>';

/** Compact HUD control and a native modal sheet with built-in focus trapping. */
export function createAutoFarmPanel(options: {
  farm: AutoFarmController;
  mapName: () => string;
  visible: () => boolean;
  unavailable: () => string | null;
  setPaused: (paused: boolean) => void;
  clearInput: () => void;
}) {
  const floating = document.createElement('div');
  floating.className = 'farm-floating';
  floating.hidden = true;
  floating.innerHTML = `<button type="button" class="farm-toggle" aria-pressed="false" aria-haspopup="dialog" aria-controls="autoFarmSheet">${farmIcon}<svg class="farm-stop-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>`;
  const sheet = document.createElement('dialog');
  sheet.id = 'autoFarmSheet';
  sheet.className = 'farm-sheet';
  sheet.setAttribute('aria-labelledby', 'autoFarmTitle');
  sheet.setAttribute('aria-describedby', 'autoFarmDescription');
  sheet.innerHTML = `<div class="farm-handle" aria-hidden="true"></div><header class="farm-header"><div><span class="farm-eyebrow">AUTOFARM</span><h2 id="autoFarmTitle">Choose your target</h2></div><button type="button" class="farm-close" aria-label="Close autofarm">×</button></header><p id="autoFarmDescription">Move, attack, and repeat automatically.</p><div class="farm-map"></div><div class="farm-choices" role="group" aria-label="Enemy types"></div><footer class="farm-footer"><p class="farm-selection" aria-live="polite"></p><button type="button" class="farm-start">START FARMING</button><p class="farm-hint">Move freely. Autofarm resumes when you release.</p></footer>`;
  document.getElementById('hud')!.append(floating);
  document.body.append(sheet);
  const element = <T extends HTMLElement>(selector: string) => sheet.querySelector<T>(selector)!;
  const toggle = floating.querySelector<HTMLButtonElement>('.farm-toggle')!;
  const list = element('.farm-choices');
  const startButton = element<HTMLButtonElement>('.farm-start');
  const selection = element('.farm-selection');
  let draft: EnemyKind | null = null;
  let priorFocus: HTMLElement | null = null;
  let choiceKey = '';

  function updateSelection() {
    for (const button of list.querySelectorAll<HTMLButtonElement>('[data-enemy]')) {
      button.setAttribute('aria-pressed', String(button.dataset.enemy === draft));
    }
    const reason = options.unavailable();
    startButton.disabled = !draft || Boolean(reason);
    selection.textContent = reason || (draft ? `${draft} · ${rewardLabel(ENEMY_TYPES[draft].reward)} per defeat` : 'Select an enemy above');
  }

  function renderChoices() {
    const choices = options.farm.choices();
    const key = `${options.mapName()}:${choices.map(c => `${c.type}:${c.alive}:${c.total}`).join('|')}`;
    if (key !== choiceKey) {
      choiceKey = key;
      element('.farm-map').textContent = `${options.mapName()} · ${choices.length} enemy types`;
      const previousType = (document.activeElement as HTMLElement | null)?.dataset?.enemy;
      list.replaceChildren();
      if (draft && !choices.some(choice => choice.type === draft)) draft = null;
      for (const choice of choices) {
        const definition = ENEMY_TYPES[choice.type];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'farm-enemy';
        button.dataset.enemy = choice.type;
        button.style.setProperty('--farm-stat-color', REWARD_DATA[definition.reward.type].color);
        button.innerHTML = '<span class="farm-enemy-mark" aria-hidden="true"></span><span class="farm-enemy-copy"><strong></strong><span class="farm-reward"></span><small></small></span><span class="farm-check" aria-hidden="true">✓</span>';
        button.querySelector('strong')!.textContent = choice.type;
        button.querySelector('.farm-enemy-mark')!.textContent = ({ damage: '⚔', health: '♥', speed: '↗', armor: '◇', regen: '+' })[definition.reward.type];
        button.querySelector('.farm-reward')!.textContent = rewardLabel(definition.reward);
        button.querySelector('small')!.textContent = `${choice.alive} / ${choice.total} alive · ${definition.elite ? 'Elite' : definition.ranged ? 'Ranged' : 'Melee'}`;
        button.addEventListener('click', () => { draft = choice.type; updateSelection(); });
        list.append(button);
        if (previousType === choice.type) button.focus();
      }
      if (!choices.length) {
        const empty = document.createElement('p');
        empty.className = 'farm-empty';
        empty.textContent = 'No enemies here. Travel to an enemy map to start farming.';
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
    toggle.setAttribute('aria-label', state.active ? `Stop farming ${state.selected}` : 'Set up autofarm');
    toggle.setAttribute('aria-haspopup', state.active ? 'false' : 'dialog');
    toggle.title = state.active ? `${state.selected} · ${state.status} · Tap to stop` : 'Autofarm · Choose enemy';
    if (sheet.open) renderChoices();
  }

  toggle.addEventListener('click', () => {
    if (options.farm.state().active) { options.farm.stop(); refresh(); }
    else open();
  });
  element('.farm-close').addEventListener('click', close);
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
