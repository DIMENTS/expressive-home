// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/parts/slider';
import type { MhSlider } from '../../../src/ui/parts/slider';
import { SLIDER_SEND_MS } from '../../../src/ui/model/slider-math';
import { HOLD_DIM_MS, SWIPE_PX } from '../../../src/ui/parts/hold-dim';
import { inside, key, mount, record, settle } from '../../helpers/mount';

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const pointer = (target: Element, type: string, clientX: number) =>
  target.dispatchEvent(new PointerEvent(type, { clientX, pointerId: 1, bubbles: true, composed: true, cancelable: true }));

function track(slider: MhSlider): HTMLElement {
  const element = inside(slider, '[role="slider"]');
  element.getBoundingClientRect = () => ({ left: 100, width: 200, right: 300, top: 0, bottom: 28, height: 28, x: 100, y: 0, toJSON: () => ({}) });
  return element;
}

test('the slider is a slider for assistive technology', async () => {
  const slider = await mount<MhSlider>('mh-slider', { fraction: 0.8, label: 'Helderheid Plafond', valueText: '80%' });
  const control = inside(slider, '[role="slider"]');
  expect(control.getAttribute('aria-valuemin')).toBe('0');
  expect(control.getAttribute('aria-valuemax')).toBe('100');
  expect(control.getAttribute('aria-valuenow')).toBe('80');
  expect(control.getAttribute('aria-valuetext')).toBe('80%');
  expect(control.getAttribute('aria-label')).toBe('Helderheid Plafond');
  expect(control.getAttribute('tabindex')).toBe('0');
});

test('arrow keys change one step, Shift and Page keys ten, Home and End the ends', async () => {
  vi.useFakeTimers();
  const slider = await mount<MhSlider>('mh-slider', { fraction: 0.5, label: 'Helderheid' });
  const commits = record<{ fraction: number }>(slider, 'commit');
  const control = inside(slider, '[role="slider"]');
  const press = async (name: string, init: KeyboardEventInit = {}) => {
    const event = key(control, name, init);
    vi.advanceTimersByTime(SLIDER_SEND_MS);
    await settle(slider);
    return event;
  };
  expect((await press('ArrowRight')).defaultPrevented).toBe(true);
  await press('ArrowUp', { shiftKey: true });
  await press('PageDown');
  await press('Home');
  await press('End');
  expect(commits.map((c) => c.fraction)).toEqual([0.51, 0.61, 0.51, 0, 1]);
});

test('a slider with its own step moves by that step', async () => {
  vi.useFakeTimers();
  const slider = await mount<MhSlider>('mh-slider', { fraction: 0.25, label: 'Doel', step: 0.025 });
  const commits = record<{ fraction: number }>(slider, 'commit');
  key(inside(slider, '[role="slider"]'), 'ArrowLeft');
  vi.advanceTimersByTime(SLIDER_SEND_MS);
  expect(commits).toEqual([{ fraction: 0.225 }]);
});

test('arrow keys follow the 200 ms interval and end with the final value', async () => {
  vi.useFakeTimers();
  const slider = await mount<MhSlider>('mh-slider', { fraction: 0.5, label: 'Helderheid' });
  const slides = record<{ fraction: number }>(slider, 'slide');
  const commits = record<{ fraction: number }>(slider, 'commit');
  const control = inside(slider, '[role="slider"]');
  for (let i = 0; i < 5; i += 1) {
    key(control, 'ArrowRight');
    vi.advanceTimersByTime(20);
  }
  // the last key came at 80 ms; the final value follows SLIDER_SEND_MS after it
  vi.advanceTimersByTime(SLIDER_SEND_MS - 21);
  expect(commits).toEqual([]);
  expect(slides.length).toBeLessThanOrEqual(1);
  vi.advanceTimersByTime(1);
  expect(commits).toEqual([{ fraction: 0.55 }]);
  vi.advanceTimersByTime(SLIDER_SEND_MS * 3);
  expect(slides.length).toBeLessThanOrEqual(1);
  expect(commits).toHaveLength(1);
});

