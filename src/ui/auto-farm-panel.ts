import { ENEMY_TYPES, REWARD_DATA, rewardAmountLabel, rewardStatLabel, type EnemyDefinition } from '../game/enemies';
import type { AutoFarmController } from '../game/runtime/auto-farm-controller';
import { AUTO_FARM_PRIORITIES, farmGroupRewardType } from '../game/runtime/auto-farm-priority';
import { SOUL_STAT_DETAILS } from '../../shared/soul-dimension';
import { soulRewardText } from '../game/soul-world';
import { POWER_STEPS, powerLabel, sharesForGroups, shareLabel, type FarmShares } from '../game/runtime/auto-farm-plan';
import { aggroPicksNeeded, readAggroPicks, writeAggroPicks } from '../game/runtime/aggro-picks';
import { createAggroPickPrompt } from './aggro-pick-prompt';
import { topBackButton } from './desktop-hotkeys';
import { installMovableHudCard } from './movable-hud-card';
import type { AggroChallenge } from '../../shared/aggro-challenge';
import type { RewardType } from '../game/enemies';

/** Whether the window's More section was left open, per browser. */
export const AUTO_FARM_MORE_KEY = 'wildstat:autofarm-more-open:v1';
export const AUTO_FARM_POSITION_KEY = 'wildstat:autofarm-position:v1';
type PanelStorage = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStorage = (): PanelStorage | undefined => { try { return window.localStorage; } catch { return undefined; } };
/** The controller's lines are sentence case ("Moving to enemy"); the window shows every word capitalised. */
/** The "?" page: what each control does, a line each, in the words a player would use. */
const HELP_LINES: readonly [term: string, line: string][] = [
  ['Sliders', 'Set each stat on its own; the % beside it is its share of farming time, all adding up to 100%.'],
  ['Move On', "Goes to the next map once your power reaches Move At times the map's (1x is even)."],
  ['Fight Bosses', "Fights the boss once your power reaches Fight At times the boss's (1x is even), until it or you go down."],
  ['Deaths', 'It respawns and carries on with the same settings.'],
  ['Pull Whole Group', 'On pulls the whole camp at once.'],
  ['Target', 'Which enemy it hits first.'],
]
/** The slider under a switch: how much of the map's or boss's power to have before it goes, 0.1x to 10x. */
const powerSlider = (className: string, label: string, sub: string, aria: string) =>
  `<label class="farm-weight farm-power ${className}"><span class="farm-weight-name"><span class="farm-weight-label">${label}</span><span class="farm-weight-sub">${sub}</span></span>`
  + `<input type="range" min="0" max="${POWER_STEPS.length - 1}" step="1" aria-label="${aria}"><output aria-hidden="true"></output></label>`;
