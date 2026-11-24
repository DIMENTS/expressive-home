// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Slot } from '../../../src/ui/model/drop';
import { attachDrag, DRAG_THRESHOLD_PX, TOUCH_HOLD_MS, type DragHost, type DropResult } from '../../../src/ui/parts/drag';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); document.body.replaceChildren(); });

const slot = (id: string, left: number, top: number, width: number, height: number): Slot => ({ id, left, top, width, height });

/** A page of two columns: left "lights" with three tiles, right "water" with one; each section has a grip. */
function page() {
  document.body.innerHTML = `<div id="root">
    <div data-section-id="lights"><button data-grip id="grip-lights">x</button><div data-tile-id="a" id="a"><i data-grip id="grip-a"></i><b id="in-a">A</b></div><div data-tile-id="b" id="b"></div><div data-tile-id="c" id="c"></div></div>
    <div data-section-id="water"><button data-grip id="grip-water">x</button><div data-tile-id="w" id="w"></div></div>
    <p id="elsewhere"></p>
  </div>`;
  const root = document.getElementById('root')!;
  const sections = [
    { id: 'lights', rect: slot('lights', 0, 0, 400, 300), tiles: [slot('a', 0, 50, 100, 80), slot('b', 110, 50, 100, 80), slot('c', 220, 50, 100, 80)] },
    { id: 'water', rect: slot('water', 420, 0, 400, 300), tiles: [slot('w', 420, 50, 100, 80)] },
  ];
  const columns = [
    { column: 'left' as const, rect: slot('left', 0, 0, 400, 300), sections: [slot('lights', 0, 0, 400, 300)] },
    { column: 'right' as const, rect: slot('right', 420, 0, 400, 300), sections: [slot('water', 420, 0, 400, 300)] },
  ];
  const previews: (DropResult | null)[] = [];
  const copies: HTMLElement[] = [];
  const host: DragHost = {
    measure: () => ({ sections: sections.map((s) => ({ ...s, tiles: [...s.tiles] })), columns }),
    preview: (target) => previews.push(target),
    lift: (_kind, id) => { const copy = document.createElement('div'); copy.id = `copy-${id}`; document.body.append(copy); copies.push(copy); return copy; },
  };
  const drops: DropResult[] = [];
  const detach = attachDrag(root, host, (result) => drops.push(result));
  return { root, sections, previews, copies, drops, detach };
}