test('dragging reports slide and releasing reports commit', async () => {
  const slider = await mount<MhSlider>('mh-slider', { fraction: 0, label: 'Helderheid' });
  const slides = record<{ fraction: number }>(slider, 'slide');
  const commits = record<{ fraction: number }>(slider, 'commit');
  const control = track(slider);
  pointer(control, 'pointerdown', 150);
  expect(slides).toEqual([{ fraction: 0.25 }]);
  pointer(control, 'pointermove', 250);
  pointer(control, 'pointerup', 250);
  expect(commits).toEqual([{ fraction: 0.75 }]);
  expect(slider.fraction).toBe(0.75);
});

test('a value from outside does not move the handle while it is dragged', async () => {
  const slider = await mount<MhSlider>('mh-slider', { fraction: 0, label: 'Helderheid' });
  const control = track(slider);
  pointer(control, 'pointerdown', 250);
  await settle(slider);
  slider.fraction = 0.3;
  await settle(slider);
  expect(control.getAttribute('aria-valuenow')).toBe('75');
  pointer(control, 'pointerup', 250);
  await settle(slider);
  expect(slider.fraction).toBe(0.75);
  slider.fraction = 0.3;
  await settle(slider);
  expect(control.getAttribute('aria-valuenow')).toBe('30');
});

test('a tap on the slider does not reach the tile around it', async () => {
  const slider = await mount<MhSlider>('mh-slider', { fraction: 0.5, label: 'Helderheid' });
  let reached = 0;
  document.body.addEventListener('click', () => { reached += 1; });
  inside(slider, '[role="slider"]').click();
  expect(reached).toBe(0);
});

test('a disabled slider reports nothing', async () => {
  const slider = await mount<MhSlider>('mh-slider', { fraction: 0.5, label: 'Helderheid', disabled: true });
  const slides = record(slider, 'slide');
  const commits = record(slider, 'commit');
  const control = track(slider);
  key(control, 'ArrowRight');
  pointer(control, 'pointerdown', 150);
  pointer(control, 'pointerup', 150);
  expect([...slides, ...commits]).toEqual([]);
  expect(control.getAttribute('aria-disabled')).toBe('true');
  expect(control.getAttribute('tabindex')).toBe('-1');
});

test('a value from outside during a run of keys does not move the handle back or change the final value', async () => {
  vi.useFakeTimers();
  const slider = await mount<MhSlider>('mh-slider', { fraction: 0.5, label: 'Helderheid' });
  const commits = record<{ fraction: number }>(slider, 'commit');
  const control = inside(slider, '[role="slider"]');
  for (let i = 0; i < 5; i += 1) { key(control, 'ArrowRight'); vi.advanceTimersByTime(20); }
  // the tile redraws (the hub's echo of the first step, or another value of the device) and hands the old value back
  slider.fraction = 0.5;
  await settle(slider);
  expect(control.getAttribute('aria-valuenow')).toBe('55');
  key(control, 'ArrowRight');
  vi.advanceTimersByTime(SLIDER_SEND_MS);
  expect(commits).toEqual([{ fraction: 0.56 }]);
});

test('a key held down sends at most every 200 ms, like dragging, and the final value after it', async () => {
  vi.useFakeTimers();
  const slider = await mount<MhSlider>('mh-slider', { fraction: 0, label: 'Helderheid' });
  const sent: { type: string; at: number; fraction: number }[] = [];
  for (const type of ['slide', 'commit']) slider.addEventListener(type, (e) => sent.push({ type, at: Date.now(), fraction: (e as CustomEvent<{ fraction: number }>).detail.fraction }));
  const control = inside(slider, '[role="slider"]');
  const start = Date.now();
  for (let t = 0; t <= 1000; t += 30) { key(control, 'ArrowRight'); vi.advanceTimersByTime(30); }
  vi.advanceTimersByTime(SLIDER_SEND_MS);
  const slides = sent.filter((s) => s.type === 'slide');
  expect(slides.length).toBeGreaterThanOrEqual(4);
  expect(sent.at(-1)!.type).toBe('commit');
  expect(sent.filter((s) => s.type === 'commit')).toHaveLength(1);
  expect(sent.at(-1)!.fraction).toBe(0.34);
  for (let i = 1; i < sent.length; i += 1) expect(sent[i]!.at - sent[i - 1]!.at).toBeGreaterThanOrEqual(SLIDER_SEND_MS);
  expect(slides[0]!.at).toBe(start);
});

