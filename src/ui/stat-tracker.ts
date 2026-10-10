import { formatCompactNumber } from './number-format';
import { installMovableHudCard } from './movable-hud-card';
import { renderBooleanSetting } from './settings';
import { createStatTrackerModel, TRACKED_STATS, type TrackerBuild, type TrackerValues } from './stat-tracker-model';

const LABELS = { power: 'Power', hp: 'Max HP', damage: 'Damage', armor: 'Armor', regen: 'Regen', attackSpeed: 'Atk Speed', critDamage: 'Crit Dmg', kills: 'Kills' };
const ENABLED_KEY = 'wildstat-native-stat-tracker-enabled';
const POSITION_KEY = 'wildstat-native-stat-tracker-position';
const COLLAPSED_KEY = 'wildstat-native-stat-tracker-collapsed';

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
  panel.innerHTML = `<header><button type="button" class="stat-tracker-handle" aria-label="Move stat tracker. Use arrow keys to move; Home to reset position.">Stat tracker</button></header><table><thead><tr><th scope="col">Stat</th><th scope="col">Current</th><th scope="col">Gain</th><th scope="col">/ Hour</th></tr></thead><tbody>${TRACKED_STATS.map(key => `<tr data-stat="${key}"><th scope="row">${LABELS[key]}</th><td></td><td></td><td></td></tr>`).join('')}</tbody></table><footer><span class="stat-tracker-time"></span><button type="button" class="stat-tracker-reset" aria-label="Reset session">Reset</button></footer><label class="stat-tracker-opacity"><span class="visually-hidden">Panel opacity</span><input type="range" min="0" max="100" step="1" aria-label="Panel opacity"></label>`;
  document.getElementById('hud')!.append(panel);
  const handle = panel.querySelector<HTMLButtonElement>('.stat-tracker-handle')!;
  const OPACITY_KEY = 'wildstat-stat-tracker-opacity';
  const opacity = panel.querySelector<HTMLInputElement>('.stat-tracker-opacity input')!;
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

  const clock = panel.querySelector<HTMLElement>('.stat-tracker-time')!;
  const cells = new Map(TRACKED_STATS.map(stat => [stat, panel.querySelectorAll<HTMLTableCellElement>(`[data-stat="${stat}"] td`)]));
  let enabled = false, lastSave = 0, collapsed = false;
  try {
    enabled = options.storage.getItem(ENABLED_KEY) === 'true';
    collapsed = options.storage.getItem(COLLAPSED_KEY) === 'true';
  } catch {}
  function renderCollapsed() {
    panel.classList.toggle('is-collapsed', collapsed);
    handle.setAttribute('aria-expanded', String(!collapsed));
    handle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} stat tracker. Drag to move; Home to reset position.`);
    handle.textContent = `Stat tracker ${collapsed ? '▸' : '▾'}`;
    for (const element of panel.querySelectorAll<HTMLElement>('table, footer, .stat-tracker-opacity')) element.hidden = collapsed;
    movable.place();
  }
  function refresh() {
    const snapshot = options.read();
    // Keep session tracking independent of visibility; hiding does not reset it.
    const result = snapshot ? model.update(snapshot.identity, snapshot.values, snapshot.prestigeLevel, snapshot.build) : null;
    const wasHidden = panel.hidden;
    panel.hidden = !enabled || !result;
    if (result && Date.now() - lastSave >= 10_000) { model.save(); lastSave = Date.now(); }
    if (panel.hidden || !result) return;
    if (wasHidden) movable.place();
    const seconds = Math.floor(result.elapsedMs / 1000);
    clock.textContent = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    for (const row of result.rows) {
      const rowCells = cells.get(row.stat)!;
      // Three significant digits throughout keeps every column narrow. Values
      // below one keep their decimals, so regeneration does not read as zero.
      const format = (value: number) => Math.abs(value) < 1
        ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : formatCompactNumber(value);
      const detail = snapshot?.details?.[row.stat];
      rowCells[0].textContent = detail ? `${format(row.current)} (${detail})` : format(row.current);
      [row.gain, row.perHour].forEach((value, index) => {
        rowCells[index + 1].textContent = `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;
        rowCells[index + 1].className = value > 0 ? 'positive' : value < 0 ? 'negative' : '';
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

  reset.addEventListener('click', () => { if (options.read()) { refresh(); model.reset(); refresh(); } });
  // Pointer activation should not move keyboard focus onto the reset button.
  reset.addEventListener('pointerdown', event => event.preventDefault());
  // Dragging, keyboard moves and keeping its touches out of the world: the shared HUD card.
  const movable = installMovableHudCard({ panel, handle, storage: () => options.storage, positionKey: POSITION_KEY, toggle: () => {
    collapsed = !collapsed;
    try { options.storage.setItem(COLLAPSED_KEY, String(collapsed)); } catch {}
    renderCollapsed();
  } });
  window.addEventListener('pagehide', model.save);
  document.addEventListener('visibilitychange', () => { model.save(); if (!document.hidden) refresh(); });
  window.setInterval(() => { if (!document.hidden) refresh(); }, 1000);
  renderBooleanSetting(toggle, enabled);
  renderCollapsed();
  refresh();
}
