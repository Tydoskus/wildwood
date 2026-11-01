import { formatCompactNumber } from './number-format';
import { installMovableHudCard } from './movable-hud-card';
import { renderBooleanSetting } from './settings';
import { createStatTrackerModel, TRACKED_STATS, type TrackedStat, type TrackerBuild, type TrackerValues } from './stat-tracker-model';
import { setClassName, setHidden, setText } from './dom-write';
import { installStatTrackerDps } from './stat-tracker-dps';

const LABELS = { power: 'Power', hp: 'Max HP', damage: 'Damage', armor: 'Armor', regen: 'Regen', attackSpeed: 'Atk Speed', critDamage: 'Crit Dmg', kills: 'Kills' };
const ENABLED_KEY = 'wildstat-native-stat-tracker-enabled';
const POSITION_KEY = 'wildstat-native-stat-tracker-position';
const COLLAPSED_KEY = 'wildstat-native-stat-tracker-collapsed';
const HIDDEN_KEY = 'wildstat-stat-tracker-hidden-stats';
const PRESTIGE_RESET_KEY = 'wildstat-stat-tracker-reset-on-prestige';
const COMPACT_KEY = 'wildstat-stat-tracker-compact';
const ICONS_KEY = 'wildstat-stat-tracker-compact-icons';
const COMPACT_LABELS = { ...LABELS, hp: 'HP', attackSpeed: 'Speed', critDamage: 'Crit' };
// Small inline symbols avoid extra image downloads for the optional compact labels.
const STAT_ICON_PATHS: Record<TrackedStat, string> = {
  power: '<path d="m13 2-8 12h6l-1 8 9-13h-7z"/>',
  hp: '<path d="M12 21 3 12C-2 5 7 0 12 7c5-7 14-2 9 5z"/>',
  damage: '<path d="m15 3 6 0 0 6-11 11-6-6z"/><path d="m3 12 9 9M3 21l4-4"/>',
  armor: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z"/>',
  regen: '<path d="M19 7A8 8 0 1 0 20 15M19 2v6h-6M12 8v8M8 12h8"/>',
  attackSpeed: '<path d="m15 3 6 0 0 6-11 11-6-6z"/><path d="m3 12 9 9M3 21l4-4M2 4h7M1 8h5"/>',
  critDamage: '<path d="m12 2 3 6 7-1-4 6 3 7-7-2-5 4-1-7-6-3 7-3z"/>',
  kills: '<path fill="currentColor" fill-rule="evenodd" stroke="none" d="M12 2a9 9 0 0 0-9 9v4l4 2v5h10v-5l4-2v-4a9 9 0 0 0-9-9ZM5 10h5v5H5Zm9 0h5v5h-5Zm-2 5-2 3h4Z"/>',
};

/** Default slider position; reproduces the panel exactly as it looked before the slider existed. */
export const DEFAULT_TRACKER_OPACITY = 60;

/**
 * Backdrop alpha follows the slider all the way to nothing. Text and frame
 * follow it too but bottom out at a quarter and reach full a little past
 * halfway, so a fully transparent tracker still reads and the default look
 * (60) is solid ink over the profile HUD's translucency.
 */
export function trackerOpacityStyle(percent: number) {
  const p = Math.min(100, Math.max(0, percent)) / 100;
  return { background: p, ink: Math.min(1, 0.25 + p * 1.5) };
}