test('a drag whose end goes elsewhere is over, with the last value', async () => {
  const slider = await mount<MhSlider>('mh-slider', { fraction: 0.2, label: 'Helderheid' });
  const element = track(slider);
  const commits = record<{ fraction: number }>(slider, 'commit');
  pointer(element, 'pointerdown', 200);
  pointer(element, 'lostpointercapture', 0);
  await settle(slider);
  expect([commits, slider.hasAttribute('dragging')]).toEqual([[{ fraction: 0.5 }], false]);
  // and then it does not follow a mouse any more
  pointer(element, 'pointermove', 280);
  await settle(slider);
  expect([commits.length, element.getAttribute('aria-valuenow')]).toEqual([1, '50']);
});

test('the end of a drag counts once', async () => {
  const slider = await mount<MhSlider>('mh-slider', { fraction: 0.2, label: 'Helderheid' });
  const element = track(slider);
  const commits = record<{ fraction: number }>(slider, 'commit');
  pointer(element, 'pointerdown', 200);
  pointer(element, 'pointerup', 260);
  pointer(element, 'lostpointercapture', 0);
  expect(commits).toEqual([{ fraction: 0.8 }]);
});

// ----- with a finger: hold first, so that scrolling over it changes nothing -----

// the moment of the last scroll is shared: every test is later than the one before
let clock = 1_000_000;
const finger = (target: Element, type: string, clientX: number, clientY = 14, init: PointerEventInit = {}) =>
  target.dispatchEvent(new PointerEvent(type, { clientX, clientY, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, bubbles: true, composed: true, cancelable: true, ...init }));
async function underFinger(props: Partial<MhSlider> = {}) {
  vi.useFakeTimers({ now: (clock += 60_000) });
  const slider = await mount<MhSlider>('mh-slider', { fraction: 0.3, label: 'Helderheid', ...props });
  const control = track(slider);
  const heard = { slide: record<{ fraction: number }>(slider, 'slide'), commit: record<{ fraction: number }>(slider, 'commit'), hint: record(slider, 'hold-hint') };
  const now = () => control.getAttribute('aria-valuenow');
  return { slider, control, heard, now, hold: (x = 150) => { finger(control, 'pointerdown', x); vi.advanceTimersByTime(HOLD_DIM_MS); } };
}

test('a finger that taps it, scrolls over it or swipes along it without holding changes nothing', async () => {
  const s = await underFinger();
  for (const [x, y] of [[150, 14], [152, 90], [280, 20], [290, 14]] as const) {
    finger(s.control, 'pointerdown', 150);
    vi.advanceTimersByTime(60);
    finger(s.control, 'pointermove', x, y);
    finger(s.control, 'pointerup', x, y);
    await settle(s.slider);
    expect([s.heard.slide, s.heard.commit, s.now(), s.slider.dragging]).toEqual([[], [], '30', false]);
    vi.advanceTimersByTime(1000);
  }
});

test('held, it goes along with the finger from where it was, and does not jump to it', async () => {
  const s = await underFinger();
  const buzz = vi.fn();
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator) as object, { vibrate: buzz }));
  s.hold(150);
  await settle(s.slider);
  // it shows that it is held; nothing changed yet
  expect([s.slider.dragging, s.slider.hasAttribute('gripped'), s.now(), s.heard.slide, buzz.mock.calls.length]).toEqual([true, true, '30', [], 1]);
  // just enough to be a swipe: it does not jump
  finger(s.control, 'pointermove', 150 + SWIPE_PX + 0.1);
  await settle(s.slider);
  expect([s.now(), s.heard.slide]).toEqual(['30', []]);
  finger(s.control, 'pointermove', 250 + SWIPE_PX);
  await settle(s.slider);
  expect([s.now(), s.heard.slide]).toEqual(['80', [{ fraction: 0.8 }]]);
  // past the end stays at the end, and back goes on from there
  finger(s.control, 'pointermove', 400);
  await settle(s.slider);
  expect(s.now()).toBe('100');
  finger(s.control, 'pointermove', 190 + SWIPE_PX);
  finger(s.control, 'pointerup', 190 + SWIPE_PX);
  await settle(s.slider);
  expect([s.now(), s.heard.commit, s.slider.dragging, s.slider.hasAttribute('gripped')]).toEqual(['50', [{ fraction: 0.5 }], false, false]);
  vi.unstubAllGlobals();
});

