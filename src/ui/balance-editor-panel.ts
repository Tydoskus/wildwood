import { BALANCE_MAPS } from '../../shared/map-balance';
import { DEFAULT_BALANCE_FACTORS, type BalanceEditorState, type BalanceSettings, type BalanceFactors, type MapBalanceSnapshot } from '../../shared/map-balance-types';
import { REGULAR_ENEMY_RESPAWN_SECONDS } from '../../shared/rules';
import { BALANCE_CURVE_LIMITS, DEFAULT_BALANCE_CURVE, curveEnemyScale, curveRewardScale, type BalanceCurve } from '../../shared/balance-curve';
import { CAMPAIGN_MAPS } from '../../shared/campaign-registry';
const curveFields: [keyof BalanceCurve, string][] = [['enemyGrowth', 'Enemies per map (×)'], ['rewardGrowth', 'Rewards per map (×)'], ['groupSize', 'Enemies per group'],
  ['damageHp', 'Map 1 damage camp health'], ['damageHit', 'Map 1 damage camp hit'], ['damageReward', 'Map 1 damage camp reward'],
  ['healthHp', 'Map 1 health camp health'], ['healthHit', 'Map 1 health camp hit'], ['healthReward', 'Map 1 health camp reward'],
  ['speedHp', 'Map 1 speed camp health'], ['speedHit', 'Map 1 speed camp hit'], ['speedReward', 'Map 1 speed camp reward'],
  ['regenHp', 'Map 1 regen camp health'], ['regenHit', 'Map 1 regen camp hit'], ['regenReward', 'Map 1 regen camp reward'], ['regenHeal', 'Map 1 regen camp heal (per second)'],
  ['armorHp', 'Map 1 armor camp health'], ['armorHit', 'Map 1 armor camp hit'], ['armorReward', 'Map 1 armor camp reward'], ['armorArmor', 'Map 1 armor camp armor'],
  ['bossHp', 'Map 1 boss health'], ['bossHit', 'Map 1 boss heaviest hit'], ['bossRegen', 'Boss heal per second (share of health)'],
  ['eliteHealth', 'Elite health and reward (×)'], ['eliteHit', 'Elite hit (×)']];
