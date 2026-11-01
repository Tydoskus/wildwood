import { REFINE_MAX } from '../../shared/refine';

type Item = { itemId: string; copyId: bigint };
type Verdict = Item & { fromLevel: number; toLevel: number; succeeded: boolean };
type Mode = 'attempts' | 'target' | 'continuous';

/** One server-confirmed try at a time. Stopping never sends a replacement or retry. */
export function createAutoRefine(deps: {
  valid: (item: Item) => boolean;
  next: (item: Item) => { level: number; ready: boolean };
  attempt: (item: Item, level: number) => Promise<boolean>;
  onStop?: () => void;
}) {
  const element = document.createElement('div');
  element.className = 'smith-auto-refine';
  element.innerHTML = `<div class="smith-auto-mode-field"><span>Auto refine</span><details class="smith-auto-mode"><summary aria-label="Auto refine mode"><span>Attempts</span></summary><div class="smith-auto-mode-list" role="group" aria-label="Auto refine mode"><button type="button" data-mode="attempts" aria-pressed="true">Attempts</button><button type="button" data-mode="target" aria-pressed="false">Target level</button><button type="button" data-mode="continuous" aria-pressed="false">Continuous</button></div></details></div>`
    + `<label class="smith-auto-amount"><span>Attempts</span><input type="number" min="1" max="10000" step="1" value="10" inputmode="numeric"></label>`
    + `<div class="smith-refine-actions"><button type="button" class="farm-start smith-refine smith-auto-start">Auto Refine</button></div><span class="smith-auto-status" role="status" aria-live="polite"></span>`;
  const mode = element.querySelector<HTMLDetailsElement>('.smith-auto-mode')!;
  const modeSummary = mode.querySelector('summary')!;
  const modeButtons = [...mode.querySelectorAll<HTMLButtonElement>('button[data-mode]')];
  let modeValue: Mode = 'attempts';
  const amount = element.querySelector('input')!;
  const amountLabel = element.querySelector<HTMLElement>('.smith-auto-amount')!;
  const amountName = amountLabel.querySelector('span')!;
  const button = element.querySelector<HTMLButtonElement>('.smith-auto-start')!;
  const status = element.querySelector<HTMLElement>('.smith-auto-status')!;
  element.prepend(status);
  let selected: Item | null = null, running = false, busy = false, generation = 0, count = 0, successes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { item: Item; level: number; resolve: (result: Verdict | null) => void } | null = null;
  let manualPending: { item: Item; level: number } | null = null;
  let manualSession = false;
  let stoppedMessage = 'Stopped';
  let manualDeadline: ReturnType<typeof setTimeout> | undefined;
  const same = (a: Item, b: Item) => a.itemId === b.itemId && a.copyId === b.copyId;
  const totals = () => `${count} ${count === 1 ? 'attempt' : 'attempts'} · ${successes} ${successes === 1 ? 'success' : 'successes'}`;
  function paint() {
    amount.disabled = running || busy;
    modeSummary.setAttribute('aria-disabled', String(running || busy));
    for (const option of modeButtons) option.disabled = running || busy;
    if (running || busy) mode.removeAttribute('open');
    button.textContent = running ? 'Stop' : 'Auto Refine';
    button.classList.toggle('is-running', running);
    button.disabled = !running && (busy || Boolean(manualPending) || !selected || !deps.valid(selected) || !deps.next(selected).ready);
  }
  function stop(message = 'Stopped') {
    running = false; generation++;
    clearTimeout(timer); timer = undefined;
    stoppedMessage = message;
    status.textContent = count > 0 ? `${message} · ${totals()}` : message;
    paint();
    deps.onStop?.();
  }
  async function step(item: Item, token: number, runMode: Mode, limit: number, expectedLevel?: number) {
    if (!running || token !== generation) return;
    if (!deps.valid(item)) { stop('Stopped'); return; }
    const next = deps.next(item);
    if (expectedLevel !== undefined && next.level !== expectedLevel) { stop('Item changed; stopped'); return; }
    if (runMode === 'target' && next.level >= limit) { stop('Target reached'); return; }
    if (next.level >= REFINE_MAX) { stop('Fully refined'); return; }
    if (!next.ready) { stop('Not enough materials'); return; }
    busy = true; paint();
    const result = new Promise<Verdict | null>(resolve => { pending = { item, level: next.level, resolve }; });
    const waiting = pending;
    const deadline = setTimeout(() => {
      if (pending !== waiting) return;
      pending?.resolve(null); pending = null;
      if (token === generation) stop('No result received; stopped');
    }, 15_000);
    try {
      const sent = deps.attempt(item, next.level).then(ok => {
        if (!ok && token === generation) {
          pending?.resolve(null); pending = null;
          stop('Refine failed to start');
        }
        return ok;
      });
      const [ok, verdict] = await Promise.all([sent, result]);
      if (!running || token !== generation || !ok || !verdict) return;
      status.textContent = `${totals()} · ★${verdict.toLevel}`;
      if (runMode === 'attempts' && count >= limit) { stop('Finished'); return; }
      if (runMode === 'target' && verdict.toLevel >= limit) {
        amount.value = String(Math.min(REFINE_MAX, verdict.toLevel + 1));
        stop('Target reached'); return;
      }
      // Yield for updated ore/level rows and a responsive Stop button between requests.
      timer = setTimeout(() => { void step(item, token, runMode, limit, verdict.toLevel); }, 350);
    } catch {
      if (token === generation) stop('Refine error; stopped');
    } finally {
      clearTimeout(deadline);
      busy = false;
      if (pending === waiting) pending = null;
      paint();
      if (!running) deps.onStop?.();
    }
  }
  modeSummary.addEventListener('click', event => { if (running || busy) event.preventDefault(); });
  function chooseMode(option: HTMLButtonElement) {
    if (running || busy) return;
    modeValue = option.dataset.mode as Mode;
    modeSummary.querySelector('span')!.textContent = option.textContent;
    for (const each of modeButtons) each.setAttribute('aria-pressed', String(each === option));
    amountLabel.hidden = modeValue === 'continuous';
    amountName.textContent = modeValue === 'target' ? 'Target ★' : 'Attempts';
    amount.max = modeValue === 'target' ? String(REFINE_MAX) : '10000';
    amount.value = modeValue === 'target' ? String(Math.min(REFINE_MAX, (selected ? deps.next(selected).level : 0) + 1)) : '10';
    mode.removeAttribute('open'); modeSummary.focus();
  }
  for (const option of modeButtons) {
    // Commit pointer selection before blur can hide the options ahead of click.
    option.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      chooseMode(option);
    });
    option.addEventListener('click', () => chooseMode(option));
  }
  mode.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mode.hasAttribute('open')) {
      event.preventDefault(); event.stopPropagation(); mode.removeAttribute('open'); modeSummary.focus();
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !running && !busy) {
      event.preventDefault(); mode.setAttribute('open', '');
      const index = modeButtons.indexOf(document.activeElement as HTMLButtonElement);
      const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : modeButtons.length - 1)
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + modeButtons.length) % modeButtons.length;
      modeButtons[next].focus();
    }
  });
  mode.addEventListener('focusout', () => { queueMicrotask(() => {
    if (!mode.contains(document.activeElement)) mode.removeAttribute('open');
  }); });
  button.addEventListener('click', () => {
    if (running) { stop(); return; }
    if (busy || manualPending || !selected || !deps.valid(selected)) return;
    const limit = Number(amount.value), runMode = modeValue;
    if (runMode !== 'continuous' && (!Number.isInteger(limit) || limit < 1 || limit > Number(amount.max))) {
      status.textContent = `Enter a whole number from 1 to ${amount.max}`; return;
    }
    running = true; manualSession = false; count = 0; successes = 0; const token = ++generation;
    status.textContent = 'Starting…'; paint();
    void step({ ...selected }, token, runMode, limit);
  });
  return {
    element, stop,
    manualStart(item: Item, level: number) {
      if (!manualSession) { count = 0; successes = 0; }
      manualSession = true;
      manualPending = { item: { ...item }, level };
      status.textContent = count ? `Refining… · ${totals()}` : 'Refining…';
      clearTimeout(manualDeadline);
      manualDeadline = setTimeout(() => {
        manualPending = null; status.textContent = `No result received · ${totals()}`; paint(); deps.onStop?.();
      }, 15_000);
      paint();
    },
    manualError(message: string) {
      clearTimeout(manualDeadline); manualPending = null;
      status.textContent = count ? `${message} · ${totals()}` : message;
      paint();
    },
    setManualButton(manual: HTMLButtonElement) {
      button.parentElement!.replaceChildren(manual, button);
    },
    update(item: Item | undefined) {
      if (running && (!item || !selected || !same(item, selected) || !deps.valid(item))) stop();
      if (item && selected && !same(item, selected)) {
        count = 0; successes = 0; manualSession = false; status.textContent = '';
      }
      selected = item ?? null; paint();
    },
    result(verdict: Verdict) {
      if (manualPending && same(manualPending.item, verdict) && manualPending.level === verdict.fromLevel) {
        clearTimeout(manualDeadline); manualPending = null;
        if (selected && same(selected, verdict)) {
          count++; if (verdict.succeeded) successes++;
          status.textContent = `${totals()} · ★${verdict.toLevel}`;
        }
        paint();
      }
      if (pending && same(pending.item, verdict) && pending.level === verdict.fromLevel) {
        if (selected && same(selected, verdict)) {
          count++; if (verdict.succeeded) successes++;
          if (!running) status.textContent = `${stoppedMessage} · ${totals()}`;
        }
        pending.resolve(verdict); pending = null;
      }
    },
    running: () => running || busy || Boolean(manualPending),
  };
}
