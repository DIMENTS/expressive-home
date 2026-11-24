// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HOLD_MOVE_PX, SCROLL_QUIET_MS } from '../../../src/ui/parts/hold-dim';
import { HOLD_GO_MS, HOLD_STEPS, TAP_MS, type MhHoldButton } from '../../../src/ui/parts/hold-button';
import { rustigExpressive } from '../../../src/theme/rustig-expressive';
import { inside, key, mount, record, settle } from '../../helpers/mount';

let clock = 2_000_000;
beforeEach(() => { vi.useFakeTimers({ now: (clock += 60_000), toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] }); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const pointer = (target: EventTarget, type: string, init: PointerEventInit = {}) =>
  target.dispatchEvent(new PointerEvent(type, { clientX: 50, clientY: 20, pointerId: 1, isPrimary: true, button: 0, pointerType: 'touch', bubbles: true, composed: true, cancelable: true, ...init }));

async function setup(props: Record<string, unknown> = {}) {
  const element = await mount<MhHoldButton>('mh-hold-button', { text: 'Houd vast om te ontgrendelen', label: 'Voordeur ontgrendelen', icon: 'lock_open', guarded: true, ...props });
  const [go, ask] = [record(element, 'go'), record(element, 'ask')];
  const button = inside<HTMLButtonElement>(element, 'button');
  const buzz = vi.fn();
  Object.defineProperty(navigator, 'vibrate', { value: buzz, configurable: true });
  return { element, go, ask, button, buzz, seen: () => [go.length, ask.length], part: () => element.style.getPropertyValue('--_part') };
}
const tap = (button: HTMLElement, ms = 80) => { pointer(button, 'pointerdown'); vi.advanceTimersByTime(ms); pointer(button, 'pointerup'); button.click(); };

test('holding long enough does it, once, while the finger is still there', async () => {
  expect([HOLD_GO_MS, TAP_MS]).toEqual([800, 350]);
  const s = await setup();
  pointer(s.button, 'pointerdown');
  vi.advanceTimersByTime(HOLD_GO_MS - 1);
  expect(s.seen()).toEqual([0, 0]);
  vi.advanceTimersByTime(1);
  expect([s.seen(), s.buzz.mock.calls.length]).toEqual([[1, 0], 1]);
  vi.advanceTimersByTime(5000);
  pointer(s.button, 'pointerup');
  s.button.click();
  expect(s.seen()).toEqual([1, 0]);
  // and after that everything is as before
  tap(s.button);
  expect(s.seen()).toEqual([1, 1]);
});

test('it fills meanwhile, in steps that follow each other', async () => {
  const s = await setup();
  expect([s.element.holding, s.part()]).toEqual([false, '']);
  pointer(s.button, 'pointerdown');
  const seen = [s.part()];
  for (let i = 1; i < HOLD_STEPS; i += 1) { vi.advanceTimersByTime(HOLD_GO_MS / HOLD_STEPS); seen.push(s.part()); }
  expect([seen, s.element.holding]).toEqual([['0.25', '0.5', '0.75', '1'], true]);
  expect(rustigExpressive.components['hold-step']).toBe(`${HOLD_GO_MS / HOLD_STEPS}ms`);
  pointer(s.button, 'pointerup');
  expect([s.element.holding, s.part()]).toEqual([false, '0']);
});

test('a short tap asks, and so does a key or a screen reader', async () => {
  const s = await setup();
  tap(s.button, TAP_MS - 1);
  expect(s.seen()).toEqual([0, 1]);
  s.button.click();
  expect(s.seen()).toEqual([0, 2]);
  // a key that is kept down does not ask again and again
  expect([key(s.button, 'Enter').defaultPrevented, key(s.button, 'Enter', { repeat: true }).defaultPrevented, key(s.button, ' ', { repeat: true }).defaultPrevented]).toEqual([false, true, true]);
});

test('who lets go too soon changed their mind: nothing happens, also no question', async () => {
  const s = await setup();
  tap(s.button, TAP_MS);
  tap(s.button, HOLD_GO_MS - 1);
  expect(s.seen()).toEqual([0, 0]);
  tap(s.button);
  expect(s.seen()).toEqual([0, 1]);
});

test('a finger that moves scrolls, and one that wobbles does not', async () => {
  const s = await setup();
  pointer(s.button, 'pointerdown');
  pointer(s.button, 'pointermove', { clientX: 50 + HOLD_MOVE_PX, clientY: 20 });
  vi.advanceTimersByTime(HOLD_GO_MS);
  expect(s.seen()).toEqual([1, 0]);
  pointer(s.button, 'pointerup');
  pointer(s.button, 'pointerdown');
  pointer(s.button, 'pointermove', { clientX: 50, clientY: 20 + HOLD_MOVE_PX + 1 });
  vi.advanceTimersByTime(HOLD_GO_MS);
  pointer(s.button, 'pointerup');
  // a mouse still says it clicked, as it was lifted over the same button
  s.button.click();
  expect(s.seen()).toEqual([1, 0]);
});

test.each(['pointercancel', 'pointerleave'])('%s breaks it off', async (type) => {
  const s = await setup();
  pointer(s.button, 'pointerdown');
  vi.advanceTimersByTime(500);
  pointer(s.button, type);
  vi.advanceTimersByTime(HOLD_GO_MS);
  expect([s.seen(), s.element.holding]).toEqual([[0, 0], false]);
});

test('a second finger, anywhere, breaks it off', async () => {
  const s = await setup();
  pointer(s.button, 'pointerdown');
  pointer(document.body, 'pointerdown', { pointerId: 2, isPrimary: false });
  vi.advanceTimersByTime(HOLD_GO_MS);
  pointer(s.button, 'pointerup');
  expect([s.seen(), s.element.holding]).toEqual([[0, 0], false]);
  // and a second one on the button itself begins nothing
  pointer(s.button, 'pointerdown', { pointerId: 3, isPrimary: false });
  vi.advanceTimersByTime(HOLD_GO_MS);
  expect(s.seen()).toEqual([0, 0]);
});

test('a finger that stops the scrolling begins nothing', async () => {
  const s = await setup();
  window.dispatchEvent(new Event('scroll'));
  vi.advanceTimersByTime(SCROLL_QUIET_MS - 1);
  pointer(s.button, 'pointerdown');
  vi.advanceTimersByTime(HOLD_GO_MS);
  pointer(s.button, 'pointerup');
  expect(s.seen()).toEqual([0, 0]);
  window.dispatchEvent(new Event('scroll'));
  vi.advanceTimersByTime(SCROLL_QUIET_MS);
  pointer(s.button, 'pointerdown');
  vi.advanceTimersByTime(HOLD_GO_MS);
  expect(s.seen()).toEqual([1, 0]);
});

test('a mouse does not scroll with a press: it begins at once', async () => {
  const s = await setup();
  window.dispatchEvent(new Event('scroll'));
  pointer(s.button, 'pointerdown', { pointerType: 'mouse' });
  vi.advanceTimersByTime(100);
  pointer(s.button, 'pointerup', { pointerType: 'mouse' });
  s.button.click();
  expect(s.seen()).toEqual([0, 1]);
});

test('another button of the mouse does nothing, and holding brings no menu', async () => {
  const s = await setup();
  pointer(s.button, 'pointerdown', { button: 2, pointerType: 'mouse' });
  vi.advanceTimersByTime(HOLD_GO_MS);
  const menu = new Event('contextmenu', { bubbles: true, cancelable: true });
  s.button.dispatchEvent(menu);
  expect([s.seen(), menu.defaultPrevented]).toEqual([[0, 0], true]);
});

test('what it would do changes under the finger: it does not do that', async () => {
  const s = await setup();
  pointer(s.button, 'pointerdown');
  vi.advanceTimersByTime(700);
  s.element.label = 'Voordeur vergrendelen';
  await settle(s.element);
  vi.advanceTimersByTime(HOLD_GO_MS);
  expect([s.seen(), s.element.holding]).toEqual([[0, 0], false]);
  pointer(s.button, 'pointerup');
  // nor with the tap that ends it
  s.button.click();
  expect(s.seen()).toEqual([0, 0]);
});

test('a button that goes away, or is busy, does nothing', async () => {
  const s = await setup();
  pointer(s.button, 'pointerdown');
  s.element.remove();
  vi.advanceTimersByTime(HOLD_GO_MS);
  expect(s.seen()).toEqual([0, 0]);
  const b = await setup({ busy: true });
  pointer(b.button, 'pointerdown');
  vi.advanceTimersByTime(HOLD_GO_MS);
  pointer(b.button, 'pointerup');
  b.button.click();
  expect([b.seen(), b.button.getAttribute('aria-disabled'), b.button.getAttribute('aria-busy')]).toEqual([[0, 0], 'true', 'true']);
  // becoming busy while it is held
  const c = await setup();
  pointer(c.button, 'pointerdown');
  c.element.busy = true;
  await settle(c.element);
  vi.advanceTimersByTime(HOLD_GO_MS);
  expect(c.seen()).toEqual([0, 0]);
});

test('what is no danger goes with one tap, and holding it is one tap', async () => {
  const s = await setup({ guarded: false, text: 'Vergrendelen', label: 'Voordeur vergrendelen', icon: 'lock' });
  tap(s.button);
  expect(s.seen()).toEqual([1, 0]);
  tap(s.button, 2000);
  expect([s.seen(), s.element.holding]).toEqual([[2, 0], false]);
});

test('it says what it does, and how, to everyone', async () => {
  const s = await setup();
  expect([s.button.getAttribute('aria-label'), s.button.textContent!.trim(), s.element.shadowRoot!.querySelector('mh-icon')!.getAttribute('name')]).toEqual(['Voordeur ontgrendelen', 'Houd vast om te ontgrendelen', 'lock_open']);
  s.element.focus();
  expect(s.element.shadowRoot!.activeElement).toBe(s.button);
});

test('a press on it is no press on what is around it', async () => {
  const s = await setup();
  const outside = vi.fn();
  for (const type of ['pointerdown', 'click', 'contextmenu']) document.body.addEventListener(type, outside);
  tap(s.button);
  s.button.dispatchEvent(new Event('contextmenu', { bubbles: true, composed: true, cancelable: true }));
  for (const type of ['pointerdown', 'click', 'contextmenu']) document.body.removeEventListener(type, outside);
  expect(outside).not.toHaveBeenCalled();
});
