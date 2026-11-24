/** A press this long on something that can be dimmed begins to dim it. */
export const HOLD_DIM_MS = 350;
/** Moving further than this before that is scrolling. */
export const HOLD_MOVE_PX = 10;
/** Moving further than this while holding is swiping; less is only holding. */
export const SWIPE_PX = 6;
/** How long a phone buzzes when something is held (Android; an iPhone does not). */
export const HELD_BUZZ_MS = 10;
/** A finger that comes down this soon after the page scrolled stops the scrolling: it begins nothing. */
export const SCROLL_QUIET_MS = 200;

export interface HoldDimHandlers {
  /** Without it a press is an ordinary press. */
  enabled(): boolean;
  /** Which pointers it is for; another one is left alone, with its menu. */
  accepts?(event: PointerEvent): boolean;
  /** Tapped, or swiped along, without being held first. */
  missed?(): void;
  /** A finger that is held but then goes across first lets go: it scrolls after all. */
  yields?: boolean;
  /** Whether it can be dimmed now; otherwise holding opens it. */
  canDim(): boolean;
  /** The finger held still; `at` is where it is in the window, along the axis. */
  start(at: number): void;
  /** Not for the wobble of a finger that only holds. */
  move(at: number): void;
  /** Lifted; or, not `lifted`, taken away from the tile by another finger or the system. */
  end(swiped: boolean, lifted: boolean): void;
  /** Held while it cannot be dimmed, or a right click. */
  open(): void;
}

/** The click that ends a hold comes at once; after this long another click is another click. */
const SWALLOW_MS = 100;

/** When the page scrolled last; one listener for every tile. */
let scrolledAt = Number.NEGATIVE_INFINITY;
let watching = 0;
const onScroll = (): void => { scrolledAt = Date.now(); };

/** Below zero: the clock was set back. */
export const scrolledJustNow = (): boolean => {
  const age = Date.now() - scrolledAt;
  return age >= 0 && age < SCROLL_QUIET_MS;
};

/** Keeps `scrolledJustNow` up to date until what it returns is called. */
export function watchScroll(): () => void {
  if (watching === 0) window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  watching += 1;
  return () => {
    watching -= 1;
    if (watching === 0) window.removeEventListener('scroll', onScroll, { capture: true });
  };
}

/**
 * Holding something still and then, without lifting the finger, moving it up and down (or sideways). The page does not scroll
 * meanwhile, the click that ends it is swallowed, and the menu of the browser does not come. Returns how to stop, which
 * also ends what is going on.
 */
