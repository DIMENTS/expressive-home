import { createIdle, type Idle } from '../../wall/idle';
import { isNight, type FlowNight } from '../../wall/night';
import type { WallSettings } from '../../wall/settings';

export interface WallDeps {
  target: Window;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  settings(): WallSettings;
  /** Whether the rest screen can come now: not while something is being arranged or asked. */
  allowed(): boolean;
  began(): void;
  ended(kind: 'rest' | 'preview'): void;
  /** Something of it is to be drawn again. */
  update(): void;
}

const MINUTE = 60_000;
/** At night the rest screen comes back after this long. */
const NIGHT_REST_MS = 30_000;
/** A mouse button that was lifted without a click, a mouse that moved, and a wheel, are over after this long. */
const CLICK_MS = 400;
/** After the touch that wakes the second one of a double tap is caught too. */
const AGAIN_MS = 300;
/** A key that is held repeats itself within this time (a second at the most); one that does not was let go somewhere else. */
const KEY_MS = 1500;
/** Moved this far, a mouse wakes: less is a browser that reports it without it moving, or a table that trembles. */
const MOUSE_PX = 6;
/** After this long the rest screen lies over everything. */
const COVERED_MS = 1000;

const SIGNS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'keydown', 'wheel', 'touchstart', 'touchmove', 'input'] as const;
const GESTURES = [
  'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel',
  'touchstart', 'touchmove', 'touchend', 'touchcancel', 'keydown', 'keyup',
] as const;

const codeOf = (event: KeyboardEvent): string => event.code || event.key || '';

/**
 * When the rest screen of a wall tablet is there (wall tablet, 4.2 and 4.4): it comes after a while of silence, and any
 * touch, click or key takes it away without doing anything else, from its beginning to its end. A device that is no wall
 * tablet has no listeners and no timers of it.
 */
