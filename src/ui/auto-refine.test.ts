import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { createAutoRefine } from './auto-refine';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  vi.useFakeTimers();
  const { document, window } = parseHTML('<html><body></body></html>');
  vi.stubGlobal('document', document);
  const item = { itemId: 'test', copyId: 7n };
  let level = 0, ready = true, valid = true;
  const calls: { level: number; item: typeof item; resolve: (ok: boolean) => void; reject: () => void }[] = [];
  const changed = vi.fn();
  const control = createAutoRefine({ valid: () => valid, next: () => ({ level, ready }),
    onStop: changed,
    attempt: (item, level) => new Promise<boolean>((resolve, reject) => {
      calls.push({ item, level, resolve, reject: () => reject(new Error('offline')) });
    }) });
  document.body.append(control.element); control.update(item);
  const start = control.element.querySelector<HTMLButtonElement>('.smith-auto-start')!;
  const amount = control.element.querySelector<HTMLInputElement>('input')!;
  const choose = (mode: string) => control.element.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)!.click();
  const verdict = (success: boolean, target = item) => {
    const fromLevel = level; if (success) level++;
    control.result({ ...target, fromLevel, toLevel: level, succeeded: success });
  };
  const flush = () => vi.advanceTimersByTimeAsync(0);
  return { control, item, calls, start, amount, choose, verdict, flush, window, changed,
    setLevel: (n: number) => { level = n; },
    setReady: (value: boolean) => { ready = value; },
    setValid: (value: boolean) => { valid = value; },
    summary: () => control.element.querySelector('.smith-auto-status')!.textContent! };
}

it('waits for both acknowledgement and verdict, counts failed attempts, and stops at the attempt limit', async () => {
  const s = setup(); s.amount.value = '2'; s.start.click();
  expect(s.calls).toHaveLength(1);
  s.verdict(false); await vi.advanceTimersByTimeAsync(1000);
  expect(s.calls).toHaveLength(1);
  s.calls[0].resolve(true); await s.flush();
  await vi.advanceTimersByTimeAsync(350);
  expect(s.calls).toHaveLength(2);
  expect(s.calls[1].item).toEqual(s.item);
  s.calls[1].resolve(true); await vi.advanceTimersByTimeAsync(1000);
  expect(s.calls).toHaveLength(2);
  s.verdict(true); await s.flush();
  expect(s.control.running()).toBe(false);
  expect(s.summary()).toContain('2 attempts · 1 success');
  await vi.advanceTimersByTimeAsync(1000); expect(s.calls).toHaveLength(2);
});

it('Stop stays usable during a request, records its eventual result, and sends no queued attempts', async () => {
  const s = setup(); s.choose('continuous'); s.start.click();
  expect(s.start.disabled).toBe(false);
  s.start.click();
  const immediateRefreshes = s.changed.mock.calls.length;
  s.calls[0].resolve(true); s.verdict(true); await s.flush();
  await vi.advanceTimersByTimeAsync(1000);
  expect(s.calls).toHaveLength(1);
  expect(s.summary()).toContain('1 attempt · 1 success');
  expect(s.changed.mock.calls.length).toBeGreaterThan(immediateRefreshes);
});

it.each([2, 30])('stops at target %s and advances the next target without exceeding the cap', async target => {
  const s = setup(); s.setLevel(target - 1); s.choose('target'); s.amount.value = String(target);
  s.start.click(); s.calls[0].resolve(true); s.verdict(true); await s.flush();
  expect(Number(s.amount.value)).toBe(Math.min(30, target + 1));
  expect(s.control.running()).toBe(false);
  await vi.advanceTimersByTimeAsync(1000); expect(s.calls).toHaveLength(1);
});

it('cancels the queued next attempt immediately', async () => {
  const s = setup(); s.choose('continuous'); s.start.click();
  s.calls[0].resolve(true); s.verdict(false); await s.flush();
  s.start.click(); await vi.advanceTimersByTimeAsync(1000);
  expect(s.calls).toHaveLength(1);
});

it.each(['materials', 'context', 'copy'])('stops when %s changes instead of spending on another try', async reason => {
  const s = setup(); s.choose('continuous'); s.start.click();
  s.calls[0].resolve(true); s.verdict(false); await s.flush();
  if (reason === 'materials') s.setReady(false);
  if (reason === 'context') s.setValid(false);
  if (reason === 'copy') s.control.update({ ...s.item, copyId: 8n });
  await vi.advanceTimersByTimeAsync(1000);
  expect(s.calls).toHaveLength(1); expect(s.control.running()).toBe(false);
});

it.each(['rejected', 'exception', 'timeout'])('stops on %s without retrying or counting an unconfirmed attempt', async reason => {
  const s = setup(); s.start.click();
  if (reason === 'exception') s.calls[0].reject(); else s.calls[0].resolve(reason === 'timeout');
  await vi.advanceTimersByTimeAsync(16_000);
  expect(s.control.running()).toBe(false); expect(s.calls).toHaveLength(1);
  expect(s.summary()).not.toContain('1 attempt');
});

it('ignores unrelated results and stops rather than reusing stale item levels', async () => {
  const s = setup(); s.choose('continuous'); s.start.click(); s.calls[0].resolve(true);
  s.control.result({ ...s.item, copyId: 99n, fromLevel: 0, toLevel: 1, succeeded: true });
  await vi.advanceTimersByTimeAsync(500); expect(s.calls).toHaveLength(1);
  s.control.result({ ...s.item, fromLevel: 0, toLevel: 1, succeeded: true });
  await vi.advanceTimersByTimeAsync(500);
  expect(s.calls).toHaveLength(1); expect(s.control.running()).toBe(false);
});

it('keeps manual attempt/success totals and resets the summary when the copy changes', () => {
  const s = setup(); s.control.manualStart(s.item, 0); s.verdict(false);
  s.control.manualStart(s.item, 0); s.verdict(true);
  expect(s.summary()).toContain('2 attempts · 1 success');
  expect(s.calls).toHaveLength(0);
  s.control.update({ ...s.item, copyId: 8n });
  expect(s.summary()).toBe('');
});

it('keeps only the latest manual action when item details refresh', () => {
  const s = setup(); const old = document.createElement('button'), latest = document.createElement('button');
  const hit = vi.fn(); latest.addEventListener('click', hit);
  s.control.setManualButton(old); s.control.setManualButton(latest);
  const actions = s.control.element.querySelector('.smith-refine-actions')!;
  expect(actions.children.length).toBe(2); expect(actions.contains(old)).toBe(false);
  latest.click(); expect(hit).toHaveBeenCalledOnce();
});

it('rejects invalid attempt counts and hides the numeric limit in continuous mode', () => {
  const s = setup(); s.amount.value = '1.5'; s.start.click(); expect(s.calls).toHaveLength(0);
  s.choose('target'); expect(s.amount.max).toBe('30');
  s.choose('continuous');
  expect(s.control.element.querySelector<HTMLElement>('.smith-auto-amount')!.hidden).toBe(true);
});