test('held and lifted without moving changes nothing', async () => {
  const s = await underFinger();
  s.hold();
  finger(s.control, 'pointerup', 150);
  await settle(s.slider);
  vi.advanceTimersByTime(2000);
  expect([s.heard, s.now(), s.slider.dragging]).toEqual([{ slide: [], commit: [], hint: [] }, '30', false]);
});

test('a value from outside does not move it while it is held, and counts again afterwards', async () => {
  const s = await underFinger();
  s.hold();
  s.slider.fraction = 0.9;
  await settle(s.slider);
  expect(s.now()).toBe('30');
  finger(s.control, 'pointerup', 150);
  await settle(s.slider);
  expect([s.now(), s.heard.commit]).toEqual(['90', []]);
});

test('the page scrolls over it as long as it is not held, and never after', async () => {
  const s = await underFinger();
  const css = (customElements.get('mh-slider') as unknown as { styles: { cssText: string }[] }).styles.map((part) => part.cssText).join('');
  expect(css).toMatch(/\.slider \{[^}]*touch-action: pan-y pinch-zoom;/);
  const move = () => { const event = new Event('touchmove', { bubbles: true, cancelable: true }); s.control.dispatchEvent(event); return event.defaultPrevented; };
  finger(s.control, 'pointerdown', 150);
  expect(move()).toBe(false);
  vi.advanceTimersByTime(HOLD_DIM_MS);
  expect(move()).toBe(true);
  finger(s.control, 'pointerup', 150);
  expect(move()).toBe(false);
});

test('the tile around it hears nothing of a finger on it, also not that it lay there for long; a right click it does', async () => {
  const s = await underFinger();
  const heard = vi.fn();
  for (const type of ['pointerdown', 'click', 'contextmenu']) document.body.addEventListener(type, (event) => heard(event.type));
  s.hold();
  const menu = new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true });
  s.control.dispatchEvent(menu);
  finger(s.control, 'pointerup', 150);
  s.control.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  expect([heard.mock.calls, menu.defaultPrevented]).toEqual([[], true]);
  vi.advanceTimersByTime(1000);
  finger(s.control, 'pointerdown', 150, 14, { pointerType: 'mouse', button: 2 });
  s.control.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true }));
  expect(heard.mock.calls).toEqual([['contextmenu']]);
});

test('a second finger ends it with the value it had; a pen is held as a finger is', async () => {
  const s = await underFinger();
  s.hold();
  finger(s.control, 'pointermove', 200 + SWIPE_PX);
  finger(s.control, 'pointerdown', 120, 14, { pointerId: 8, isPrimary: false });
  finger(s.control, 'pointermove', 290);
  await settle(s.slider);
  expect([s.heard.commit, s.slider.dragging]).toEqual([[{ fraction: 0.55 }], false]);
  finger(s.control, 'pointerup', 290);
  vi.advanceTimersByTime(1000);
  finger(s.control, 'pointerdown', 150, 14, { pointerType: 'pen', pointerId: 9 });
  finger(s.control, 'pointermove', 250, 14, { pointerType: 'pen', pointerId: 9 });
  finger(s.control, 'pointerup', 250, 14, { pointerType: 'pen', pointerId: 9 });
  expect(s.heard.commit).toHaveLength(1);
  vi.advanceTimersByTime(1000);
  const pen = { pointerType: 'pen', pointerId: 9 };
  finger(s.control, 'pointerdown', 150, 14, pen);
  vi.advanceTimersByTime(HOLD_DIM_MS);
  finger(s.control, 'pointermove', 170 + SWIPE_PX, 14, pen);
  finger(s.control, 'pointerup', 170 + SWIPE_PX, 14, pen);
  expect(s.heard.commit.at(-1)).toEqual({ fraction: 0.65 });
});