export function createWall(deps: WallDeps) {
  const { target } = deps;
  let started = false;
  let shown: 'none' | 'rest' | 'preview' = 'none';
  let previewLook: 'day' | 'night' = 'day';
  let night = false;
  let leaving = false;
  let covered = false;
  let now = new Date(deps.now());
  let flow: FlowNight | null = null;
  let idle: Idle | null = null;
  let minute: unknown = null;
  let cover: unknown = null;
  /** The gesture that wakes, until it is over. */
  let gesture: 'touch' | 'mouse' | 'key' | null = null;
  /** What went down on the layer and was not lifted yet: pointers, and keys. */
  const own = new Set<number>();
  const keys = new Set<string>();
  /** The browser tells of the fingers themselves too: then they say when the last one was lifted. */
  let touches = false;
  /** The pointers that are down anywhere. */
  const down = new Set<number>();
  let over: unknown = null;
  let mouse: { x: number; y: number } | null = null;

  function clear(handle: unknown): null {
    if (handle !== null) deps.clearTimeout(handle);
    return null;
  }

  // ----- the clock -----

  /** The time, and whether it is night; says whether that changed. */
  function look(): boolean {
    now = new Date(deps.now());
    const settings = deps.settings();
    const next = settings.on && isNight(now, settings.night, flow);
    if (next === night) return false;
    night = next;
    return true;
  }

  function tick(): void {
    minute = clear(minute);
    if (idle === null && shown === 'none') return;
    const turned = look();
    minute = deps.setTimeout(tick, MINUTE - (deps.now() % MINUTE));
    if (turned || shown !== 'none') deps.update();
    // at night it comes back sooner
    if (turned) idle?.changed();
  }

  // ----- coming and going -----

  function forget(): void {
    leaving = false;
    covered = false;
    gesture = null;
    touches = false;
    own.clear();
    keys.clear();
    over = clear(over);
    cover = clear(cover);
  }

  function begin(kind: 'rest' | 'preview'): void {
    shown = kind;
    forget();
    mouse = null;
    look();
    for (const type of GESTURES) target.addEventListener(type, onGesture, { capture: true, passive: false });
    target.addEventListener('blur', onBlur);
    cover = deps.setTimeout(() => {
      cover = null;
      covered = true;
      deps.update();
    }, COVERED_MS);
    if (minute === null) tick();
    deps.began();
    deps.update();
  }

  function end(): void {
    if (shown === 'none') return;
    const kind = shown;
    shown = 'none';
    forget();
    for (const type of GESTURES) target.removeEventListener(type, onGesture, { capture: true });
    target.removeEventListener('blur', onBlur);
    if (idle === null) minute = clear(minute);
    idle?.touched();
    deps.ended(kind);
    deps.update();
  }

  /** The gesture that wakes has begun: nothing is to be seen any more, but everything is still caught. */
  function leave(by: 'touch' | 'mouse' | 'key'): void {
    gesture = by;
    over = clear(over);
    if (leaving) return;
    leaving = true;
    covered = false;
    cover = clear(cover);
    deps.update();
  }

  function endIn(ms: number): void {
    over = clear(over);
    over = deps.setTimeout(end, ms);
  }

  function onBlur(): void {
    if (gesture === 'key') end();
  }

  /** It belongs to a touch that began before the rest screen came. */
  function isOlder(event: Event): boolean {
    switch (event.type) {
      case 'pointerup':
      case 'pointercancel':
        return !own.has((event as PointerEvent).pointerId);
      case 'pointermove':
        return (event as PointerEvent).buttons > 0 && !own.has((event as PointerEvent).pointerId);
      case 'touchmove':
      case 'touchend':
      case 'touchcancel':
        return !touches;
      case 'mouseup':
        return gesture === null;
      default:
        return false;
    }
  }

  function onGesture(event: Event): void {
    if (event.type === 'keydown') {
      const { key = '', ctrlKey, metaKey, altKey } = event as KeyboardEvent;
      // a key of the browser itself, such as reloading, does what it does
      if (ctrlKey || metaKey || altKey || /^F\d+$/.test(key)) {
        end();
        return;
      }
    }
    if (isOlder(event)) {
      // its end goes to where it began; while it moves somebody is there
      if (event.type === 'pointermove' || event.type === 'touchmove') end();
      return;
    }
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    switch (event.type) {
      case 'keydown':
        keys.add(codeOf(event as KeyboardEvent));
        leave('key');
        endIn(KEY_MS);
        break;
      case 'keyup':
        // a key that went down before, such as the one that asked for a look, is not among them
        if (keys.delete(codeOf(event as KeyboardEvent)) && keys.size === 0 && gesture === 'key') end();
        break;
      case 'pointerdown':
        own.add((event as PointerEvent).pointerId);
        leave((event as PointerEvent).pointerType === 'touch' ? 'touch' : 'mouse');
        break;
      case 'touchstart':
        touches = true;
        leave('touch');
        break;
      case 'touchend':
      case 'touchcancel':
        if (((event as TouchEvent).touches?.length ?? 0) === 0) endIn(AGAIN_MS);
        break;
      case 'pointerup':
      case 'pointercancel':
        own.delete((event as PointerEvent).pointerId);
        // a click follows; of a finger its touch says when it is over
        if (own.size === 0 && !touches) endIn(CLICK_MS);
        break;
      case 'click':
        leave(gesture ?? 'mouse');
        endIn(AGAIN_MS);
        break;
      case 'wheel':
        // a look ends only by a click, a touch or a key
        if (shown === 'preview') break;
        leave('mouse');
        endIn(CLICK_MS);
        break;
      case 'pointermove':
        if (gesture === null && shown === 'rest' && (event as PointerEvent).pointerType === 'mouse') moved(event as PointerEvent);
        break;
    }
  }

  function moved({ clientX: x, clientY: y }: PointerEvent): void {
    mouse ??= { x, y };
    if (Math.hypot(x - mouse.x, y - mouse.y) < MOUSE_PX) return;
    leave('mouse');
    endIn(CLICK_MS);
  }

  // ----- silence -----

  function onSign(event: Event): void {
    const { pointerId } = event as PointerEvent;
    if (event.type === 'pointerdown') down.add(pointerId);
    else if (event.type === 'pointerup' || event.type === 'pointercancel') down.delete(pointerId);
    if (shown === 'none') idle?.touched();
  }
  const onVisible = (): void => tick();

  function listen(on: boolean): void {
    if (on === (idle !== null)) return;
    if (!on) {
      for (const type of SIGNS) target.removeEventListener(type, onSign, { capture: true });
      target.document.removeEventListener('visibilitychange', onVisible);
      idle?.stop();
      idle = null;
      down.clear();
      if (shown === 'none') minute = clear(minute);
      return;
    }
    for (const type of SIGNS) target.addEventListener(type, onSign, { capture: true, passive: true });
    target.document.addEventListener('visibilitychange', onVisible);
    idle = createIdle({
      now: deps.now, setTimeout: deps.setTimeout, clearTimeout: deps.clearTimeout,
      delay: () => (night ? NIGHT_REST_MS : deps.settings().after * MINUTE),
      due: () => {
        if (shown === 'rest') return true;
        if (!deps.allowed()) return false;
        if (shown === 'preview') {
          // nobody came back to it: it goes on as the rest screen itself
          shown = 'rest';
          mouse = null;
          deps.update();
          return true;
        }
        if (down.size > 0) {
          // something is held; its end may have gone elsewhere, so once
          down.clear();
          idle?.touched();
          return false;
        }
        begin('rest');
        return true;
      },
    });
    tick();
  }

  /** The settings, what is allowed, or what a flow said can be another one. */
  function changed(): void {
    if (!started) return;
    const { on } = deps.settings();
    if (shown !== 'none' && (!deps.allowed() || (shown === 'rest' && !on))) end();
    listen(on);
    if (look()) deps.update();
    idle?.changed();
  }

  return {
    get shown() { return shown; },
    /** How it looks: what a look asked for, or the time of day. */
    get look() { return (shown === 'preview' ? previewLook : night ? 'night' : 'day') as 'day' | 'night'; },
    get night() { return night; },
    get leaving() { return leaving; },
    get covered() { return covered; },
    get now() { return now; },
    start(): void {
      started = true;
      changed();
    },
    stop(): void {
      started = false;
      // it goes with the page: nobody hears of it
      for (const type of GESTURES) target.removeEventListener(type, onGesture, { capture: true });
      target.removeEventListener('blur', onBlur);
      shown = 'none';
      forget();
      listen(false);
      minute = clear(minute);
    },
    changed,
    /** To have a look at it, whatever the time and the settings. */
    preview(as: 'day' | 'night'): void {
      if (shown !== 'none' || !deps.allowed()) return;
      previewLook = as;
      begin('preview');
    },
    restNow(): void {
      if (shown === 'none' && deps.settings().on && deps.allowed()) begin('rest');
    },
    /** What a flow on the hub said of the night. */
    setFlow(next: FlowNight | null): void {
      flow = next;
      changed();
    },
  };
}

export type Wall = ReturnType<typeof createWall>;
