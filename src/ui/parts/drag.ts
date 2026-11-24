import type { Column } from '../../layout/types';
import { columnAt, dropIndex, sectionAt, type Point, type Slot } from '../model/drop';
import { pixels } from '../pixels';
import { themePixels } from '../theme-pixels';

export type DropResult =
  | { kind: 'tile'; tileId: string; toSectionId: string; index: number }
  | { kind: 'section'; sectionId: string; column: Column; index: number };

/** What is being dragged on: the dashboard. Places are in page coordinates. */
export interface DragHost {
  /** The sections with their place and their tiles (in a grid unless they say otherwise), and the columns with their sections. */
  measure(): { sections: { id: string; rect: Slot; tiles: Slot[]; layout?: 'grid' | 'column' }[]; columns: { column: Column; rect: Slot; sections: Slot[] }[] };
  /** Shows the empty place where it would land; null: nowhere any more. */
  preview(target: DropResult | null): void;
  /** The floating copy, at the place of what was picked up; it is moved through --_dx and --_dy and removed at the end. */
  lift(kind: 'tile' | 'section', id: string): HTMLElement;
}

/** With the mouse, or with a finger at a grip, dragging begins after this much movement. */
export const DRAG_THRESHOLD_PX = 6;
/** A finger anywhere else has to hold still this long first, so scrolling keeps working. */
export const TOUCH_HOLD_MS = 250;

/** Within this distance of the top or bottom of the window the page scrolls along, the closer the faster. */
const EDGE = themePixels('target-min');
const SCROLL_DIVISOR = 4;

interface Item { kind: 'tile' | 'section'; id: string }
interface Press { item: Item; pointerId: number; start: Point; hold: ReturnType<typeof setTimeout> | null; waitsForHold: boolean }

const pagePoint = (client: Point): Point => ({ x: client.x + window.scrollX, y: client.y + window.scrollY });

/** What a press picks up: a section by its grip, or a tile anywhere; `grip` says whether it was pressed at a grip. */
function itemAt(event: PointerEvent): { item: Item; grip: boolean } | null {
  let grip = false;
  for (const node of event.composedPath()) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.hasAttribute('data-grip')) grip = true;
    if (node.dataset['tileId'] !== undefined) return { item: { kind: 'tile', id: node.dataset['tileId'] }, grip };
    if (node.dataset['sectionId'] !== undefined) return grip ? { item: { kind: 'section', id: node.dataset['sectionId'] }, grip } : null;
  }
  return null;
}

/**
 * Dragging tiles and sections with the mouse and the finger. A tile goes to every section, a section
 * to every place in both columns. Escape, a cancelled pointer or the disappearance of what is dragged ends it without
 * a drop. Returns how to stop, which also ends a drag that is going on.
 */
export function attachDrag(root: HTMLElement, host: DragHost, onDrop: (result: DropResult) => void): () => void {
  let press: Press | null = null;
  let copy: HTMLElement | null = null;
  let target: DropResult | null = null;
  let client: Point = { x: 0, y: 0 };
  let frame = 0;

  /** Where the item would land; undefined when it is not there any more. Between two sections the last place stays. */
  function targetAt(item: Item, point: Point): DropResult | null | undefined {
    const { sections, columns } = host.measure();
    if (item.kind === 'tile') {
      if (!sections.some((s) => s.tiles.some((tile) => tile.id === item.id))) return undefined;
      const section = sectionAt(sections, point);
      if (!section) return target;
      return { kind: 'tile', tileId: item.id, toSectionId: section.id, index: dropIndex(section.tiles.filter((tile) => tile.id !== item.id), point, section.layout ?? 'grid') };
    }
    if (!columns.some((c) => c.sections.some((s) => s.id === item.id))) return undefined;
    const column = columnAt(columns, point);
    if (!column) return target;
    return { kind: 'section', sectionId: item.id, column: column.column, index: dropIndex(column.sections.filter((s) => s.id !== item.id), point, 'column') };
  }

  function end(): void {
    if (press?.hold != null) clearTimeout(press.hold);
    press = null;
    for (const [type, listener] of windowListeners) window.removeEventListener(type, listener as EventListener, true);
    if (!copy) return;
    cancelAnimationFrame(frame);
    copy.remove();
    copy = null;
    target = null;
    host.preview(null);
  }

  function update(): void {
    if (!press || !copy) return;
    const next = targetAt(press.item, pagePoint(client));
    if (next === undefined) { end(); return; }
    copy.style.setProperty('--_dx', pixels(client.x - press.start.x));
    copy.style.setProperty('--_dy', pixels(client.y - press.start.y));
    if (JSON.stringify(next) === JSON.stringify(target)) return;
    target = next;
    host.preview(target);
  }

  function scrollAlong(): void {
    if (!copy) return;
    const below = client.y - (window.innerHeight - EDGE);
    const above = EDGE - client.y;
    const step = below > 0 ? below : above > 0 ? -above : 0;
    if (step !== 0) {
      window.scrollBy(0, Math.round(step / SCROLL_DIVISOR));
      update();
    }
    frame = requestAnimationFrame(scrollAlong);
  }

  function begin(): void {
    if (!press || copy) return;
    if (press.hold !== null) clearTimeout(press.hold);
    copy = host.lift(press.item.kind, press.item.id);
    frame = requestAnimationFrame(scrollAlong);
    update();
  }

  function onDown(event: PointerEvent): void {
    if (press || !event.isPrimary || event.button > 0) return;
    const found = itemAt(event);
    if (!found) return;
    const waitsForHold = event.pointerType === 'touch' && !found.grip;
    client = { x: event.clientX, y: event.clientY };
    press = { item: found.item, pointerId: event.pointerId, start: client, waitsForHold, hold: waitsForHold ? setTimeout(begin, TOUCH_HOLD_MS) : null };
    for (const [type, listener] of windowListeners) window.addEventListener(type, listener as EventListener, true);
  }

  function onMove(event: PointerEvent): void {
    if (!press || event.pointerId !== press.pointerId) return;
    client = { x: event.clientX, y: event.clientY };
    if (copy) { update(); return; }
    if (Math.hypot(client.x - press.start.x, client.y - press.start.y) <= DRAG_THRESHOLD_PX) return;
    // a finger that moves before it held still scrolls the page
    if (press.waitsForHold) end();
    else begin();
  }

  function onUp(event: PointerEvent): void {
    if (!press || event.pointerId !== press.pointerId) return;
    if (!copy) { end(); return; }
    client = { x: event.clientX, y: event.clientY };
    update();
    const result = target;
    end();
    // the click that the release gives would open the menu of the tile
    const swallow = (click: Event): void => { click.preventDefault(); click.stopImmediatePropagation(); };
    window.addEventListener('click', swallow, { capture: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    if (result) onDrop(result);
  }

  function onCancel(event: PointerEvent): void {
    if (press && event.pointerId === press.pointerId) end();
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !copy) return;
    event.preventDefault();
    event.stopPropagation();
    end();
  }

  // Once a finger drags, the page must not scroll with it; before that it scrolls as always.
  const onTouchMove = (event: Event): void => { if (copy && event.cancelable) event.preventDefault(); };
  const onContextMenu = (event: Event): void => { if (copy) event.preventDefault(); };
  const windowListeners: [string, unknown][] = [['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onCancel], ['keydown', onKey], ['contextmenu', onContextMenu]];

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('touchmove', onTouchMove, { passive: false });
  return () => {
    end();
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('touchmove', onTouchMove);
  };
}