export function installStatTracker(options: {
  read: () => { identity: string; prestigeLevel?: number; values: TrackerValues; build?: TrackerBuild; details?: Partial<Record<keyof TrackerValues, string>> } | null;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
}) {
  const model = createStatTrackerModel(options.storage);
  const toggle = document.getElementById('statTrackerToggle')!;
  const panel = document.createElement('section');
  panel.className = 'stat-tracker';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Live stat tracker');
  panel.innerHTML = `<header><button type="button" class="stat-tracker-handle" aria-label="Move stat tracker. Double-click or double-tap to lock or unlock position.">Stat tracker</button><button type="button" class="stat-tracker-gear" aria-label="Stat tracker settings" aria-haspopup="dialog" aria-expanded="false"><img src="assets/wildstat/icons/Icon_Settings.webp" alt="" aria-hidden="true"></button></header><table><thead><tr><th scope="col">Stat</th><th scope="col">Current</th><th scope="col">Gain</th><th scope="col">/ Hour</th></tr></thead><tbody>${TRACKED_STATS.map(key => `<tr data-stat="${key}"><th scope="row">${LABELS[key]}</th><td></td><td></td><td></td></tr>`).join('')}</tbody></table><footer><span class="stat-tracker-time"></span><button type="button" class="stat-tracker-reset" aria-label="Reset session">Reset</button></footer>`;
  // The gear opens a second card in the same style: opacity, which stats show, and whether a prestige resets the timer.
  const settings = document.createElement('section');
  settings.className = 'stat-tracker stat-tracker-settings';
  settings.hidden = true;
  settings.setAttribute('role', 'dialog');
  settings.setAttribute('aria-label', 'Stat tracker settings');
  settings.innerHTML = `<header><span class="stat-tracker-settings-title">Tracker Settings</span><button type="button" class="stat-tracker-settings-close" aria-label="Close tracker settings">✕</button></header><label class="stat-tracker-opacity"><span>Opacity</span><input type="range" min="0" max="100" step="1" aria-label="Panel opacity"></label><fieldset class="stat-tracker-filters"><legend>Show</legend>${TRACKED_STATS.map(key => `<label><input type="checkbox" data-stat="${key}">${LABELS[key]}</label>`).join('')}</fieldset><label class="stat-tracker-prestige-reset"><input type="checkbox">Reset timer on prestige</label>`;
  document.getElementById('hud')!.append(panel, settings);
  const handle = panel.querySelector<HTMLButtonElement>('.stat-tracker-handle')!;
  const OPACITY_KEY = 'wildstat-stat-tracker-opacity';
  const opacity = settings.querySelector<HTMLInputElement>('.stat-tracker-opacity input')!;
  function applyOpacity(percent: number) {
    const style = trackerOpacityStyle(percent);
    panel.style.setProperty('--stat-tracker-bg', String(style.background));
    panel.style.setProperty('--stat-tracker-ink', String(style.ink));
  }
  const savedRaw = options.storage.getItem(OPACITY_KEY);
  const savedOpacity = savedRaw === null ? DEFAULT_TRACKER_OPACITY : Number(savedRaw);
  opacity.valueAsNumber = Number.isFinite(savedOpacity) ? Math.min(100, Math.max(0, savedOpacity)) : DEFAULT_TRACKER_OPACITY;
  applyOpacity(opacity.valueAsNumber);
  opacity.addEventListener('input', () => {
    applyOpacity(opacity.valueAsNumber);
    try { options.storage.setItem(OPACITY_KEY, String(opacity.valueAsNumber)); } catch {}
  });
  // Hand the keyboard back to the world once the thumb is released, so arrow
  // keys walk again. Tabbing to the slider still keeps focus for adjustment.
  opacity.addEventListener('pointerup', () => opacity.blur());
  const reset = panel.querySelector<HTMLButtonElement>('.stat-tracker-reset')!;
  const gear = panel.querySelector<HTMLButtonElement>('.stat-tracker-gear')!;

  // Which rows show. Saved as the hidden ones, so a stat added later shows by default.
  const hidden = new Set<TrackedStat>();
  try { for (const stat of JSON.parse(options.storage.getItem(HIDDEN_KEY) || '[]')) if ((TRACKED_STATS as readonly string[]).includes(stat)) hidden.add(stat); } catch {}
  function renderFilters() {
    for (const stat of TRACKED_STATS) {
      panel.querySelector<HTMLElement>(`tr[data-stat="${stat}"]`)!.hidden = hidden.has(stat);
      settings.querySelector<HTMLInputElement>(`input[data-stat="${stat}"]`)!.checked = !hidden.has(stat);
    }
  }
  settings.querySelector('.stat-tracker-filters')!.addEventListener('change', event => {
    const box = event.target as HTMLInputElement;
    const stat = box.dataset.stat as TrackedStat | undefined;
    if (!stat) return;
    if (box.checked) hidden.delete(stat); else hidden.add(stat);
    try { options.storage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])); } catch {}
    renderFilters(); movable.place();
  });
  const prestigeReset = settings.querySelector<HTMLInputElement>('.stat-tracker-prestige-reset input')!;
  let resetOnPrestige = true;
  try { resetOnPrestige = options.storage.getItem(PRESTIGE_RESET_KEY) !== 'false'; } catch {}
  prestigeReset.checked = resetOnPrestige;
  model.setResetOnPrestige(resetOnPrestige);
  prestigeReset.addEventListener('change', () => {
    model.setResetOnPrestige(prestigeReset.checked);
    try { options.storage.setItem(PRESTIGE_RESET_KEY, String(prestigeReset.checked)); } catch {}
  });

  /** Opens the settings card beside the tracker: to its left, else its right, else above or below it. */
  function placeSettings() {
    const card = panel.getBoundingClientRect(), width = settings.offsetWidth, height = settings.offsetHeight, gap = 8;
    let left = card.left - width - gap, top = card.top;
    if (left < gap) left = card.right + gap;
    if (left + width > window.innerWidth - gap) {
      left = Math.min(Math.max(gap, card.left), window.innerWidth - width - gap);
      top = card.top - height - gap >= gap ? card.top - height - gap : card.bottom + gap;
    }
    settings.style.left = `${Math.max(gap, left)}px`;
    settings.style.top = `${Math.max(gap, Math.min(top, window.innerHeight - height - gap))}px`;
    settings.style.right = 'auto';
    settings.style.bottom = 'auto';
  }
  function showSettings(open: boolean) {
    settings.hidden = !open;
    gear.setAttribute('aria-expanded', String(open));
    if (open) placeSettings();
  }
  gear.addEventListener('click', () => showSettings(settings.hidden));
  settings.querySelector('.stat-tracker-settings-close')!.addEventListener('click', () => showSettings(false));
  for (const element of [gear, settings]) element.addEventListener('pointerdown', event => event.stopPropagation());

  const clock = panel.querySelector<HTMLElement>('.stat-tracker-time')!;
  clock.setAttribute('aria-label', 'Session elapsed time');
  const footer = panel.querySelector('footer')!;
  const compactLabel = document.createElement('label');
  compactLabel.className = 'stat-tracker-compact-option';
  const compactToggle = document.createElement('input');
  compactToggle.type = 'checkbox';
  compactLabel.append(compactToggle, 'Compact');
  settings.querySelector('.stat-tracker-filters')!.before(compactLabel);
  const compactOptions = document.createElement('fieldset');
  compactOptions.className = 'stat-tracker-compact-options';
  compactOptions.setAttribute('aria-label', 'Compact display');
  const compactDisclosure = document.createElement('details');
  compactDisclosure.className = 'stat-tracker-show-options stat-tracker-compact-disclosure';
  const compactSummary = document.createElement('summary');
  compactSummary.textContent = 'Compact display';
  compactDisclosure.append(compactSummary, compactOptions);
  compactLabel.after(compactDisclosure);
  compactDisclosure.addEventListener('toggle', () => { if (!settings.hidden) placeSettings(); });
  const iconsLabel = document.createElement('label');
  iconsLabel.className = 'stat-tracker-compact-option';
  const iconsToggle = document.createElement('input');
  iconsToggle.type = 'checkbox';
  iconsLabel.append(iconsToggle, 'Icons');
  compactOptions.append(iconsLabel);
  const columnOptions = [
    { name: 'Current', key: 'current', index: 2, shown: true },
    { name: 'Session gain', key: 'gain', index: 3, shown: false },
    { name: 'Gain/hour', key: 'hour', index: 4, shown: true },
  ].map(column => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    try {
      const saved = options.storage.getItem(`wildstat-stat-tracker-compact-${column.key}`);
      if (saved !== null) column.shown = saved === 'true';
    } catch {}
    input.checked = column.shown;
    label.append(input, column.name);
    compactOptions.append(label);
    input.addEventListener('change', () => {
      column.shown = input.checked;
      try { options.storage.setItem(`wildstat-stat-tracker-compact-${column.key}`, String(column.shown)); } catch {}
      renderCompact();
    });
    return { ...column, input };
  });
  let icons = false;
  try { icons = options.storage.getItem(ICONS_KEY) === 'true'; } catch {}
  iconsToggle.checked = icons;
  let compact = false;
  try { compact = options.storage.getItem(COMPACT_KEY) === 'true'; } catch {}
  compactToggle.checked = compact;
  function renderCompact() {
    panel.classList.toggle('is-compact', compact);
    compactOptions.hidden = !compact;
    compactDisclosure.hidden = !compact;
    // Keep at least one numeric column visible, even after restoring an invalid preference.
    if (!columnOptions.some(column => column.input.checked)) columnOptions[2].input.checked = true;
    const visibleColumns = columnOptions.filter(column => column.input.checked).length;
    for (const column of columnOptions) {
      column.input.disabled = column.input.checked && visibleColumns === 1;
      for (const cell of panel.querySelectorAll<HTMLElement>(`tr > :nth-child(${column.index})`)) {
        cell.hidden = compact && !column.input.checked;
      }
    }
    footer.prepend(clock);
    footer.append(reset);
    reset.textContent = 'Reset';
    for (const stat of TRACKED_STATS) {
      const label = panel.querySelector<HTMLElement>(`tr[data-stat="${stat}"] th`)!;
      label.title = LABELS[stat];
      label.setAttribute('aria-label', LABELS[stat]);
      if (compact && icons) label.innerHTML = `<svg class="stat-tracker-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${STAT_ICON_PATHS[stat]}</svg>`;
      else setText(label, (compact ? COMPACT_LABELS : LABELS)[stat]);
    }
    renderCollapsed();
    if (!settings.hidden) placeSettings();
  }
  compactToggle.addEventListener('change', () => {
    compact = compactToggle.checked;
    try { options.storage.setItem(COMPACT_KEY, String(compact)); } catch {}
    renderCompact();
    refresh();
  });
  iconsToggle.addEventListener('change', () => {
    icons = iconsToggle.checked;
    try { options.storage.setItem(ICONS_KEY, String(icons)); } catch {}
    renderCompact();
  });
  const cells = new Map(TRACKED_STATS.map(stat => [stat, panel.querySelectorAll<HTMLTableCellElement>(`[data-stat="${stat}"] td`)]));
  const dps = installStatTrackerDps(panel, settings, options.storage);
  const filters = settings.querySelector<HTMLFieldSetElement>('.stat-tracker-filters')!;
  const showOptions = document.createElement('details');
  showOptions.className = 'stat-tracker-show-options';
  const showSummary = document.createElement('summary');
  showSummary.textContent = 'Stats to display';
  filters.querySelector('legend')!.remove();
  filters.setAttribute('aria-label', 'Stats to show');
  filters.before(showOptions);
  showOptions.append(showSummary, filters);
  showOptions.addEventListener('toggle', () => { if (!settings.hidden) placeSettings(); });
  let enabled = false, lastSave = 0, collapsed = false;
  try {
    enabled = options.storage.getItem(ENABLED_KEY) === 'true';
    collapsed = options.storage.getItem(COLLAPSED_KEY) === 'true';
  } catch {}
  function renderCollapsed() {
    panel.classList.toggle('is-collapsed', collapsed);
    handle.setAttribute('aria-expanded', String(!collapsed));
    handle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} stat tracker. Double-click or double-tap to lock or unlock position.`);
    handle.textContent = `${compact && !collapsed ? 'Stats' : 'Stat tracker'} ${collapsed ? '▸' : '▾'}`;
    for (const element of panel.querySelectorAll<HTMLElement>('table, footer, .stat-tracker-gear')) element.hidden = collapsed;
    if (collapsed) showSettings(false);
    dps.refresh();
    movable.place();
  }
  function refresh() {
    const snapshot = options.read();
    // Keep session tracking independent of visibility; hiding does not reset it.
    const result = snapshot ? model.update(snapshot.identity, snapshot.values, snapshot.prestigeLevel, snapshot.build) : null;
    const wasHidden = panel.hidden;
    setHidden(panel, !enabled || !result);
    if (panel.hidden && !settings.hidden) showSettings(false);
    if (result && Date.now() - lastSave >= 10_000) { model.save(); lastSave = Date.now(); }
    if (panel.hidden || !result) return;
    dps.refresh();
    if (wasHidden) movable.place();
    const seconds = Math.floor(result.elapsedMs / 1000);
    setText(clock, `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
    for (const row of result.rows) {
      const rowCells = cells.get(row.stat)!;
      // Three significant digits throughout keeps every column narrow. Values
      // below one keep their decimals, so regeneration does not read as zero.
      const format = (value: number) => Math.abs(value) < 1
        ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : formatCompactNumber(value);
      const detail = snapshot?.details?.[row.stat];
      // The source uses the shared cap labels; retain the effective value instead of the saturated rating.
      const capped = (row.stat === 'attackSpeed' || row.stat === 'critDamage') && detail?.endsWith(' Max');
      setText(rowCells[0], capped ? detail! : detail && !compact ? `${format(row.current)} (${detail})` : format(row.current));
      [row.gain, row.perHour].forEach((value, index) => {
        setText(rowCells[index + 1], `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`);
        setClassName(rowCells[index + 1], value > 0 ? 'positive' : value < 0 ? 'negative' : '');
      });
    }
  }
  function setEnabled(value: boolean) {
    enabled = value;
    try { options.storage.setItem(ENABLED_KEY, String(value)); } catch {}
    renderBooleanSetting(toggle, value);
    refresh();
  }
  toggle.addEventListener('click', () => setEnabled(!enabled));

  reset.addEventListener('click', () => {
    if (dps.resetVisibleView()) return;
    if (options.read()) { refresh(); model.reset(); refresh(); }
  });
  // Pointer activation should not move keyboard focus onto the reset button.
  reset.addEventListener('pointerdown', event => event.preventDefault());
  // Dragging, keyboard moves and keeping its touches out of the world: the shared HUD card.
  const movable = installMovableHudCard({ panel, handle, storage: () => options.storage, positionKey: POSITION_KEY, lockKey: 'wildstat-stat-tracker-position-locked', toggle: () => {
    collapsed = !collapsed;
    try { options.storage.setItem(COLLAPSED_KEY, String(collapsed)); } catch {}
    renderCollapsed();
  } });
  window.addEventListener('pagehide', model.save);
  document.addEventListener('visibilitychange', () => { model.save(); if (!document.hidden) refresh(); });
  window.setInterval(() => { if (!document.hidden) refresh(); }, 1000);
  renderBooleanSetting(toggle, enabled);
  renderFilters();
  renderCompact();
  refresh();
}
