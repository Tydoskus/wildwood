import { formatCompactNumber } from './number-format';
import { renderBooleanSetting } from './settings';
import { createStatTrackerModel, TRACKED_STATS, type TrackerValues } from './stat-tracker-model';

const LABELS = { power: 'Power', hp: 'Max HP', damage: 'Damage', armor: 'Armor', regen: 'Regen', kills: 'Kills' };
const ENABLED_KEY = 'wildstat-native-stat-tracker-enabled';
const POSITION_KEY = 'wildstat-native-stat-tracker-position';
const COLLAPSED_KEY = 'wildstat-native-stat-tracker-collapsed';

export function installStatTracker(options: {
  read: () => { identity: string; values: TrackerValues } | null;
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
  // Zero leaves the panel as translucent as the profile HUD; one hundred is solid.
  function applyOpacity(percent: number) {
    panel.style.setProperty('--stat-tracker-opacity', String(0.6 + percent / 100 * 0.4));
  }
  const savedOpacity = Number(options.storage.getItem(OPACITY_KEY));
  opacity.valueAsNumber = Number.isFinite(savedOpacity) ? Math.min(100, Math.max(0, savedOpacity)) : 0;
  applyOpacity(opacity.valueAsNumber);
  opacity.addEventListener('input', () => {
    applyOpacity(opacity.valueAsNumber);
    try { options.storage.setItem(OPACITY_KEY, String(opacity.valueAsNumber)); } catch {}
  });
  const reset = panel.querySelector<HTMLButtonElement>('.stat-tracker-reset')!;

  const clock = panel.querySelector<HTMLElement>('.stat-tracker-time')!;
  const cells = new Map(TRACKED_STATS.map(stat => [stat, panel.querySelectorAll<HTMLTableCellElement>(`[data-stat="${stat}"] td`)]));
  let enabled = false, lastSave = 0, collapsed = false, suppressClick = false;
  let position: { x: number; y: number } | null = null;
  let drag: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
  try {
    enabled = options.storage.getItem(ENABLED_KEY) === 'true';
    collapsed = options.storage.getItem(COLLAPSED_KEY) === 'true';
    const saved = JSON.parse(options.storage.getItem(POSITION_KEY) || 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = saved;
  } catch {}
  function renderCollapsed() {
    panel.classList.toggle('is-collapsed', collapsed);
    handle.setAttribute('aria-expanded', String(!collapsed));
    handle.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} stat tracker. Drag to move; Home to reset position.`);
    handle.textContent = `Stat tracker ${collapsed ? '▸' : '▾'}`;
    for (const element of panel.querySelectorAll<HTMLElement>('table, footer, .stat-tracker-opacity')) element.hidden = collapsed;
    place();
  }
  function savePosition() {
    try { options.storage.setItem(POSITION_KEY, JSON.stringify(position)); } catch {}
  }
  function place() {
    if (panel.hidden || !position) return;
    position.x = Math.max(8, Math.min(position.x, window.innerWidth - panel.offsetWidth - 8));
    position.y = Math.max(8, Math.min(position.y, window.innerHeight - panel.offsetHeight - 8));
    panel.style.left = `${position.x}px`;
    panel.style.top = `${position.y}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }
  function home() { position = null; panel.removeAttribute('style'); savePosition(); }
  function refresh() {
    const snapshot = options.read();
    // Keep session tracking independent of visibility; hiding does not reset it.
    const result = snapshot ? model.update(snapshot.identity, snapshot.values) : null;
    const wasHidden = panel.hidden;
    panel.hidden = !enabled || !result;
    if (result && Date.now() - lastSave >= 10_000) { model.save(); lastSave = Date.now(); }
    if (panel.hidden || !result) return;
    if (wasHidden) place();
    const seconds = Math.floor(result.elapsedMs / 1000);
    clock.textContent = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    for (const row of result.rows) {
      const rowCells = cells.get(row.stat)!;
      // Three significant digits throughout keeps every column narrow. Values
      // below one keep their decimals, so regeneration does not read as zero.
      const format = (value: number) => Math.abs(value) < 1
        ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : formatCompactNumber(value);
      rowCells[0].textContent = format(row.current);
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
  // A world gesture keeps ownership when its pointer crosses this overlay.
  window.addEventListener('pointerdown', event => {
    if (event.button === 0 && (event.target as HTMLElement | null)?.tagName === 'CANVAS') {
      panel.classList.add('is-world-gesture');
    }
  }, true);
  const endWorldGesture = () => panel.classList.remove('is-world-gesture');
  window.addEventListener('pointerup', endWorldGesture, true);
  window.addEventListener('pointercancel', endWorldGesture, true);
  window.addEventListener('blur', endWorldGesture);
  // Pointer activation should not move keyboard focus onto the reset button.
  reset.addEventListener('pointerdown', event => event.preventDefault());
  // UI gestures must never become world movement or combat input.
  for (const event of ['pointerdown', 'pointermove', 'pointerup', 'click', 'dblclick']) {
    panel.addEventListener(event, e => e.stopPropagation());
  }
  for (const type of ['keydown', 'keyup'] as const) {
    panel.addEventListener(type, event => {
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) event.stopPropagation();
    });
  }
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const bounds = panel.getBoundingClientRect();
    suppressClick = false;
    drag = { id: event.pointerId, x: event.clientX - bounds.left, y: event.clientY - bounds.top,
      startX: event.clientX, startY: event.clientY, moved: false };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
    if (!drag.moved) return;
    position = { x: event.clientX - drag.x, y: event.clientY - drag.y };
    place();
  });
  const finishDrag = () => { if (drag?.moved) { suppressClick = true; savePosition(); } drag = null; };
  handle.addEventListener('pointerup', finishDrag);
  handle.addEventListener('pointercancel', () => { finishDrag(); suppressClick = true; });
  handle.addEventListener('lostpointercapture', finishDrag);
  handle.addEventListener('dblclick', home);
  handle.addEventListener('click', event => {
    if (suppressClick && event.detail !== 0) { suppressClick = false; return; }
    collapsed = !collapsed;
    try { options.storage.setItem(COLLAPSED_KEY, String(collapsed)); } catch {}
    renderCollapsed();
  });
  handle.addEventListener('keydown', event => {
    if (event.key === 'Home') { event.preventDefault(); home(); return; }
    const delta = ({ ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] } as Record<string, number[]>)[event.key];
    if (!delta) return;
    event.preventDefault();
    const bounds = panel.getBoundingClientRect();
    position = { x: bounds.left + delta[0], y: bounds.top + delta[1] };
    place(); savePosition();
  });
  window.addEventListener('resize', place);
  window.addEventListener('pagehide', model.save);
  document.addEventListener('visibilitychange', () => { model.save(); if (!document.hidden) refresh(); });
  window.setInterval(() => { if (!document.hidden) refresh(); }, 1000);
  renderBooleanSetting(toggle, enabled);
  renderCollapsed();
  refresh();
}
