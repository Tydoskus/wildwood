import { ENEMY_TYPES, REWARD_DATA, rewardAmountLabel, rewardStatLabel, type EnemyDefinition } from '../game/enemies';
import type { AutoFarmController } from '../game/runtime/auto-farm-controller';
import { AUTO_FARM_PRIORITIES, farmGroupRewardType } from '../game/runtime/auto-farm-priority';
import { SOUL_STAT_DETAILS } from '../../shared/soul-dimension';
import { soulRewardText } from '../game/soul-world';
import { AUTO_FARM_CHOICE, FARM_WEIGHT_MAX, FARM_WEIGHT_STEP, farmWeight, type FarmChoice } from '../game/runtime/auto-farm-plan';
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
/** The "?" page: what each control does, a line each, in the words a player would use. */
const HELP_LINES: readonly [term: string, line: string][] = [
  ['Auto', 'Farms the stat that grows your power fastest.'],
  ['Custom', 'Splits farming time by your sliders. 0% skips a stat.'],
  ['Fighting', 'Circles a few enemies so they can\'t catch you, and dodges boss attacks.'],
  ['Move On', 'Moves to the next map when you\'ll grow faster there, and fights bosses it can beat in 10 minutes. Steps back if it keeps dying.'],
  ['Push', 'How soon it retries a map after stepping back.'],
  ['Pull Whole Group', 'Pulls a whole camp when you can tank it.'],
  ['Target', 'Which enemy it hits first.'],
];
const titleCase = (text: string) => text.replace(/(^|[\s(/-])(\p{Ll})/gu, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
const segment = (label: string, labelId: string, className: string, buttons: string) =>
  `<div class="farm-setting"><span id="${labelId}" class="farm-setting-label">${label}</span>`
  + `<div class="farm-segment ${className}" role="radiogroup" aria-labelledby="${labelId}">${buttons}</div></div>`;

/**
 * The autofarm window, kept short. Auto farms the stat that grows power
 * fastest; Custom farms each stat for its slider's share of the time (200% /
 * 25% / 25% is about 80% / 10% / 10%, 0% never). Touching a slider is Custom.
 * Move On takes the boss and the next map; Push, Pull and Target wait under
 * More. The floating button shows what the farm is doing at a glance and stops it with a tap.
 */
export function createAutoFarmPanel(options: {
  farm: AutoFarmController;
  /** Not shown: a new map redraws the sliders. */
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
  sheet.innerHTML = `<header class="farm-header"><h2 id="autoFarmTitle" class="window-banner"><span>Auto Farm</span></h2>`
    + `<button type="button" class="farm-help-toggle" aria-expanded="false" aria-controls="autoFarmHelp" aria-label="How Auto Farm Works" title="How Auto Farm Works">?</button></header>`
    + `<div id="autoFarmHelp" class="farm-help" hidden><dl class="farm-help-list"></dl></div>`
    + `<div class="farm-body">`
    + segment('Stats', 'autoFarmStatsLabel', 'farm-mode', `<button type="button" role="radio" data-mode="auto" title="Farms The Stat That Grows Your Power Fastest">Auto</button>`
      + `<button type="button" role="radio" data-mode="custom" title="Farms Each Stat For Its Share Of The Time">Custom</button>`)
    + `<div class="farm-weights" role="group" aria-labelledby="autoFarmStatsLabel"></div>`
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
  const list = element('.farm-weights');
  const modeRow = element('.farm-mode').closest<HTMLElement>('.farm-setting')!;
  const modeButtons = [...sheet.querySelectorAll<HTMLButtonElement>('[data-mode]')];
  const startButton = element<HTMLButtonElement>('.farm-start');
  const selection = element('.farm-selection');
  const emptyNote = element('.farm-empty');
  const moreToggle = element<HTMLButtonElement>('.farm-more-toggle');
  const more = element('.farm-more');
  const helpToggle = element<HTMLButtonElement>('.farm-help-toggle');
  const help = element('.farm-help');
  const body = element('.farm-body');
  const helpList = element('.farm-help-list');
  for (const [term, line] of HELP_LINES) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = term; dd.textContent = line;
    helpList.append(dt, dd);
  }
  /** The "?" page takes the settings' place, so the window keeps its size; Back returns to them. */
  function setHelpOpen(open: boolean) {
    help.hidden = !open;
    body.hidden = open;
    helpToggle.setAttribute('aria-expanded', String(open));
  }
  /** The choice in this window: Auto, or the sliders (kept while on Auto). */
  let draft: FarmChoice = AUTO_FARM_CHOICE;
  /** Custom with every slider here at 0%: nothing to farm. */
  const nothingPicked = () => !draft.auto && !options.farm.choices().some(choice => farmWeight(draft.weights, choice.key) > 0);
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
    for (const row of list.querySelectorAll<HTMLElement>('[data-group]')) {
      const weight = farmWeight(draft.weights, row.dataset.group!), slider = row.querySelector('input')!;
      if (slider.value !== String(weight)) slider.value = String(weight);
      slider.setAttribute('aria-valuetext', `${weight}%`);
      row.style.setProperty('--farm-weight-at', `${weight / FARM_WEIGHT_MAX * 100}%`);
      row.querySelector('output')!.textContent = `${weight}%`;
      row.classList.toggle('is-zero', weight === 0);
    }
    for (const button of modeButtons) button.setAttribute('aria-checked', String((button.dataset.mode === 'auto') === draft.auto));
    // On Auto the sliders rest, kept for Custom; touching one picks Custom.
    list.classList.toggle('is-auto', draft.auto);
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
    const empty = !options.farm.choices().length, nothing = !empty && nothingPicked();
    startButton.disabled = empty || nothing || Boolean(reason);
    const note = reason || (nothing ? 'Set A Stat Above 0%' : '');
    if (selection.textContent !== note) selection.textContent = note;
    selection.hidden = !note;
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
      const previousGroup = (document.activeElement?.closest?.('[data-group]') as HTMLElement | null)?.dataset.group;
      list.replaceChildren();
      for (const choice of choices) {
        const reward = choice.reward ?? ENEMY_TYPES[choice.type].reward;
        const row = document.createElement('label');
        row.className = 'farm-weight';
        row.dataset.group = choice.key;
        // A soul stat looks as its kill popup does: its own colour, a flat amount (never grown by research or prestige).
        const soul = choice.soul ? SOUL_STAT_DETAILS[choice.soul] : null;
        row.style.setProperty('--farm-stat-color', soul?.color ?? REWARD_DATA[reward.type].color);
        row.innerHTML = '<span class="farm-weight-name"><span class="farm-weight-label"></span><span class="farm-weight-sub"></span></span>'
          + `<input type="range" min="0" max="${FARM_WEIGHT_MAX}" step="${FARM_WEIGHT_STEP}"><output aria-hidden="true"></output>`;
        // The stat is the choice; what one kill pays is the detail.
        const label = soul?.label ?? rewardStatLabel(reward);
        row.querySelector('.farm-weight-label')!.textContent = label;
        const displayedReward = { ...reward, amount: displayAmount(reward) };
        const amount = choice.maxReward && choice.maxReward > reward.amount
          ? `${rewardAmountLabel(displayedReward)}–${rewardAmountLabel({ ...displayedReward, amount: displayAmount(reward, choice.maxReward) }).slice(1)}`
          : rewardAmountLabel(displayedReward);
        row.querySelector('.farm-weight-sub')!.textContent = choice.soul ? soulRewardText(choice.soul) : amount;
        row.title = choice.kinds.join(', ');
        const slider = row.querySelector('input')!;
        slider.setAttribute('aria-label', `${label} Share Of Farming Time`);
        slider.addEventListener('input', () => {
          const weight = Math.min(FARM_WEIGHT_MAX, Math.max(0, Math.round(Number(slider.value) / FARM_WEIGHT_STEP) * FARM_WEIGHT_STEP));
          draft = { auto: false, weights: { ...draft.weights, [choice.key]: Number.isFinite(weight) ? weight : 0 } };
          updateSelection();
        });
        list.append(row);
        if (previousGroup === choice.key) slider.focus();
      }
      list.hidden = !choices.length;
      modeRow.hidden = !choices.length;
      emptyNote.hidden = Boolean(choices.length);
    }
    updateSelection();
  }

  function close() {
    if (!sheet.open) return false;
    setHelpOpen(false);
    sheet.close();
    options.clearInput();
    options.setPaused(false);
    priorFocus?.focus();
    refresh();
    return true;
  }

  /** Back and Escape leave the "?" page first, then the window. */
  function back() {
    if (help.hidden) return close();
    setHelpOpen(false);
    helpToggle.focus();
    return true;
  }

  function open() {
    if (!options.visible() || sheet.open) return;
    priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : toggle;
    // Reopening shows the choice last farmed with, as this map names its stats.
    draft = options.farm.savedChoice();
    choiceKey = '';
    setHelpOpen(false);
    options.clearInput();
    options.setPaused(true);
    sheet.showModal();
    renderChoices();
    element<HTMLButtonElement>('.farm-close').focus();
  }

  /** A word or two on the floating button: Auto, the boss, or the way out. */
  function badgeText() {
    const state = options.farm.state();
    if (!state.active) return '';
    if (state.phase === 'boss') return 'Boss';
    if (state.phase === 'portal') return 'Next Map';
    return state.weights ? '' : 'Auto';
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
  element('.farm-close').addEventListener('click', back);
  moreToggle.addEventListener('click', () => setMoreOpen(more.hidden, true));
  helpToggle.addEventListener('click', () => setHelpOpen(help.hidden));
  for (const button of modeButtons) button.addEventListener('click', () => { draft = { ...draft, auto: button.dataset.mode === 'auto' }; updateSelection(); });
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
  sheet.addEventListener('cancel', event => { event.preventDefault(); back(); });
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
