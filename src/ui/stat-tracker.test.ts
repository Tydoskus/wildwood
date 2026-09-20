import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { installStatTracker } from './stat-tracker';

afterEach(() => vi.unstubAllGlobals());

function setup(collapsed = false) {
  const { document, Event } = parseHTML('<div id="hud"></div><button id="statTrackerToggle"></button>');
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', { innerWidth: 800, innerHeight: 600, addEventListener: vi.fn(), setInterval: vi.fn() });
  const saved = new Map([['wildstat-native-stat-tracker-enabled', 'true'], ['wildstat-native-stat-tracker-collapsed', String(collapsed)]]);
  installStatTracker({ storage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => { saved.set(key, value); } },
    read: () => ({ identity: 'player', values: { power: 10, hp: 10, damage: 10, armor: 10, regen: 10, kills: 10 } }) });
  const panel = document.querySelector('.stat-tracker')!;
  const handle = panel.querySelector('button')!;
  Object.assign(handle, { setPointerCapture: vi.fn() });
  Object.assign(panel, { getBoundingClientRect: () => ({ left: 20, top: 20 }), offsetWidth: 300, offsetHeight: 250 });
  const fire = (type: string, props = {}) => handle.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), props));
  const fireWindow = (type: string, props = {}) => {
    for (const [name, listener] of vi.mocked(window.addEventListener).mock.calls) {
      if (name === type) (listener as (event: unknown) => void)(props);
    }
  };
  return { panel, handle, saved, fire, fireWindow, document, Event };
}

it('collapses and expands with a tap, preserving the preference', () => {
  const { panel, handle, saved, fire } = setup();
  fire('pointerdown', { button: 0, pointerId: 1, clientX: 25, clientY: 25 });
  fire('pointermove', { pointerId: 1, clientX: 27, clientY: 27 });
  fire('pointerup');
  fire('click', { detail: 1 });
  expect(handle.getAttribute('aria-expanded')).toBe('false');
  expect(panel.querySelector('table')!.hidden).toBe(true);
  expect(saved.get('wildstat-native-stat-tracker-collapsed')).toBe('true');
  fire('click', { detail: 0 });
  expect(handle.getAttribute('aria-expanded')).toBe('true');
  expect(panel.querySelector('table')!.hidden).toBe(false);
});

it('lets world gestures pass through until release, cancellation or blur', () => {
  const { panel, fireWindow } = setup();
  for (const end of ['pointerup', 'pointercancel', 'blur']) {
    fireWindow('pointerdown', { button: 0, target: { tagName: 'CANVAS' } });
    expect(panel.classList.contains('is-world-gesture')).toBe(true);
    fireWindow(end);
    expect(panel.classList.contains('is-world-gesture')).toBe(false);
  }
  fireWindow('pointerdown', { button: 0, target: panel });
  expect(panel.classList.contains('is-world-gesture')).toBe(false);
});

it('keeps reset pointer activation from taking focus and allows WASD through', () => {
  const { panel, document, Event } = setup();
  const reset = panel.querySelector('.stat-tracker-reset')!;
  const press = new Event('pointerdown', { bubbles: true, cancelable: true });
  reset.dispatchEvent(press);
  expect(press.defaultPrevented).toBe(true);
  for (const type of ['keydown', 'keyup']) {
    const listener = vi.fn();
    document.addEventListener(type, listener);
    reset.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { code: 'KeyW' }));
    expect(listener).toHaveBeenCalledTimes(1);
    reset.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { code: 'Space' }));
    expect(listener).toHaveBeenCalledTimes(1);
  }
});

it('restores collapse and does not expand after dragging', () => {
  const { handle, saved, fire } = setup(true);
  expect(handle.getAttribute('aria-expanded')).toBe('false');
  fire('pointerdown', { button: 0, pointerId: 1, clientX: 25, clientY: 25 });
  fire('pointermove', { pointerId: 1, clientX: 100, clientY: 100 });
  fire('pointerup');
  fire('lostpointercapture');
  fire('click', { detail: 1 });
  expect(handle.getAttribute('aria-expanded')).toBe('false');
  expect(JSON.parse(saved.get('wildstat-native-stat-tracker-position')!)).toEqual({ x: 95, y: 95 });
});
