import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { installMovableHudCard } from './movable-hud-card';

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); vi.unstubAllGlobals(); });

function setup(saved?: string) {
  const { window, document } = parseHTML('<html><body><canvas></canvas><section><button>Card</button><input type="range"></section></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('innerWidth', 800);
  vi.stubGlobal('innerHeight', 600);
  const panel = document.querySelector('section')!;
  const handle = document.querySelector('button')!;
  const dimensions = { width: 200, height: 40 };
  Object.defineProperties(panel, {
    offsetWidth: { get: () => dimensions.width }, offsetHeight: { get: () => dimensions.height },
  });
  panel.getBoundingClientRect = () => ({ left: Number.parseFloat(panel.style.left || '100'), top: Number.parseFloat(panel.style.top || '100'), width: dimensions.width, height: dimensions.height } as DOMRect);
  handle.setPointerCapture = vi.fn();
  const values = new Map(saved ? [['position', saved]] : []);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const toggle = vi.fn();
  const card = installMovableHudCard({ panel, handle, toggle, storage: () => storage, positionKey: 'position' });
  dispose = card.destroy;
  const event = (target: EventTarget, type: string, props: Record<string, unknown> = {}) => target.dispatchEvent(Object.assign(new window.Event(type, { bubbles: true, cancelable: true }), props));
  const pointer = (type: string, x: number, y: number) => event(handle, type, { button: 0, pointerId: 1, clientX: x, clientY: y });
  card.place();
  return { window, document, panel, handle, card, dimensions, values, toggle, event, pointer };
}

it('drags from the header, clamps to the viewport, saves, and suppresses the release click', () => {
  const s = setup();
  s.pointer('pointerdown', 110, 110);
  s.pointer('pointermove', 113, 113);
  expect(s.panel.style.left).toBeUndefined();
  s.pointer('pointermove', 900, 700);
  expect(s.panel.style.left).toBe('592px');
  expect(s.panel.style.top).toBe('552px');
  s.pointer('pointerup', 900, 700);
  expect(JSON.parse(s.values.get('position')!)).toEqual({ x: 592, y: 552 });
  s.event(s.handle, 'click', { detail: 1 });
  expect(s.toggle).not.toHaveBeenCalled();
  s.pointer('pointerdown', 602, 562);
  s.pointer('pointerup', 602, 562);
  s.event(s.handle, 'click', { detail: 1 });
  expect(s.toggle).toHaveBeenCalledOnce();
});

it('restores and reclamps a card after expansion and resize, with keyboard movement and reset', () => {
  const s = setup(JSON.stringify({ x: 550, y: 500 }));
  expect(s.panel.style.top).toBe('500px');
  s.dimensions.height = 300;
  s.card.place();
  expect(s.panel.style.top).toBe('292px');
  vi.stubGlobal('innerWidth', 400);
  s.event(s.window, 'resize');
  expect(s.panel.style.left).toBe('192px');
  s.event(s.handle, 'keydown', { key: 'ArrowLeft' });
  expect(s.panel.style.left).toBe('182px');
  s.panel.style.setProperty('--unrelated-color', 'green');
  s.event(s.handle, 'keydown', { key: 'Home' });
  expect(s.values.get('position')).toBe('null');
  expect(s.panel.style.left).toBeUndefined();
  expect(s.panel.style.getPropertyValue('--unrelated-color')).toBe('green');
});

it('keeps card input out of world handlers and removes global listeners on disposal', () => {
  const s = setup();
  const world = vi.fn();
  s.document.body.addEventListener('pointerdown', world);
  s.event(s.document.querySelector('input')!, 'pointerdown');
  expect(world).not.toHaveBeenCalled();
  s.event(s.document.querySelector('canvas')!, 'pointerdown', { button: 0 });
  expect(s.panel.classList.contains('is-world-gesture')).toBe(true);
  s.event(s.window, 'blur');
  expect(s.panel.classList.contains('is-world-gesture')).toBe(false);
  s.card.destroy();
  s.event(s.document.querySelector('canvas')!, 'pointerdown', { button: 0 });
  expect(s.panel.classList.contains('is-world-gesture')).toBe(false);
});

it('ignores corrupt stored positions', () => {
  const s = setup('{"x":"bad","y":900}');
  expect(s.panel.style.left).toBeUndefined();
  s.event(s.handle, 'click', { detail: 0 });
  expect(s.toggle).toHaveBeenCalledOnce();
});

it('keeps the card above the toolbar after a resize, and placed by its corner once moved', () => {
  const s = setup(JSON.stringify({ x: 300, y: 580 }));
  const toolbar = s.document.createElement('div'); toolbar.id = 'toolbar';
  toolbar.getBoundingClientRect = () => ({ top: 540, left: 0, width: 800, height: 60 } as DOMRect);
  s.document.body.append(toolbar);
  s.event(s.window, 'resize');
  // 540 toolbar top − 40 card − 8 margin.
  expect(s.panel.style.top).toBe('492px');
  expect(s.panel.style.transform).toBe('none');
  // Put back, the stylesheet places it again.
  s.event(s.handle, 'dblclick');
  expect(s.panel.style.transform || '').toBe('');
});

it('hands the keyboard back to the world after a click or drag on the card, so arrow keys walk again', async () => {
  const s = setup();
  const slider = s.panel.querySelector('input')!;
  let focused: Element | null = slider;
  Object.defineProperty(s.document, 'activeElement', { configurable: true, get: () => focused });
  const blur = vi.fn(() => { focused = null; });
  Object.assign(slider, { blur }); Object.assign(s.handle, { blur });
  s.event(slider, 'pointerup');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(blur).toHaveBeenCalledTimes(1);
  focused = s.handle;
  s.event(s.handle, 'pointerup');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(blur).toHaveBeenCalledTimes(2);
  // A text field being typed in keeps its focus.
  const text = s.document.createElement('input'); s.panel.append(text);
  const keep = vi.fn(); Object.assign(text, { blur: keep });
  focused = text;
  s.event(text, 'pointerup');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(keep).not.toHaveBeenCalled();
});