export type BalanceEditorDependencies = {
  load: () => Promise<BalanceEditorState>;
  preview: (map: string, settings: BalanceSettings) => Promise<MapBalanceSnapshot>;
  save: (revision: number, settings: BalanceSettings) => Promise<void>;
  restore: (expected: number, revision: number) => Promise<void>;
};
// The curve sets every enemy's and boss's health, damage and rewards; these
// per-map controls are what it leaves to each map.
const fields: [keyof BalanceFactors, string][] = [['enemySpeed', 'Move speed'], ['enemyRespawn', 'Respawn time'], ['enemyDrops', 'Item drops'], ['bossRespawn', 'Respawn time'], ['bossRegen', 'Regeneration']];
const format = (n: number) => Intl.NumberFormat('en', { notation: n >= 10000 ? 'compact' : 'standard', maximumSignificantDigits: 4 }).format(n);
export function createBalanceEditorPanel(root: HTMLElement, api: BalanceEditorDependencies) {
  root.classList.add('balance-editor');
  root.innerHTML = `<div class="balance-heading"><div><h2>Map balancing</h2><p>Changes apply on the next map visit.</p></div><span class="balance-version">Loading…</span></div>
    <div class="balance-map-row"><label>Map<select class="balance-map" aria-label="Balance map"></select></label><label class="balance-depth" hidden>Endless map<input type="number" min="1" max="1001" step="1" value="1" aria-label="Endless preview map"></label></div>
    <p class="balance-hint">1× is the base value · 0.5× is half · 2× is double</p><div class="balance-groups"></div>
    <section class="balance-formula"><h3>Map curve</h3><p>Map 1 is set by hand below. Every map after multiplies its enemies by the enemy growth and its rewards by the reward growth. Enemies grow faster, so each map asks for more kills. Endless carries on the same way.</p><div class="balance-formula-inputs"></div></section>
    <div class="balance-preview-title"><h3>Resulting stats</h3><span class="balance-preview-state"></span></div><div class="balance-preview" aria-live="polite"></div>
    <p class="balance-status" role="status"></p><div class="balance-actions"><button class="balance-reset" type="button">Reset this map</button><button class="balance-apply" type="button" disabled>Apply changes</button></div><button class="balance-restore" type="button" disabled>Restore previous balance</button>`;
  const el = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const select = el<HTMLSelectElement>('.balance-map'), depth = el<HTMLInputElement>('.balance-depth input');
  const apply = el<HTMLButtonElement>('.balance-apply'), restore = el<HTMLButtonElement>('.balance-restore');
  const status = el('.balance-status'), preview = el('.balance-preview'), version = el('.balance-version');
  let state: BalanceEditorState | null = null, draft: BalanceSettings | null = null, generation = 0, timer: ReturnType<typeof setTimeout> | undefined, busy = false;
  for (const [id, name] of BALANCE_MAPS) { const option = document.createElement('option'); option.value = id; option.textContent = name; select.append(option); }
  const inputs = new Map<keyof BalanceFactors, HTMLInputElement>();
  for (const category of ['Enemies', 'Boss']) {
    const section = document.createElement('section'); section.className = 'balance-group';
    const title = document.createElement('h3'); title.textContent = category; section.append(title);
    for (const [key, labelText] of fields.filter(([key]) => key.startsWith(category === 'Boss' ? 'boss' : 'enemy'))) {
      const label = document.createElement('label'); label.append(labelText);
      const control = document.createElement('span'); control.className = 'balance-number';
      const input = document.createElement('input'); input.type = 'number'; input.min = key === 'enemyDrops' || key === 'bossRegen' ? '0' : '.01'; input.max = key === 'enemySpeed' ? '3' : '100'; input.step = 'any'; input.setAttribute('aria-label', `${category} ${labelText} multiplier`);
      control.append(input, '×'); label.append(control); section.append(label); inputs.set(key, input);
      input.addEventListener('input', () => { if (draft) { draft.maps[select.value][key] = input.valueAsNumber; schedulePreview(); } });
    }
    el('.balance-groups').append(section);
  }
  // The map curve's knobs.
  const formulaInputs = new Map<keyof BalanceCurve, HTMLInputElement>();
  for (const [key, labelText] of curveFields) {
    const label = document.createElement('label'); label.append(labelText);
    const input = document.createElement('input'); input.type = 'number'; input.step = 'any'; input.setAttribute('aria-label', labelText);
    [input.min, input.max] = BALANCE_CURVE_LIMITS[key].map(String);
    label.append(input); el('.balance-formula-inputs').append(label); formulaInputs.set(key, input);
    input.addEventListener('input', () => { if (draft) { draft.curve = { ...DEFAULT_BALANCE_CURVE, ...draft.curve, [key]: input.valueAsNumber }; schedulePreview(); } });
  }
  function changed() { return !!state && JSON.stringify(state.settings) !== JSON.stringify(draft); }
  function valid() { return [...inputs.values(), ...formulaInputs.values()].every(input => input.value !== '' && input.checkValidity()); }
  function fill() {
    if (!draft) return;
    for (const [key, input] of inputs) input.value = String(draft.maps[select.value][key]);
    for (const [key, input] of formulaInputs) input.value = String((draft.curve ?? DEFAULT_BALANCE_CURVE)[key]);
    el('.balance-depth').hidden = select.value !== 'endless';
    restore.disabled = busy || state?.previousRevision == null;
    schedulePreview();
  }
  function schedulePreview() {
    clearTimeout(timer); ++generation; apply.disabled = true;
    version.textContent = `${changed() ? 'Unsaved · ' : 'Live · '}v${state?.revision ?? 0}`;
    timer = setTimeout(() => void showPreview(), 300);
  }
  async function showPreview() {
    if (!draft || !valid() || !depth.checkValidity()) { el('.balance-preview-state').textContent = 'Check values'; return; }
    const attempt = ++generation;
    el('.balance-preview-state').textContent = 'Loading…';
    try {
      const value = await api.preview(select.value === 'endless' ? `endless_${depth.valueAsNumber}` : select.value, draft);
      if (attempt !== generation) return;
      preview.replaceChildren();
      const table = document.createElement('table');
      table.innerHTML = '<thead><tr><th>Enemy</th><th>Health</th><th>Damage</th><th>Reward</th></tr></thead>';
      const body = document.createElement('tbody');
      const rows = Object.entries(Object.keys(value.lanes).length ? value.lanes : value.enemies);
      for (const [name, row] of rows) addRow(name, row.hp, row.damage, `${format(row.reward.amount)} ${row.reward.type === 'speed' ? 'attack speed' : row.reward.type}`);
      if (value.boss) addRow('Boss', value.boss.hp, value.boss.damage || Math.max(...Object.values(value.boss.attacks)), Object.entries(value.boss.rewards).map(([type, n]) => `${format(n)} ${type}`).join(' · '));
      function addRow(name: string, hp: number, damage: number, reward: string) {
        const tr = document.createElement('tr');
        for (const text of [name, format(hp), format(damage), reward]) { const td = document.createElement('td'); td.textContent = text; tr.append(td); }
        body.append(tr);
      }
      table.append(body); preview.append(table);
      const details = document.createElement('p');
      details.textContent = `Enemy respawn: ${format(value.regularRespawnSeconds ?? REGULAR_ENEMY_RESPAWN_SECONDS)}s` + (value.boss ? ` · Boss respawn: ${format(value.boss.respawnSeconds)}s · Boss regen: ${format((value.boss.regenFraction ?? .001) * 100)}% HP/s` : '');
      preview.append(details);
      const y = select.value === 'endless' ? CAMPAIGN_MAPS.length + depth.valueAsNumber : CAMPAIGN_MAPS.findIndex(map => map.id === select.value) + 1;
      const line = document.createElement('p'); const curve = draft.curve ?? DEFAULT_BALANCE_CURVE;
      line.textContent = `Map curve · map ${y}: enemies ${format(curveEnemyScale(y, curve))}× map 1, rewards ${format(curveRewardScale(y, curve))}× map 1`;
      preview.append(line);
      if (value.loot?.length) { const loot = document.createElement('p'); loot.textContent = value.loot.map(drop => `${drop.itemId.replace(/_/g, ' ')}: ${format(drop.wins / drop.outcomes * 100)}%`).join(' · '); preview.append(loot); }
       el('.balance-preview-state').textContent = 'Server preview';
      apply.disabled = busy || !changed();
    } catch (error) { if (attempt === generation) { el('.balance-preview-state').textContent = 'Preview unavailable'; status.textContent = message(error); } }
  }
  const message = (error: unknown) => error instanceof Error ? error.message : 'Could not connect. Try again.';
  async function load() {
    try { state = await api.load(); draft = JSON.parse(JSON.stringify(state.settings)); fill(); }
    catch (error) { status.textContent = message(error); version.textContent = 'Not connected'; }
  }
  async function submit(action: () => Promise<void>, success: string) {
    if (busy) return; busy = true; apply.disabled = restore.disabled = true;
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach(input => input.disabled = true);
    status.textContent = 'Saving…';
    try { await action(); await load(); status.textContent = success; }
    catch (error) { status.textContent = message(error); }
    finally { busy = false; root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach(input => input.disabled = false); restore.disabled = state?.previousRevision == null; schedulePreview(); }
  }
  select.addEventListener('change', fill); depth.addEventListener('input', schedulePreview);
  apply.addEventListener('click', () => { if (state && draft && valid()) void submit(() => api.save(state!.revision, draft!), 'Saved. New map visits now use this balance.'); });
  restore.addEventListener('click', () => { if (state?.previousRevision != null) void submit(() => api.restore(state!.revision, state!.previousRevision!), 'Previous balance restored for new map visits.'); });
  el('.balance-reset').addEventListener('click', () => { if (draft && !busy) { draft.maps[select.value] = { ...DEFAULT_BALANCE_FACTORS }; fill(); } });
  return { open: load, close() { generation++; clearTimeout(timer); } };
}