const at = (id: string) => document.getElementById(id)!;
function pointer(target: EventTarget, type: string, x: number, y: number, init: PointerEventInit = {}) {
  const event = new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse', clientX: x, clientY: y, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

test('a mouse drag starts after six pixels and drops a tile in another section', () => {
  expect(DRAG_THRESHOLD_PX).toBe(6);
  const p = page();
  pointer(at('in-a'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 55, 80);
  expect(p.copies).toHaveLength(0);
  pointer(window, 'pointermove', 60, 80);
  expect(p.copies).toHaveLength(1);
  pointer(window, 'pointermove', 430, 100);
  expect(p.previews.at(-1)).toEqual({ kind: 'tile', tileId: 'a', toSectionId: 'water', index: 0 });
  pointer(window, 'pointermove', 600, 100);
  pointer(window, 'pointerup', 600, 100);
  expect(p.drops).toEqual([{ kind: 'tile', tileId: 'a', toSectionId: 'water', index: 1 }]);
  expect(p.previews.at(-1)).toBeNull();
  expect(document.getElementById('copy-a')).toBeNull();
});

test('the copy follows the pointer', () => {
  const p = page();
  pointer(at('a'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 70, 90);
  expect([p.copies[0]!.style.getPropertyValue('--_dx'), p.copies[0]!.style.getPropertyValue('--_dy')]).toEqual(['20px', '10px']);
  pointer(window, 'pointermove', 30, 85);
  expect([p.copies[0]!.style.getPropertyValue('--_dx'), p.copies[0]!.style.getPropertyValue('--_dy')]).toEqual(['-20px', '5px']);
});

test('within its own section the place counts the other tiles', () => {
  const p = page();
  pointer(at('a'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 200, 80);
  expect(p.previews.at(-1)).toEqual({ kind: 'tile', tileId: 'a', toSectionId: 'lights', index: 1 });
  pointer(window, 'pointermove', 390, 80);
  pointer(window, 'pointerup', 390, 80);
  expect(p.drops).toEqual([{ kind: 'tile', tileId: 'a', toSectionId: 'lights', index: 2 }]);
});

test('between two sections the last place stays', () => {
  const p = page();
  pointer(at('a'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 430, 80);
  pointer(window, 'pointermove', 410, 900);
  expect(p.previews.at(-1)).toMatchObject({ toSectionId: 'water', index: 0 });
  pointer(window, 'pointerup', 410, 900);
  expect(p.drops).toEqual([{ kind: 'tile', tileId: 'a', toSectionId: 'water', index: 0 }]);
});

test('a click is a click: no drag, nothing dropped', () => {
  const p = page();
  const clicks: string[] = [];
  at('a').addEventListener('click', () => clicks.push('a'));
  pointer(at('a'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 52, 81);
  pointer(window, 'pointerup', 52, 81);
  at('a').click();
  expect([p.drops, p.copies, clicks]).toEqual([[], [], ['a']]);
});

test('the click that ends a drag is swallowed, the next one is not', () => {
  page();
  const clicks: string[] = [];
  at('a').addEventListener('click', () => clicks.push('a'));
  pointer(at('a'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 90, 80);
  pointer(window, 'pointerup', 90, 80);
  at('a').click();
  expect(clicks).toEqual([]);
  vi.advanceTimersByTime(1);
  at('a').click();
  expect(clicks).toEqual(['a']);
});

test('another button, a second finger or something that is no tile starts nothing', () => {
  const p = page();
  pointer(at('a'), 'pointerdown', 50, 80, { button: 2 });
  pointer(window, 'pointermove', 300, 80);
  pointer(at('a'), 'pointerdown', 50, 80, { isPrimary: false, pointerId: 2 });
  pointer(window, 'pointermove', 300, 80, { pointerId: 2 });
  pointer(at('elsewhere'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 300, 80);
  expect(p.copies).toHaveLength(0);
});

test('a touch drag starts only after holding still; moving first scrolls', () => {
  expect(TOUCH_HOLD_MS).toBe(250);
  const p = page();
  const touch = { pointerType: 'touch' };
  pointer(at('a'), 'pointerdown', 50, 80, touch);
  pointer(window, 'pointermove', 50, 100, touch);
  vi.advanceTimersByTime(TOUCH_HOLD_MS * 2);
  pointer(window, 'pointermove', 430, 100, touch);
  expect(p.copies).toHaveLength(0);
  pointer(window, 'pointerup', 430, 100, touch);
  const scroll = new Event('touchmove', { bubbles: true, cancelable: true });
  p.root.dispatchEvent(scroll);
  expect(scroll.defaultPrevented).toBe(false);

  pointer(at('a'), 'pointerdown', 50, 80, touch);
  pointer(window, 'pointermove', 52, 82, touch);
  vi.advanceTimersByTime(TOUCH_HOLD_MS - 1);
  expect(p.copies).toHaveLength(0);
  vi.advanceTimersByTime(1);
  expect(p.copies).toHaveLength(1);
  // from now on the finger drags and the page does not scroll
  const drag = new Event('touchmove', { bubbles: true, cancelable: true });
  p.root.dispatchEvent(drag);
  expect(drag.defaultPrevented).toBe(true);
  pointer(window, 'pointermove', 600, 100, touch);
  pointer(window, 'pointerup', 600, 100, touch);
  expect(p.drops).toEqual([{ kind: 'tile', tileId: 'a', toSectionId: 'water', index: 1 }]);
});

test('at the grip a finger drags at once, but a tap on it stays a tap', () => {
  const p = page();
  const touch = { pointerType: 'touch' };
  pointer(at('grip-a'), 'pointerdown', 90, 60, touch);
  pointer(window, 'pointerup', 90, 60, touch);
  expect(p.copies).toHaveLength(0);
  pointer(at('grip-a'), 'pointerdown', 90, 60, touch);
  pointer(window, 'pointermove', 100, 60, touch);
  expect(p.copies).toHaveLength(1);
});

test('a section dragged by its grip moves to the other column', () => {
  const p = page();
  pointer(at('grip-lights'), 'pointerdown', 20, 20);
  pointer(window, 'pointermove', 500, 250);
  expect(p.previews.at(-1)).toEqual({ kind: 'section', sectionId: 'lights', column: 'right', index: 1 });
  pointer(window, 'pointermove', 500, 20);
  pointer(window, 'pointerup', 500, 20);
  expect(p.drops).toEqual([{ kind: 'section', sectionId: 'lights', column: 'right', index: 0 }]);
});

test('Escape cancels a drag without an edit', () => {
  const p = page();
  pointer(at('a'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 430, 80);
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  window.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true);
  expect(p.previews.at(-1)).toBeNull();
  expect(document.getElementById('copy-a')).toBeNull();
  pointer(window, 'pointermove', 600, 80);
  pointer(window, 'pointerup', 600, 80);
  expect(p.drops).toEqual([]);
});

test('a cancelled pointer ends the drag without an edit', () => {
  const p = page();
  pointer(at('a'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 430, 80);
  pointer(window, 'pointercancel', 430, 80);
  expect([p.drops, p.previews.at(-1), document.getElementById('copy-a')]).toEqual([[], null, null]);
});

test('a tile that disappears while it is dragged ends the drag without an error', () => {
  const p = page();
  pointer(at('a'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 430, 80);
  p.sections[0]!.tiles = p.sections[0]!.tiles.filter((tile) => tile.id !== 'a');
  expect(() => pointer(window, 'pointermove', 440, 80)).not.toThrow();
  expect(p.previews.at(-1)).toBeNull();
  expect(document.getElementById('copy-a')).toBeNull();
  pointer(window, 'pointerup', 440, 80);
  expect(p.drops).toEqual([]);
});

test('a tile that disappears right before it is dropped is not dropped', () => {
  const p = page();
  pointer(at('a'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 430, 80);
  p.sections[0]!.tiles = [];
  pointer(window, 'pointerup', 430, 80);
  expect(p.drops).toEqual([]);
});

test('detaching ends a drag and stops listening', () => {
  const p = page();
  pointer(at('a'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 430, 80);
  p.detach();
  expect(document.getElementById('copy-a')).toBeNull();
  pointer(window, 'pointerup', 430, 80);
  pointer(at('a'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 430, 80);
  expect([p.drops, p.copies.length]).toEqual([[], 1]);
});

test('near the edge of the window the page scrolls along', () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.push(fn); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => { frames.length = 0; });
  vi.stubGlobal('innerHeight', 800);
  const scroll = vi.fn();
  vi.stubGlobal('scrollBy', scroll);
  page();
  pointer(at('a'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 60, 400);
  frames.splice(0).forEach((fn) => fn(0));
  expect(scroll).not.toHaveBeenCalled();
  pointer(window, 'pointermove', 60, 790);
  frames.splice(0).forEach((fn) => fn(0));
  expect(scroll.mock.calls.at(-1)![1]).toBeGreaterThan(0);
  pointer(window, 'pointermove', 60, 5);
  frames.splice(0).forEach((fn) => fn(0));
  expect(scroll.mock.calls.at(-1)![1]).toBeLessThan(0);
  pointer(window, 'pointerup', 60, 400);
  scroll.mockClear();
  frames.splice(0).forEach((fn) => fn(0));
  expect(scroll).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
