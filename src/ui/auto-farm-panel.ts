import { ENEMY_TYPES, REWARD_DATA, rewardAmountLabel, rewardStatLabel, type EnemyDefinition } from '../game/enemies';
import type { AutoFarmController } from '../game/runtime/auto-farm/auto-farm-controller';
import { AUTO_FARM_PRIORITIES, farmGroupRewardType } from '../game/runtime/auto-farm/auto-farm-priority';
import { SOUL_STAT_DETAILS } from '../../shared/soul-dimension';
import { soulRewardText } from '../game/soul-world';
import { POWER_STEPS, powerLabel } from '../game/runtime/auto-farm/auto-farm-plan';
import { aggroPicksNeeded, readAggroPicks, writeAggroPicks } from '../game/runtime/auto-farm/aggro-picks';
import { createAggroPickPrompt } from './aggro-pick-prompt';
import { topBackButton } from './desktop-hotkeys';
import { actionForKey, onControlAction } from '../game/runtime/control-bindings';
import { installMovableHudCard } from './movable-hud-card';
import type { AggroChallenge } from '../../shared/aggro-challenge';
import type { RewardType } from '../game/enemies';
import { AUTO_CHOP_HELP_LINES, AUTO_MINE_HELP_LINES, createAutoChopView, createAutoMineView } from './auto-gather-view';
import { setAttr, setHidden, setText } from './dom-write';

/** Where the card was dragged to; positions saved under older keys are ignored, so the card starts centred. */
export const AUTO_FARM_POSITION_KEY = 'wildstat:autofarm-position:v2';
type PanelStorage = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStorage = (): PanelStorage | undefined => { try { return window.localStorage; } catch { return undefined; } };
/** The controller's lines are sentence case ("Moving to enemy"); the window shows every word capitalised. */
/** The "?" page: what each control does, a line each, in the words a player would use. */
const HELP_LINES: readonly [term: string, line: string][] = [
  ['Stats', 'Tap Off, Farm or Aggro for each stat. Farm walks to its camps and picks whichever raises your power fastest right now.'],
  ['Move On', "Goes to the next map once you'd kill its enemies fast and survive their hits, with them Move At times as strong (1x is just enough). A boss that locks the way is fought first, until it or you go down."],
  ['Deaths', 'It respawns and carries on with the same settings.'],
  ['Aggro', 'Pulls its camps to you: one at a time, one more for each Aggro win, taking turns when more are on Aggro. With nothing on Farm it stands still and fights only what it pulls.'],
  ['Target', 'Which enemy it hits first.'],
]
/** The slider under the switches: how much of the next map's power to have before it goes, 0.1x to 10x. */
const powerSlider = (className: string, label: string, sub: string, aria: string) =>
  `<label class="farm-weight farm-power ${className}"><span class="farm-weight-name"><span class="farm-weight-label">${label}</span><span class="farm-weight-sub">${sub}</span></span>`
  + `<input type="range" min="0" max="${POWER_STEPS.length - 1}" step="1" aria-label="${aria}"><output aria-hidden="true"></output></label>`;
