import { statTrackerDps, DAMAGE_SOURCE_NAMES, DPS_BREAKDOWN_WINDOW_MS } from '../game/runtime/dps-meter';
import { formatCompactNumber } from './number-format';
import { setText } from './dom-write';

/** Optional alternate view of the existing meter; no additional sampling or timer. */
export function installStatTrackerDps(panel: HTMLElement, settings: HTMLElement, storage: Pick<Storage, 'getItem' | 'setItem'>) {
  let shownSources = '';
  const switchKey = 'wildstat-stat-tracker-dps-switch';
  const viewKey = 'wildstat-stat-tracker-dps-view';
  const bossKey = 'wildstat-stat-tracker-dps-boss-only';
  let showSwitch = false, dpsView = false;
  let bossOnly = false;
  try { bossOnly = storage.getItem(bossKey) === 'true'; } catch {}
  try { showSwitch = storage.getItem(switchKey) === 'true'; dpsView = storage.getItem(viewKey) === 'true'; } catch {}
  const switchLabel = document.createElement('label');
  switchLabel.className = 'stat-tracker-compact-option';
  const switchCheckbox = document.createElement('input');
  switchCheckbox.type = 'checkbox';
  switchCheckbox.checked = showSwitch;
  switchLabel.append(switchCheckbox, 'DPS switch');
  const compactLabel = settings.querySelector('.stat-tracker-compact-option')!;
  const modes = document.createElement('div');
  modes.className = 'stat-tracker-mode-options';
  compactLabel.before(modes);
  modes.append(compactLabel, switchLabel);
  const bossLabel = document.createElement('label');
  bossLabel.className = 'stat-tracker-compact-option';
  const bossCheckbox = document.createElement('input');
  bossCheckbox.type = 'checkbox';
  bossCheckbox.checked = bossOnly;
  bossLabel.append(bossCheckbox, 'Auto-track bosses');
  bossLabel.title = 'Track the full boss fight and keep its result until Back to 20s, Reset, or the next boss.';
  modes.after(bossLabel);
  const switchButton = document.createElement('button');
  switchButton.type = 'button';
  switchButton.className = 'stat-tracker-view-switch';
  switchButton.textContent = '⇄';
  panel.querySelector('.stat-tracker-handle')!.before(switchButton);
  const stats = panel.querySelector('table')!;
  const section = document.createElement('section');
  section.className = 'stat-tracker-dps';
  section.hidden = true;
  const button = document.createElement('div');
  button.className = 'stat-tracker-dps-toggle';
  const title = document.createElement('span');
  const total = document.createElement('span');
  button.append(title, total);
  const details = document.createElement('div');
  details.className = 'stat-tracker-dps-details';
  details.hidden = true;
  const empty = document.createElement('p');
  empty.textContent = 'Hit something to see where your damage comes from.';
  const list = document.createElement('dl');
  const footnote = document.createElement('p');
  footnote.textContent = `Last ${DPS_BREAKDOWN_WINDOW_MS / 1000}s`;
  const status = document.createElement('div');
  status.className = 'stat-tracker-dps-status';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'stat-tracker-dps-back';
  back.textContent = 'Back to 20s';
  back.hidden = true;
  back.addEventListener('click', () => { statTrackerDps.dismissBoss(); refresh(); });
  status.append(footnote, back);
  details.append(list, empty, status);
  section.append(button, details);
  panel.querySelector('footer')!.before(section);
  const statsClock = panel.querySelector<HTMLElement>('.stat-tracker-time')!;
  const dpsClock = document.createElement('span');
  dpsClock.className = 'stat-tracker-dps-time';
  panel.querySelector('footer')!.prepend(dpsClock);
  const reset = panel.querySelector<HTMLButtonElement>('.stat-tracker-reset')!;
  function refresh() {
    const collapsed = panel.classList.contains('is-collapsed');
    const swapping = showSwitch && dpsView;
    bossLabel.hidden = !showSwitch;
    statsClock.hidden = swapping;
    dpsClock.hidden = !swapping;
    reset.setAttribute('aria-label', swapping ? 'Reset DPS breakdown' : 'Reset session');
    const handle = panel.querySelector<HTMLButtonElement>('.stat-tracker-handle')!;
    const name = swapping ? 'DPS' : panel.classList.contains('is-compact') && !collapsed ? 'Stats' : 'Stat tracker';
    setText(handle, `${name} ${collapsed ? '▸' : '▾'}`);
    panel.classList.toggle('is-dps-view', swapping);
    switchButton.hidden = !showSwitch || collapsed;
    switchButton.title = swapping ? 'Stat Tracker' : 'DPS Breakdown';
    switchButton.setAttribute('aria-label', `Show ${switchButton.title}`);
    switchButton.setAttribute('aria-pressed', String(swapping));
    stats.hidden = collapsed || swapping;
    section.hidden = collapsed || !swapping;
    details.hidden = !swapping;
    setText(title, 'DPS Breakdown');
    if (section.hidden || panel.hidden) return;
    const boss = bossOnly ? statTrackerDps.autoBossSnapshot() : null;
    back.hidden = !boss || !(boss.finished || boss.interrupted);
    const elapsedMs = boss ? boss.elapsedMs : statTrackerDps.elapsedMs();
    const seconds = Math.floor(elapsedMs / 1000);
    setText(dpsClock, `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
    dpsClock.setAttribute('aria-label', boss ? 'Boss fight elapsed time' : 'DPS session elapsed time');
    const rows = boss ? boss.rows : statTrackerDps.breakdown();
    setText(footnote, boss ? boss.finished ? 'Boss dead' : boss.interrupted ? 'Interrupted' : 'Boss fight' : `Last ${DPS_BREAKDOWN_WINDOW_MS / 1000}s`);
    setText(empty, 'Hit something to see where your damage comes from.');
    const sum = rows.reduce((value, row) => value + row.perSecond, 0);
    setText(total, formatCompactNumber(sum));
    empty.hidden = rows.length > 0;
    list.hidden = footnote.hidden = rows.length === 0;
    const sources = rows.map(row => row.source).join();
    if (shownSources !== sources) {
      shownSources = sources;
      list.replaceChildren();
      for (const text of ['Source', 'DPS', 'Share']) {
        const heading = document.createElement('div'); heading.className = 'stat-tracker-dps-heading'; heading.textContent = text; list.append(heading);
      }
      for (const row of rows) {
        const line = document.createElement('div');
        line.className = 'stat-tracker-dps-row';
        const name = document.createElement('dt'); name.textContent = DAMAGE_SOURCE_NAMES[row.source];
        line.append(name, document.createElement('dd'), document.createElement('dd'));
        list.append(line);
      }
    }
    rows.forEach((row, index) => {
      const line = list.children[3 + index] as HTMLElement;
      const share = sum > 0 ? row.perSecond / sum : 0;
      setText(line.children[1], formatCompactNumber(row.perSecond));
      setText(line.children[2], `${Math.round(share * 100)}%`);
      line.style.setProperty('--share', `${share * 100}%`);
    });
  }
  function paint() {
    window.dispatchEvent(new window.CustomEvent('stat-tracker-dps-change', { detail: showSwitch }));
    refresh();
  }
  switchButton.addEventListener('click', () => {
    dpsView = !dpsView;
    try { storage.setItem(viewKey, String(dpsView)); } catch {}
    paint();
  });
  switchCheckbox.addEventListener('change', () => {
    showSwitch = switchCheckbox.checked;
    try { storage.setItem(switchKey, String(showSwitch)); } catch {}
    paint();
  });
  bossCheckbox.addEventListener('change', () => {
    bossOnly = bossCheckbox.checked;
    try { storage.setItem(bossKey, String(bossOnly)); } catch {}
    refresh();
  });
  paint();
  return { refresh, resetVisibleView() {
    if (!showSwitch || !dpsView) return false;
    if (bossOnly && statTrackerDps.autoBossSnapshot()) statTrackerDps.resetBoss();
    else statTrackerDps.resetBreakdown();
    refresh();
    return true;
  } };
}