const sameShares = (a: FarmShares, b: FarmShares) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(key => (a[key] ?? 0) === (b[key] ?? 0));
};
const titleCase = (text: string) => text.replace(/(^|[\s(/-])(\p{Ll})/gu, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
const segment = (label: string, labelId: string, className: string, buttons: string) =>
  `<div class="farm-setting"><span id="${labelId}" class="farm-setting-label">${label}</span>`
  + `<div class="farm-segment ${className}" role="radiogroup" aria-labelledby="${labelId}">${buttons}</div></div>`;

/**
 * The autofarm window, kept short. Each stat is farmed for its slider's
 * share of the time; the sliders always add up to 100% (moving one moves the
 * others in proportion), and 0% is never farmed. Move On goes to the next
 * map at its recommended power; Fight Bosses fights the boss at its; Pull and
 * Target wait under More. The movable card header shows what the farm is doing even when collapsed.
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
  /** Card position and disclosure preferences; localStorage by default. */
  storage?: () => PanelStorage | undefined;
}) {
  const storage = options.storage ?? defaultStorage;
  const aggroRun = () => Boolean(options.aggro?.()?.active);
  const picker = createAggroPickPrompt(document, { picks: () => readAggroPicks(options.identity?.()), setPicks: picks => writeAggroPicks(options.identity?.(), picks),
    priority: () => options.farm.priority(), setPriority: priority => options.farm.setPriority(priority) });
  /** This map's stat groups, as autofarm offers them (a soul group as its run stat); empty while it loads. */
  const mapGroups = () => [...new Set(options.farm.choices().flatMap(choice => farmGroupRewardType(choice.key) ?? []))] as RewardType[];
  const sheet = document.createElement('section');
  sheet.id = 'autoFarmSheet';
  sheet.className = 'farm-sheet farm-card is-collapsed';
  sheet.hidden = true;
  sheet.setAttribute('aria-labelledby', 'autoFarmTitle');
  sheet.innerHTML = `<header class="farm-header"><button type="button" class="farm-toggle farm-card-handle" aria-expanded="false" aria-controls="autoFarmContent"><span id="autoFarmTitle" class="visually-hidden">Auto Farm</span><span class="farm-badge"></span><span class="farm-card-caret" aria-hidden="true">▸</span></button>`
    + `<button type="button" class="farm-help-toggle" aria-expanded="false" aria-controls="autoFarmHelp" aria-label="How Auto Farm Works" title="How Auto Farm Works">?</button></header>`
    + `<div id="autoFarmContent" class="farm-card-content" hidden>`
    + `<div id="autoFarmHelp" class="farm-help" hidden><dl class="farm-help-list"></dl></div>`
    + `<div class="farm-body">`
    + `<div class="farm-setting farm-stats-heading"><span id="autoFarmStatsLabel" class="farm-setting-label">Stats</span></div>`
    + `<div class="farm-weights" role="group" aria-labelledby="autoFarmStatsLabel"></div>`
    + `<p class="farm-empty" hidden>No Enemies Here</p>`
    + `<button type="button" class="farm-switch farm-move" role="switch" data-switch="advance" aria-checked="false" aria-describedby="autoFarmBossStatus">`
    + `<span class="farm-switch-copy"><span class="farm-switch-label">Move On</span><small id="autoFarmBossStatus" class="farm-boss-status"></small></span><span class="farm-knob" aria-hidden="true"></span></button>`
    + powerSlider('farm-move-power', 'Move At', 'Of Map Power', 'Move On At This Much Of The Next Map Power')
    + `<button type="button" class="farm-switch farm-bosses" role="switch" data-switch="bosses" aria-checked="false" aria-describedby="autoFarmBossLine">`
    + `<span class="farm-switch-copy"><span class="farm-switch-label">Fight Bosses</span><small id="autoFarmBossLine" class="farm-boss-status"></small></span><span class="farm-knob" aria-hidden="true"></span></button>`
    + powerSlider('farm-boss-power', 'Fight At', 'Of Boss Power', 'Fight Bosses At This Much Of Their Power')
    + `<button type="button" class="farm-more-toggle" aria-expanded="false" aria-controls="autoFarmMore"><span>More</span><span class="farm-more-caret" aria-hidden="true"></span></button>`
    + `<div id="autoFarmMore" class="farm-more" hidden>`
    + segment('Pull Whole Group', 'autoFarmPullLabel', 'farm-pull', `<button type="button" role="radio" data-pull="off">Off</button><button type="button" role="radio" data-pull="on">On</button>`)
    + segment('Target', 'autoFarmTargetLabel', 'farm-target', AUTO_FARM_PRIORITIES.map(entry => `<button type="button" role="radio" data-priority="${entry.id}">${entry.label}</button>`).join(''))
    + `</div></div>`
    + `<footer class="farm-footer"><p class="farm-selection" aria-live="polite"></p>`
    + `<div class="farm-actions"><button type="button" class="window-back-button farm-close">Back</button><button type="button" class="farm-start">Start</button></div></footer></div>`;
  document.getElementById('hud')!.append(sheet);
  const element = <T extends HTMLElement>(selector: string) => sheet.querySelector<T>(selector)!;
  const toggle = element<HTMLButtonElement>('.farm-toggle');
  const badge = element('.farm-badge');
  const content = element('.farm-card-content');
  const backdrop = document.createElement('div');
  backdrop.className = 'farm-window-backdrop';
  backdrop.hidden = true;
  sheet.before(backdrop);
  backdrop.addEventListener('click', () => close());
  const caret = element('.farm-card-caret');
  const list = element('.farm-weights');
  const statsRow = element('.farm-stats-heading');
  const startButton = element<HTMLButtonElement>('.farm-start');
  const backButton = element<HTMLButtonElement>('.farm-close');
  const farming = () => options.farm.state().active;
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
  /** The sliders in this window: each group's share, adding up to 100%. */
  let draft: FarmShares = {};
  const groupKeys = () => options.farm.choices().map(choice => choice.key);
  let choiceKey = '';

  const priorityButtons = [...sheet.querySelectorAll<HTMLButtonElement>('[data-priority]')];
  const pullRow = element('.farm-pull');
  const pullButtons = [...pullRow.querySelectorAll<HTMLButtonElement>('[data-pull]')];
  const advanceSwitch = element<HTMLButtonElement>('[data-switch="advance"]');
  const bossSwitch = element<HTMLButtonElement>('[data-switch="bosses"]');
  /** The two power sliders, each resting with its switch off. */
  const powerRows = [
    { row: element('.farm-move-power'), on: () => options.farm.advance(), value: () => options.farm.movePower(), set: (step: number) => options.farm.setMovePower(step) },
    { row: element('.farm-boss-power'), on: () => options.farm.fightBosses(), value: () => options.farm.bossPower(), set: (step: number) => options.farm.setBossPower(step) },
  ];
  /** A switch and its status line: the line lit when the controller says it is going now, quiet with the switch off. */
  function showSwitch(button: HTMLButtonElement, on: boolean, line: string, ready: boolean) {
    button.setAttribute('aria-checked', String(on));
    const text = titleCase(line), status = button.querySelector<HTMLElement>('.farm-boss-status')!;
    if (status.textContent !== text) status.textContent = text;
    status.classList.toggle('is-ready', on && ready);
    status.classList.toggle('is-idle', !on);
  }

  function setMoreOpen(open: boolean, remember: boolean) {
    more.hidden = !open;
    moreToggle.setAttribute('aria-expanded', String(open));
    if (remember) try { storage()?.setItem(AUTO_FARM_MORE_KEY, open ? '1' : '0'); } catch { /* Applies this session. */ }
  }
  let savedMore = false;
  try { savedMore = storage()?.getItem(AUTO_FARM_MORE_KEY) === '1'; } catch { /* Closed. */ }
  setMoreOpen(savedMore, false);

  /** Every slider at 0: nothing to farm. */
  const nothingSet = () => !groupKeys().some(key => (draft[key] ?? 0) > 0);
  function updateSelection() {
    // Each slider moves on its own; the number beside it is its share of all of them, so they always read 100% together.
    const shares = nothingSet() ? {} : sharesForGroups(draft, groupKeys());
    for (const row of list.querySelectorAll<HTMLElement>('[data-group]')) {
      const key = row.dataset.group!, weight = draft[key] ?? 0, share = shares[key] ?? 0, slider = row.querySelector('input')!;
      if (slider.value !== String(weight)) slider.value = String(weight);
      slider.setAttribute('aria-valuetext', shareLabel(share));
      row.style.setProperty('--farm-weight-at', `${weight}%`);
      row.querySelector('output')!.textContent = shareLabel(share);
      row.classList.toggle('is-zero', share === 0);
    }
    const priority = options.farm.priority();
    for (const button of priorityButtons) button.setAttribute('aria-checked', String(button.dataset.priority === priority));
    showSwitch(advanceSwitch, options.farm.advance(), options.farm.moveStatus(), options.farm.moveReady());
    showSwitch(bossSwitch, options.farm.fightBosses(), options.farm.bossStatus(), options.farm.bossReady());
    for (const power of powerRows) {
      const value = power.value(), step = String(POWER_STEPS.indexOf(value as typeof POWER_STEPS[number])), slider = power.row.querySelector('input')!;
      if (slider.value !== step) slider.value = step;
      slider.setAttribute('aria-valuetext', powerLabel(value));
      power.row.querySelector('output')!.textContent = powerLabel(value);
      power.row.style.setProperty('--farm-weight-at', `${Number(step) / (POWER_STEPS.length - 1) * 100}%`);
      power.row.classList.toggle('is-off', !power.on());
      slider.disabled = !power.on();
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
    // While farming the window is a look and a change: Stop ends the farm, Done keeps it going with what is set.
    const live = farming();
    // Opened it is a window like any other: Back closes it, so Escape does too (desktop-hotkeys).
    const backLabel = live ? 'Stop' : 'Back';
    if (backButton.textContent !== backLabel) backButton.textContent = backLabel;
    if (startButton.textContent !== (live ? 'Done' : 'Start')) startButton.textContent = live ? 'Done' : 'Start';
    const reason = options.unavailable();
    const empty = !options.farm.choices().length;
    startButton.disabled = empty || nothingSet() || Boolean(reason);
    const note = reason ?? (!empty && nothingSet() ? 'Set A Stat Above 0%' : '');
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
          + `<input type="range" min="0" max="100" step="1"><output aria-hidden="true"></output>`;
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
        // Each slider moves on its own (Jasmean: "move them independently, while all still being percentage of 100").
        slider.addEventListener('input', () => {
          const value = Math.min(100, Math.max(0, Math.round(Number(slider.value))));
          draft = { ...draft, [choice.key]: Number.isFinite(value) ? value : 0 };
          updateSelection();
        });
        list.append(row);
        if (previousGroup === choice.key) slider.focus();
      }
      list.hidden = !choices.length;
      statsRow.hidden = !choices.length;
      // A map whose groups changed while open: its own groups, in the proportions set (all at 0 stays at 0).
      if (!nothingSet()) draft = sharesForGroups(draft, choices.map(choice => choice.key));
      emptyNote.hidden = Boolean(choices.length);
    }
    updateSelection();
  }

  /**
   * Collapsed it is a small movable card, the quest tracker's size; opened it is
   * the ordinary Auto Farm window, centred and fixed (Ryan), over a backdrop
   * that closes it. The game is never paused for it.
   */
  function setExpanded(expanded: boolean) {
    content.hidden = !expanded;
    sheet.classList.toggle('is-collapsed', !expanded);
    sheet.classList.toggle('farm-card', !expanded);
    sheet.classList.toggle('is-window', expanded);
    backdrop.hidden = !expanded;
    // The "?" is the window's, not the small card's.
    helpToggle.hidden = !expanded || aggroRun();
    toggle.setAttribute('aria-expanded', String(expanded));
    caret.textContent = expanded ? '▾' : '▸';
    movable.place();
  }

  function close() {
    if (content.hidden) return false;
    const restoreFocus = content.contains(document.activeElement) || document.activeElement === helpToggle;
    setHelpOpen(false);
    setExpanded(false);
    options.clearInput();
    if (restoreFocus) toggle.focus();
    refresh();
    return true;
  }

  /** Back and Escape leave the "?" page first, then collapse the card. */
  function back() {
    if (help.hidden) return close();
    setHelpOpen(false);
    helpToggle.focus();
    return true;
  }

  function open() {
    if (!options.visible() || !content.hidden) return;
    // Reopening shows the sliders last farmed with, as this map names its stats.
    draft = options.farm.savedShares();
    choiceKey = '';
    setHelpOpen(false);
    options.clearInput();
    renderChoices();
    setExpanded(true);
    refresh();
  }

  /** The card's whole label, collapsed or open: "Autofarm: On" or "Autofarm: Off" (Ryan). */
  const badgeText = () => `Autofarm: ${options.farm.state().active ? 'On' : 'Off'}`;

  function refresh() {
    options.farm.refresh();
    // A run lacking its picked groups on this map gets the picker, which stays until they are picked.
    const groups = mapGroups(), needed = aggroPicksNeeded(options.aggro?.());
    if (aggroRun() && options.visible() && groups.length && !picker.isOpen() && picker.lacking(needed, groups)) picker.open(needed, groups);
    helpToggle.hidden = content.hidden || aggroRun();
    if (aggroRun() && !content.hidden) { setHelpOpen(false); setExpanded(false); }
    const visible = options.visible();
    const wasHidden = sheet.hidden;
    sheet.hidden = !visible;
    if (wasHidden && visible) movable.place();
    const state = options.farm.state();
    sheet.classList.toggle('is-farming', state.active);
    toggle.setAttribute('aria-label', content.hidden
      ? `Open Auto Farm. ${state.active ? `Farming ${state.selectedLabel}. ` : ''}Drag or use arrow keys to move; Home to reset position.`
      : 'Close Auto Farm');
    toggle.title = `${state.active ? `${state.selectedLabel} · ${state.status} · ` : ''}Click to ${content.hidden ? 'open' : 'close'} · Drag to move · F to ${state.active ? 'stop' : 'start'}`;
    const text = badgeText();
    if (badge.textContent !== text) badge.textContent = text;
    badge.hidden = !text;
    if (visible && !content.hidden) renderChoices();
  }

  const movable = installMovableHudCard({ panel: sheet, handle: toggle, storage, positionKey: AUTO_FARM_POSITION_KEY, movable: () => content.hidden, toggle: () => {
    // In an Aggro run the button picks or switches the groups that chase you.
    if (aggroRun()) { const groups = mapGroups(); if (groups.length) picker.open(aggroPicksNeeded(options.aggro?.()), groups); return; }
    if (content.hidden) open(); else close();
  } });
  backButton.addEventListener('click', () => {
    if (help.hidden && farming()) { options.farm.stop(); close(); return; }
    back();
  });
  moreToggle.addEventListener('click', () => setMoreOpen(more.hidden, true));
  helpToggle.addEventListener('click', () => { if (content.hidden) open(); setHelpOpen(help.hidden); });
  for (const button of priorityButtons) button.addEventListener('click', () => {
    const choice = AUTO_FARM_PRIORITIES.find(entry => entry.id === button.dataset.priority);
    if (choice) options.farm.setPriority(choice.id);
    updateSelection();
  });
  advanceSwitch.addEventListener('click', () => { options.farm.setAdvance(!options.farm.advance()); updateSelection(); });
  bossSwitch.addEventListener('click', () => { options.farm.setFightBosses(!options.farm.fightBosses()); updateSelection(); });
  for (const power of powerRows) {
    const slider = power.row.querySelector('input')!;
    slider.addEventListener('input', () => {
      power.set(POWER_STEPS[Math.max(0, Math.min(POWER_STEPS.length - 1, Math.round(Number(slider.value))))]);
      updateSelection();
    });
  }
  for (const button of pullButtons) button.addEventListener('click', () => {
    if (options.farm.pullAvailable?.() !== false) options.farm.setPullAll(button.dataset.pull === 'on');
    updateSelection();
  });
  sheet.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !content.hidden) { event.preventDefault(); back(); }
  });
  startButton.addEventListener('click', () => {
    // Done while farming: farming goes on, restarted only if the sliders changed.
    if (farming() && sameShares(draft, options.farm.savedShares())) { close(); return; }
    if (options.farm.start(draft)) close();
    else updateSelection();
  });
  /**
   * F starts Auto Farm with the sliders last set, or stops it. Not while typing,
   * under another window, or in an Aggro run (its picker owns the button). With
   * nothing to farm here it opens the window, which says why.
   */
  const onKey = (event: KeyboardEvent) => {
    if (event.code !== 'KeyF' || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
    if (!options.visible() || aggroRun()) return;
    const top = topBackButton(document);
    if (top && top !== backButton) return;
    event.preventDefault();
    if (farming()) options.farm.stop();
    else if (!options.farm.start(options.farm.savedShares())) open();
    refresh();
  };
  document.addEventListener('keydown', onKey);
  // Hidden, there is no button to update; autofarm itself refreshes from its movement step.
  const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 250);
  refresh();
  return { close, refresh, destroy() { document.removeEventListener('keydown', onKey); movable.destroy(); window.clearInterval(timer); backdrop.remove(); sheet.remove(); } };
}