/** What each stat is set to: left alone, farmed at its camps, or pulled to the player. */
type FarmMode = 'off' | 'farm' | 'aggro';
type FarmModes = Record<string, FarmMode>;
const FARM_MODES: readonly [FarmMode, string][] = [['off', 'Off'], ['farm', 'Farm'], ['aggro', 'Aggro']];
const sameModes = (a: FarmModes, b: FarmModes) => [...new Set([...Object.keys(a), ...Object.keys(b)])].every(key => (a[key] ?? 'off') === (b[key] ?? 'off'));
const keysOn = (modes: FarmModes, mode: FarmMode) => Object.keys(modes).filter(key => modes[key] === mode);
const titleCase = (text: string) => text.replace(/(^|[\s(/-])(\p{Ll})/gu, (_match, lead: string, letter: string) => lead + letter.toUpperCase());
const segment = (label: string, labelId: string, className: string, buttons: string) =>
  `<div class="farm-setting"><span id="${labelId}" class="farm-setting-label">${label}</span>`
  + `<div class="farm-segment ${className}" role="radiogroup" aria-labelledby="${labelId}">${buttons}</div></div>`;

/**
 * The autofarm window, kept short. Each stat is Off, Farm or Aggro: Farm walks
 * to its camps (Auto Farm picks the one raising power fastest), Aggro pulls its
 * camps to the player, and with nothing on Farm it stands still. Move On goes to the next
 * map at its recommended power; Fight Bosses fights the boss at its; Pull and
 * Target sit below them. The movable card header shows what the farm is doing even when collapsed.
 * In the Copper Hills the same button and window are Auto Mine's, in Timberwood Auto Chop's (auto-gather-view.ts):
 * a switch per ore or tree instead of stats. Elsewhere in the Town there is no button.
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
  /** What each soul kill pays now, the Soul Level's doubling. */
  soulRewardMultiplier?: () => number;
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
    priority: () => options.farm.priority(), setPriority: priority => options.farm.setPriority(priority),
    advance: () => options.farm.advance(), setAdvance: on => options.farm.setAdvance(on) });
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
    + `<div class="farm-setting farm-stats-heading"><span id="autoFarmStatsLabel" class="farm-setting-label">Stats</span><span class="farm-aggro-count" hidden></span></div>`
    + `<div class="farm-weights" role="group" aria-labelledby="autoFarmStatsLabel"></div>`
    + `<p class="farm-empty" hidden>No Enemies Here</p>`
    + `<button type="button" class="farm-switch farm-move" role="switch" data-switch="advance" aria-checked="false" aria-describedby="autoFarmBossStatus">`
    + `<span class="farm-switch-copy"><span class="farm-switch-label">Move On</span><small id="autoFarmBossStatus" class="farm-boss-status"></small></span><span class="farm-knob" aria-hidden="true"></span></button>`
    + powerSlider('farm-move-power', 'Move At', 'Enemy Strength', 'Move On, Boss First, Once Ready For Next Map Enemies This Many Times As Strong')
    + `<div class="farm-more">`
    + `<div class="farm-setting farm-aggro-row" hidden><span class="farm-setting-label">Chasing Groups</span><div class="farm-segment"><button type="button" class="farm-aggro-pick">Choose</button></div></div>`
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
  const aggroRow = element('.farm-aggro-row');
  const mine = options.farm.mine ?? null, chop = options.farm.chop ?? null;
  const mineView = mine ? createAutoMineView(mine, () => updateSelection()) : null;
  const chopView = chop ? createAutoChopView(chop, () => updateSelection()) : null;
  if (chopView) element('.farm-body').after(chopView.body);
  if (mineView) element('.farm-body').after(mineView.body);
  /** Auto Mine in the Copper Hills, Auto Chop in Timberwood: the one whose area the player is in, or null. */
  const gather = () => mine?.here() ? { name: 'Auto Mine', run: mine, view: mineView!, help: AUTO_MINE_HELP_LINES }
    : chop?.here() ? { name: 'Auto Chop', run: chop, view: chopView!, help: AUTO_CHOP_HELP_LINES } : null;
  const mining = () => Boolean(gather());
  /** The rest of the Town has nothing to run: no button there. */
  const shown = () => options.visible() && (mining() || !(mine?.inTown() ?? chop?.inTown() ?? false));
  // Waiting to carry on after a map change counts: it starts again by itself, so it shows On and Stop cancels it.
  const farming = () => {
    const here = gather();
    if (here) return here.run.state().active;
    const state = options.farm.state(); return state.active || Boolean(state.waiting);
  };
  const selection = element('.farm-selection');
  const emptyNote = element('.farm-empty');
  const helpToggle = element<HTMLButtonElement>('.farm-help-toggle');
  const help = element('.farm-help');
  const body = element('.farm-body');
  const helpList = element('.farm-help-list');
  const title = element('#autoFarmTitle');
  /** Which window it is showing, Auto Farm's, Auto Mine's or Auto Chop's: its title, its "?" page and its body. */
  let shownName: string | null = null;
  function showKind() {
    const here = gather(), name = here?.name ?? 'Auto Farm';
    if (name === shownName) return;
    // Out of the Town with the window open: the modes as last set, as this map names its stats.
    if (shownName && shownName !== 'Auto Farm' && !here) { draft = savedModes(); choiceKey = ''; }
    shownName = name;
    title.textContent = name;
    helpToggle.setAttribute('aria-label', `How ${name} Works`);
    helpToggle.title = `How ${name} Works`;
    helpList.replaceChildren();
    for (const [term, line] of here?.help ?? HELP_LINES) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = term; dd.textContent = line;
      helpList.append(dt, dd);
    }
    setHelpOpen(!help.hidden);
  }
  /** The "?" page takes the settings' place, so the window keeps its size; Back returns to them. */
  function setHelpOpen(open: boolean) {
    help.hidden = !open;
    const view = gather()?.view;
    body.hidden = open || Boolean(view);
    if (mineView) mineView.body.hidden = open || view !== mineView;
    if (chopView) chopView.body.hidden = open || view !== chopView;
    helpToggle.setAttribute('aria-expanded', String(open));
  }
  /** Each stat's mode in this window, applied by Start or Go and kept when it closes. */
  let draft: FarmModes = {};
  const groupKeys = () => options.farm.choices().map(choice => choice.key);
  let choiceKey = '';

  const priorityButtons = [...sheet.querySelectorAll<HTMLButtonElement>('[data-priority]')];
  const aggroCount = element('.farm-aggro-count');
  const advanceSwitch = element<HTMLButtonElement>('[data-switch="advance"]');
  /** Move At: the slider under Move On, resting with it off. */
  const powerRows = [
    { row: element('.farm-move-power'), on: () => options.farm.advance(), value: () => options.farm.movePower(), set: (step: number) => options.farm.setMovePower(step) },
  ];
  /** A switch and its status line: the line lit when the controller says it is going now, quiet with the switch off. */
  function showSwitch(button: HTMLButtonElement, on: boolean, line: string, ready: boolean) {
    button.setAttribute('aria-checked', String(on));
    const text = titleCase(line), status = button.querySelector<HTMLElement>('.farm-boss-status')!;
    if (status.textContent !== text) status.textContent = text;
    status.classList.toggle('is-ready', on && ready);
    status.classList.toggle('is-idle', !on);
  }

  /** The modes saved: Farm from the saved stats, Aggro from the pull picks (none during a run, whose chasers are its pull). */
  function savedModes(): FarmModes {
    const shares = options.farm.savedShares(), aggro = new Set(aggroRun() ? [] : options.farm.aggroGroupKeys());
    return Object.fromEntries(groupKeys().map(key => [key, aggro.has(key) ? 'aggro' : (shares[key] ?? 0) > 0 ? 'farm' : 'off']));
  }
  /** Saves the modes: Farm as the saved stats, Aggro as the pull picks. */
  function saveModes(modes: FarmModes) {
    if (!aggroRun()) options.farm.setAggroGroups(keysOn(modes, 'aggro'));
    options.farm.rememberShares(Object.fromEntries(groupKeys().map(key => [key, modes[key] === 'farm' ? 1 : 0])));
  }
  /**
   * Starts with these modes. Nothing on Farm: it stands still and fights what it pulls (Vis: "i dont want
   * char to move"), or in an Aggro run what chases it. Otherwise it farms the Farm groups, and the Aggro
   * groups pulled now as they arrive (one waiting its turn is never walked to).
   */
  function startModes(modes: FarmModes) {
    saveModes(modes);
    const farmed = keysOn(modes, 'farm');
    if (!farmed.length) {
      const plan = aggroRun() ? options.farm.chasingGroupKeys() : options.farm.aggroGroupKeys();
      return plan.length > 0 && options.farm.startZero(plan);
    }
    const fought = aggroRun() ? [] : keysOn(modes, 'aggro');
    return options.farm.start(Object.fromEntries([...farmed, ...fought].map(key => [key, 1])), false);
  }
  const farmedNone = () => !keysOn(draft, 'farm').length;
  /** Nothing on Farm in an Aggro run: it fights only what chases it, standing still. */
  const chaseOnly = () => aggroRun() && farmedNone() && options.farm.chasingGroupKeys().length > 0;
  /** Nothing on Farm, some on Aggro, outside a run: it pulls those and stands still. */
  const pullOnly = () => !aggroRun() && farmedNone() && keysOn(draft, 'aggro').length > 0;
  const nothingSet = () => farmedNone() && !chaseOnly() && !pullOnly();
  /** Auto Mine's or Auto Chop's window: its switches and status, Start or Go, and why it cannot start. */
  function updateMining() {
    const here = gather()!;
    here.view.render();
    const live = farming(), reason = live ? null : options.unavailable() ?? here.run.problem();
    const backLabel = live ? 'Stop' : 'Back';
    if (backButton.textContent !== backLabel) backButton.textContent = backLabel;
    if (startButton.textContent !== (live ? 'Go' : 'Start')) startButton.textContent = live ? 'Go' : 'Start';
    startButton.disabled = Boolean(reason);
    const note = reason ?? '';
    if (selection.textContent !== note) selection.textContent = note;
    selection.hidden = !note;
  }
  function updateSelection() {
    if (mining()) { updateMining(); return; }
    const limit = options.farm.pullLimit(), aggroOn = keysOn(draft, 'aggro');
    for (const row of list.querySelectorAll<HTMLElement>('[data-group]')) {
      const key = row.dataset.group!, mode = draft[key] ?? 'off';
      for (const button of row.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
        button.setAttribute('aria-checked', String(button.dataset.mode === mode));
        // No Aggro where nothing can be pulled: before an Aggro win's limit is set, and through an Aggro run.
        if (button.dataset.mode === 'aggro') {
          button.hidden = limit === 0;
          // Past the limit it waits its turn, said on screen (mobile first): amber.
          button.classList.toggle('is-waiting', mode === 'aggro' && aggroOn.indexOf(key) >= limit);
        }
      }
      row.classList.toggle('is-off', mode === 'off');
    }
    const priority = options.farm.priority();
    for (const button of priorityButtons) button.setAttribute('aria-checked', String(button.dataset.priority === priority));
    showSwitch(advanceSwitch, options.farm.advance(), options.farm.moveStatus(), options.farm.moveReady());
    for (const power of powerRows) {
      const value = power.value(), step = String(POWER_STEPS.indexOf(value as typeof POWER_STEPS[number])), slider = power.row.querySelector('input')!;
      if (slider.value !== step) slider.value = step;
      slider.setAttribute('aria-valuetext', powerLabel(value));
      power.row.querySelector('output')!.textContent = powerLabel(value);
      power.row.style.setProperty('--farm-weight-at', `${Number(step) / (POWER_STEPS.length - 1) * 100}%`);
      // Dimmed while its switch is off, but never locked: it can be set first and switched on after.
      power.row.classList.toggle('is-off', !power.on());
    }
    // Any number on Aggro, pulled as many at once as the limit (one, one more per Aggro win); hidden in an Aggro run.
    const pulledCount = Math.min(aggroOn.length, limit), waiting = aggroOn.length - pulledCount;
    const countText = `Aggro ${pulledCount}/${limit}${waiting ? ` · ${waiting} Waiting` : ''}`;
    aggroCount.hidden = limit === 0;
    if (aggroCount.textContent !== countText) aggroCount.textContent = countText;
    // While farming the window is a look and a change: Stop ends the farm, Go keeps it going with what is set.
    const live = farming();
    // Opened it is a window like any other: Back closes it, so Escape does too (desktop-hotkeys).
    const backLabel = live ? 'Stop' : 'Back';
    if (backButton.textContent !== backLabel) backButton.textContent = backLabel;
    if (startButton.textContent !== (live ? 'Go' : 'Start')) startButton.textContent = live ? 'Go' : 'Start';
    const reason = options.unavailable();
    const empty = !options.farm.choices().length;
    startButton.disabled = empty || nothingSet() || Boolean(reason);
    const note = reason ?? (chaseOnly() ? 'Nothing On Farm: Fights Only What Chases You'
      : pullOnly() ? 'Nothing On Farm: Pulls Your Aggro Stats And Stands Still'
      : !empty && nothingSet() ? 'Set A Stat To Farm Or Aggro' : '');
    if (selection.textContent !== note) selection.textContent = note;
    selection.hidden = !note;
  }

  function renderChoices() {
    if (mining()) { updateMining(); return; }
    const choices = options.farm.choices();
    const multiplier = options.showBaseStatRewards() ? 1 : options.rewardMultiplier();
    const soulMultiplier = options.soulRewardMultiplier?.() ?? 1;
    const displayAmount = (reward: EnemyDefinition["reward"], amount = reward.amount) =>
      options.rewardAmount?.(reward.type, amount) ?? amount * multiplier;
    const rewardText = (choice: typeof choices[number]) => {
      const reward = choice.reward ?? ENEMY_TYPES[choice.type].reward;
      if (choice.soul) return soulRewardText(choice.soul, soulMultiplier);
      const displayedReward = { ...reward, amount: displayAmount(reward) };
      return choice.maxReward && choice.maxReward > reward.amount
        ? `${rewardAmountLabel(displayedReward)}–${rewardAmountLabel({ ...displayedReward, amount: displayAmount(reward, choice.maxReward) }).slice(1)}`
        : rewardAmountLabel(displayedReward);
    };
    // Rebuilt only when the stats on offer change. The game runs behind the window, so
    // rewards grow while it is open; rebuilding for that would drop a tap's focus.
    const key = `${options.mapName()}:${choices.map(c => c.key).join('|')}`;
    if (key === choiceKey) {
      for (const choice of choices) {
        const sub = list.querySelector<HTMLElement>(`[data-group="${choice.key}"] .farm-weight-sub`);
        const text = rewardText(choice);
        if (sub && sub.textContent !== text) sub.textContent = text;
      }
    } else {
      choiceKey = key;
      const previousGroup = (document.activeElement?.closest?.('[data-group]') as HTMLElement | null)?.dataset.group;
      list.replaceChildren();
      for (const choice of choices) {
        const reward = choice.reward ?? ENEMY_TYPES[choice.type].reward;
        const row = document.createElement('div');
        row.className = 'farm-weight farm-mode-row';
        row.dataset.group = choice.key;
        // A soul stat looks as its kill popup does: its own colour, a flat amount (never grown by research or prestige).
        const soul = choice.soul ? SOUL_STAT_DETAILS[choice.soul] : null;
        row.style.setProperty('--farm-stat-color', soul?.color ?? REWARD_DATA[reward.type].color);
        row.innerHTML = '<span class="farm-weight-name"><span class="farm-weight-label"></span><span class="farm-weight-sub"></span></span>'
          + `<div class="farm-segment farm-mode" role="radiogroup">${FARM_MODES.map(([mode, text]) => `<button type="button" role="radio" data-mode="${mode}" aria-checked="false">${text}</button>`).join('')}</div>`;
        // The stat is the choice; what one kill pays is the detail.
        const label = soul?.label ?? rewardStatLabel(reward);
        row.querySelector('.farm-weight-label')!.textContent = label;
        row.querySelector('.farm-weight-sub')!.textContent = rewardText(choice);
        row.title = choice.kinds.join(', ');
        row.querySelector('.farm-mode')!.setAttribute('aria-label', label);
        for (const button of row.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
          button.addEventListener('click', () => {
            draft = { ...draft, [choice.key]: button.dataset.mode as FarmMode };
            updateSelection();
          });
        }
        list.append(row);
        if (previousGroup === choice.key) row.querySelector<HTMLButtonElement>(`[data-mode="${draft[choice.key] ?? 'off'}"]`)?.focus();
      }
      list.hidden = !choices.length;
      statsRow.hidden = !choices.length;
      // This map's groups, each as it was left; a group new to this map starts Off.
      draft = Object.fromEntries(choices.map(choice => [choice.key, draft[choice.key] ?? 'off']));
      emptyNote.hidden = Boolean(choices.length);
    }
    updateSelection();
  }

  /**
   * Collapsed it is a small movable card, the quest tracker's size; opened it is
   * the ordinary Auto Farm window, centred and fixed, over a backdrop
   * that closes it. The game is never paused for it.
   */
  function setExpanded(expanded: boolean) {
    content.hidden = !expanded;
    sheet.classList.toggle('is-collapsed', !expanded);
    sheet.classList.toggle('farm-card', !expanded);
    sheet.classList.toggle('is-window', expanded);
    backdrop.hidden = !expanded;
    // The "?" is the window's, not the small card's.
    helpToggle.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    caret.textContent = expanded ? '▾' : '▸';
    movable.place();
  }

  function close() {
    if (content.hidden) return false;
    // Not farming, the modes stay as they were left; farming, the window keeps showing what is running.
    if (!farming() && groupKeys().length) saveModes(draft);
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
    if (!shown() || !content.hidden) return;
    showKind();
    // Reopening shows the modes last farmed with, as this map names its stats.
    if (!mining()) draft = savedModes();
    choiceKey = '';
    setHelpOpen(false);
    options.clearInput();
    renderChoices();
    setExpanded(true);
    refresh();
  }

  /** The card's whole label, collapsed or open: "Autofarm: On" or "Autofarm: Off", in the hills "Auto Mine: On". */
  const badgeText = () => `${gather()?.name ?? 'Autofarm'}: ${farming() ? 'On' : 'Off'}`;

  function refresh() {
    options.farm.refresh();
    // A run lacking its picked groups on this map gets the picker, which stays until they are picked.
    const groups = mapGroups(), needed = aggroPicksNeeded(options.aggro?.());
    if (aggroRun() && options.visible() && groups.length && !picker.isOpen() && picker.lacking(needed, groups)) picker.open(needed, groups);
    setHidden(helpToggle, content.hidden);
    setHidden(aggroRow, !aggroRun());
    const visible = shown();
    // Walked out of its area: the window folds away with the button.
    if (options.visible() && !visible && !content.hidden) { setHelpOpen(false); setExpanded(false); }
    const wasHidden = sheet.hidden;
    setHidden(sheet, !visible);
    if (wasHidden && visible) movable.place();
    showKind();
    const state = options.farm.state();
    sheet.classList.toggle('is-farming', mining() ? farming() : state.active);
    const here = gather();
    if (here) {
      const status = here.run.state().status;
      setAttr(toggle, 'aria-label', content.hidden ? `Open ${here.name}. ${farming() ? `${status}. ` : ''}Drag or use arrow keys to move; Home to reset position.` : `Close ${here.name}`);
      setAttr(toggle, 'title', `${farming() ? `${status} · ` : ''}Click to ${content.hidden ? 'open' : 'close'} · Drag to move · F to ${farming() ? 'stop' : 'start'}`);
    } else setAttr(toggle, 'aria-label', content.hidden
      ? `Open Auto Farm. ${state.active ? `Farming ${state.selectedLabel}. ` : ''}Drag or use arrow keys to move; Home to reset position.`
      : 'Close Auto Farm');
    if (!mining()) setAttr(toggle, 'title', `${state.active ? `${state.selectedLabel} · ${state.status} · ` : ''}Click to ${content.hidden ? 'open' : 'close'} · Drag to move · F to ${state.active ? 'stop' : 'start'}`);
    const text = badgeText();
    setText(badge, text);
    setHidden(badge, !text);
    if (visible && !content.hidden) renderChoices();
  }

  const movable = installMovableHudCard({ panel: sheet, handle: toggle, storage, positionKey: AUTO_FARM_POSITION_KEY, movable: () => content.hidden, toggle: () => {
    // An Aggro run's window is the same one, with Stop; its chasing groups are a button inside it.
    if (content.hidden) open(); else close();
  } });
  /** Stops whichever is running here: Auto Mine or Auto Chop in their areas, Auto Farm elsewhere. */
  const stopRunning = () => { const here = gather(); if (here) here.run.stop(); else options.farm.stop(); };
  backButton.addEventListener('click', () => {
    if (help.hidden && farming()) { stopRunning(); close(); return; }
    back();
  });
  helpToggle.addEventListener('click', () => { if (content.hidden) open(); setHelpOpen(help.hidden); });
  aggroRow.querySelector('button')!.addEventListener('click', () => {
    const groups = mapGroups();
    if (!groups.length) return;
    close();
    picker.open(aggroPicksNeeded(options.aggro?.()), groups);
  });
  for (const button of priorityButtons) button.addEventListener('click', () => {
    const choice = AUTO_FARM_PRIORITIES.find(entry => entry.id === button.dataset.priority);
    if (choice) options.farm.setPriority(choice.id);
    updateSelection();
  });
  advanceSwitch.addEventListener('click', () => { options.farm.setAdvance(!options.farm.advance()); updateSelection(); });
  for (const power of powerRows) {
    const slider = power.row.querySelector('input')!;
    slider.addEventListener('input', () => {
      power.set(POWER_STEPS[Math.max(0, Math.min(POWER_STEPS.length - 1, Math.round(Number(slider.value))))]);
      updateSelection();
    });
  }
  sheet.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !content.hidden) { event.preventDefault(); back(); }
  });
  startButton.addEventListener('click', () => {
    const here = gather();
    if (here) {
      if (farming() || here.run.start()) close();
      else updateSelection();
      return;
    }
    // Go while farming: farming goes on, restarted only if a mode changed.
    if (farming() && sameModes(draft, savedModes())) { close(); return; }
    if (startModes(draft)) close();
    else updateSelection();
  });
  /**
   * The Auto Farm key (F unless rebound) or controller button starts Auto Farm with the modes last set,
   * or stops it, in an Aggro run too. Not while typing or under another window. With nothing to farm
   * here it opens the window, which says why.
   */
  const toggleFarming = () => {
    if (!shown()) return false;
    const top = topBackButton(document);
    if (top && top !== backButton) return false;
    if (farming()) stopRunning();
    else if (mining() ? !gather()!.run.start() : !startModes(savedModes())) open();
    refresh();
    return true;
  };
  const onKey = (event: KeyboardEvent) => {
    // Farming, the window's Back reads Stop, so Escape (which presses a Back) would find none: it closes the window
    // and leaves the farm running, unless another window with its own Back is open over it.
    if (event.code === 'Escape' && !event.defaultPrevented && !content.hidden && farming() && !topBackButton(document)) {
      event.preventDefault();
      back();
      return;
    }
    if (actionForKey(event.code) !== 'autoFarm' || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
    if (toggleFarming()) event.preventDefault();
  };
  // Capture: a click leaves focus on the card, and the card keeps keys pressed on it from the world.
  document.addEventListener('keydown', onKey, true);
  const stopControl = onControlAction(document, 'autoFarm', () => { toggleFarming(); });
  // Hidden, there is no button to update; autofarm itself refreshes from its movement step.
  const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 250);
  refresh();
  return { close, refresh, destroy() { document.removeEventListener('keydown', onKey, true); stopControl(); movable.destroy(); window.clearInterval(timer); backdrop.remove(); sheet.remove(); } };
}