export function observeHoldDim(target: HTMLElement, handlers: HoldDimHandlers, axis: 'x' | 'y' = 'y'): () => void {
  const at = (event: PointerEvent): number => (axis === 'x' ? event.clientX : event.clientY);
  const beside = (event: PointerEvent): number => (axis === 'x' ? event.clientY : event.clientX);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let press: { id: number; x: number; y: number; last: number; lastBeside: number } | null = null;
  let held: { id: number; at: number; beside: number; swiped: boolean } | null = null;
  /** A finger that swiped along it without holding; told when it is lifted. */
  let strayed: number | null = null;
  let swallowClick = false;
  let forget: ReturnType<typeof setTimeout> | null = null;
  /** This finger scrolls, or stopped the scrolling: however long it lies there, it opens nothing. */
  let scrolls = false;

  function cancel(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    press = null;
    if (!held) window.removeEventListener('pointerdown', onOther, true);
  }

  function end(lifted = false): void {
    cancel();
    if (!held) return;
    const { swiped } = held;
    held = null;
    window.removeEventListener('pointerdown', onOther, true);
    handlers.end(swiped, lifted);
  }

  /** Another finger, anywhere. */
  function onOther(event: PointerEvent): void {
    if (held && event.pointerId !== held.id) end();
    else if (press && event.pointerId !== press.id) cancel();
  }

  function onHeld(): void {
    timer = null;
    if (!press) return;
    const { id, last, lastBeside } = press;
    swallowClick = true;
    if (!handlers.canDim()) {
      cancel();
      handlers.open();
      return;
    }
    press = null;
    held = { id, at: last, beside: lastBeside, swiped: false };
    try {
      target.setPointerCapture?.(id);
    } catch {
      // the finger was lifted just now; its pointerup ends it
    }
    handlers.start(last);
  }

  function onDown(event: PointerEvent): void {
    if (held || press) {
      if (event.pointerId !== (held ?? press)!.id) {
        if (held) end();
        else cancel();
      }
      return;
    }
    swallowClick = false;
    scrolls = false;
    strayed = null;
    if (event.button > 0 || event.isPrimary === false || handlers.accepts?.(event) === false || !handlers.enabled()) return;
    if (scrolledJustNow()) {
      scrolls = true;
      return;
    }
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, last: at(event), lastBeside: beside(event) };
    window.addEventListener('pointerdown', onOther, true);
    timer = setTimeout(onHeld, HOLD_DIM_MS);
  }

  function onMove(event: PointerEvent): void {
    if (press && event.pointerId === press.id) {
      press.last = at(event);
      press.lastBeside = beside(event);
      const [across, down] = [Math.abs(event.clientX - press.x), Math.abs(event.clientY - press.y)];
      if (Math.hypot(across, down) > HOLD_MOVE_PX) {
        cancel();
        scrolls = true;
        if (axis === 'x' ? across > down : down > across) strayed = event.pointerId;
      }
    } else if (held && event.pointerId === held.id) {
      // a mouse whose button was lifted where nobody heard it
      if (event.pointerType === 'mouse' && event.buttons === 0) { end(); return; }
      const [along, across] = [Math.abs(at(event) - held.at), Math.abs(beside(event) - held.beside)];
      if (handlers.yields && !held.swiped && across > SWIPE_PX && across >= along) {
        end();
        scrolls = true;
        return;
      }
      if (along > SWIPE_PX) held.swiped = true;
      if (held.swiped) handlers.move(at(event));
    }
  }

  function onUp(event: PointerEvent): void {
    if (swallowClick && forget === null) forget = setTimeout(() => { forget = null; swallowClick = false; }, SWALLOW_MS);
    const missed = event.type === 'pointerup' && (press?.id === event.pointerId || strayed === event.pointerId);
    if (strayed === event.pointerId) strayed = null;
    if (held ? event.pointerId === held.id : press?.id === event.pointerId) end(event.type === 'pointerup');
    if (missed) handlers.missed?.();
  }

  function onClick(event: Event): void {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onMenu(event: Event): void {
    if (handlers.accepts) {
      // the menu of a pointer it is not for is not its own
      if (!held && !press && !scrolls && !swallowClick) return;
      event.stopPropagation();
    }
    event.preventDefault();
    if (held || press || scrolls || !handlers.enabled()) return;
    // the one of a finger that lies still for long comes after it was held
    if (!swallowClick) handlers.open();
  }

  const onTouchMove = (event: Event): void => { if (held && event.cancelable) event.preventDefault(); };
  /** No tap where the finger is lifted: what holding opened can be under it by then. */
  const onTouchEnd = (event: Event): void => { if (swallowClick && event.cancelable) event.preventDefault(); };
  /** The pointer was taken away (another window, another app): nobody tells when it is lifted. */
  const onLost = (event: PointerEvent): void => {
    // a part inside loses it when the whole takes it: that is how it is held
    if (event.target === target && held && event.pointerId === held.id) end();
  };
  /** Leaving the tile ends a press; what is held goes on, wherever the finger is. */
  const onLeave = (): void => { if (!held) cancel(); };

  const stopScroll = watchScroll();
  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointermove', onMove);
  for (const type of ['pointerup', 'pointercancel'] as const) target.addEventListener(type, onUp);
  target.addEventListener('pointerleave', onLeave);
  target.addEventListener('lostpointercapture', onLost);
  target.addEventListener('click', onClick, { capture: true });
  target.addEventListener('contextmenu', onMenu);
  target.addEventListener('touchmove', onTouchMove, { passive: false });
  target.addEventListener('touchend', onTouchEnd, { passive: false });
  return () => {
    end();
    stopScroll();
    target.removeEventListener('pointerdown', onDown);
    target.removeEventListener('pointermove', onMove);
    for (const type of ['pointerup', 'pointercancel'] as const) target.removeEventListener(type, onUp);
    target.removeEventListener('pointerleave', onLeave);
    target.removeEventListener('lostpointercapture', onLost);
    if (forget !== null) clearTimeout(forget);
    target.removeEventListener('click', onClick, { capture: true });
    target.removeEventListener('contextmenu', onMenu);
    target.removeEventListener('touchmove', onTouchMove);
    target.removeEventListener('touchend', onTouchEnd);
  };
}