test('a disabled slider cannot be held; one that goes away while it is held lets go', async () => {
  const off = await underFinger({ disabled: true });
  off.hold();
  finger(off.control, 'pointermove', 250);
  finger(off.control, 'pointerup', 250);
  expect([off.heard.slide, off.heard.commit, off.heard.hint]).toEqual([[], [], []]);
  document.body.replaceChildren();
  const s = await underFinger();
  s.hold();
  finger(s.control, 'pointermove', 250);
  s.slider.remove();
  // with the value it had by then
  expect([s.slider.dragging, s.heard.commit]).toEqual([false, [{ fraction: 0.77 }]]);
  // and it can be held again where it comes back
  document.body.append(s.slider);
  await settle(s.slider);
  vi.advanceTimersByTime(1000);
  const before = s.heard.commit.length;
  s.hold();
  finger(s.control, 'pointermove', 170);
  finger(s.control, 'pointerup', 170);
  expect(s.heard.commit).toHaveLength(before + 1);
});

test('who taps it or swipes along it is told how it works', async () => {
  const s = await underFinger();
  finger(s.control, 'pointerdown', 150);
  finger(s.control, 'pointerup', 150);
  expect(s.heard.hint).toHaveLength(1);
  vi.advanceTimersByTime(1000);
  finger(s.control, 'pointerdown', 150);
  finger(s.control, 'pointermove', 152, 80);
  finger(s.control, 'pointerup', 152, 80);
  expect(s.heard.hint).toHaveLength(1);
  // a mouse drags as before, at once
  vi.advanceTimersByTime(1000);
  finger(s.control, 'pointerdown', 200, 14, { pointerType: 'mouse' });
  finger(s.control, 'pointerup', 200, 14, { pointerType: 'mouse' });
  expect([s.heard.hint.length, s.heard.commit]).toEqual([1, [{ fraction: 0.5 }]]);
});

test('held for a moment and then swiped up is scrolling: nothing changes', async () => {
  const s = await underFinger();
  s.hold();
  finger(s.control, 'pointermove', 154, 0);
  finger(s.control, 'pointermove', 170, -240);
  finger(s.control, 'pointerup', 170, -240);
  await settle(s.slider);
  expect([s.heard.slide, s.heard.commit, s.now(), s.slider.dragging, s.slider.hasAttribute('gripped')]).toEqual([[], [], '30', false, false]);
});

test('what became unusable while the finger lay there cannot be held', async () => {
  for (const unusable of ['disabled', 'inert'] as const) {
    const s = await underFinger();
    finger(s.control, 'pointerdown', 150);
    vi.advanceTimersByTime(100);
    s.slider[unusable] = true;
    await settle(s.slider);
    vi.advanceTimersByTime(HOLD_DIM_MS);
    finger(s.control, 'pointermove', 250);
    finger(s.control, 'pointerup', 250);
    expect([unusable, s.heard.slide, s.heard.commit, s.slider.dragging]).toEqual([unusable, [], [], false]);
    document.body.replaceChildren();
  }
});

test('back where it was it is what it was, also between two steps', async () => {
  const s = await underFinger({ fraction: 0.8047 });
  s.hold(150);
  finger(s.control, 'pointermove', 120);
  finger(s.control, 'pointermove', 150 - SWIPE_PX);
  finger(s.control, 'pointerup', 150 - SWIPE_PX);
  expect(s.heard.commit).toEqual([{ fraction: 0.8047 }]);
  document.body.replaceChildren();
  const coarse = await underFinger({ fraction: 0.333, step: 0.25 });
  coarse.hold(150);
  finger(coarse.control, 'pointermove', 150 + SWIPE_PX + 4);
  finger(coarse.control, 'pointerup', 150 + SWIPE_PX + 4);
  expect([coarse.heard.slide, coarse.heard.commit]).toEqual([[], []]);
});

test('a mouse that was dragging when it went away leaves nothing for a finger', async () => {
  const s = await underFinger();
  finger(s.control, 'pointerdown', 150, 14, { pointerType: 'mouse', pointerId: 1 });
  s.slider.remove();
  document.body.append(s.slider);
  await settle(s.slider);
  const before = s.heard.commit.length;
  finger(s.control, 'pointerdown', 150);
  finger(s.control, 'pointermove', 152, 90);
  finger(s.control, 'pointercancel', 252, 90);
  expect([s.heard.commit.length, s.slider.dragging]).toEqual([before, false]);
});
