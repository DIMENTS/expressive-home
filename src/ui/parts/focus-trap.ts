/** The element that really has focus, looking through shadow roots. */
export function deepActiveElement(doc: Document = document): HTMLElement | null {
  let active = doc.activeElement as HTMLElement | null;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement as HTMLElement;
  return active;
}

function isFocusable(element: HTMLElement): boolean {
  if (element.tabIndex < 0) return false;
  if ((element as HTMLButtonElement).disabled) return false;
  return element.getAttribute('aria-disabled') !== 'true';
}

/** Every focusable element under a node in the order a user reaches them, through shadow roots and slots. */
export function focusables(root: ParentNode): HTMLElement[] {
  const found: HTMLElement[] = [];
  const visit = (element: Element): void => {
    if (!(element instanceof HTMLElement) || element.hidden || element.hasAttribute('inert')) return;
    if (element instanceof HTMLSlotElement) {
      for (const assigned of element.assignedElements({ flatten: true })) visit(assigned);
      return;
    }
    if (isFocusable(element)) found.push(element);
    // an element with a shadow root shows its light children through its slots
    const inner: ParentNode = element.shadowRoot ?? element;
    for (const child of Array.from(inner.children)) visit(child);
  };
  for (const child of Array.from(root.children)) visit(child);
  return found;
}

interface Trap { root: HTMLElement | ShadowRoot; host: HTMLElement; previous: HTMLElement | null }
/** The traps that are on, the newest last. */
const traps: Trap[] = [];
/** The keys passed on to a host, which come by the page once more. */
const passedOn = new WeakSet<Event>();

/** Nothing has the focus: what had it was taken away, or the page itself was clicked. */
const focusLost = (doc: Document): boolean => {
  const active = doc.activeElement;
  return active === null || active === doc.body || !active.isConnected;
};

/** On the page and shown: not taken off, and not inside something hidden or inert, as a panel on a narrow window is. */
function shown(host: HTMLElement): boolean {
  if (!host.isConnected) return false;
  for (let node: Node | null = host; node; node = node instanceof ShadowRoot ? node.host : node.parentNode) {
    if (node instanceof HTMLElement && (node.hidden || node.inert)) return false;
  }
  return true;
}

/** Escape and Tab while nothing has the focus go to the newest trap that is shown, as if the focus had stayed in it. */
function onPageKey(event: KeyboardEvent): void {
  if (event.defaultPrevented || passedOn.has(event) || (event.key !== 'Escape' && event.key !== 'Tab')) return;
  const top = [...traps].reverse().find((trap) => shown(trap.host));
  if (!top || !focusLost(top.host.ownerDocument)) return;
  if (event.key === 'Tab') {
    const list = focusables(top.root);
    (event.shiftKey ? list.at(-1) : list[0])?.focus();
    // only when the focus really went in; otherwise the page keeps its Tab
    if (!focusLost(top.host.ownerDocument)) event.preventDefault();
    return;
  }
  event.preventDefault();
  const again = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true });
  passedOn.add(again);
  top.host.dispatchEvent(again);
}

/**
 * Keeps Tab and Shift+Tab inside `host` (searching for focusable elements in `root`) and, when
 * stopped, gives focus back to the element that had it before. When nothing has the focus, Escape and Tab
 * on the page go to the newest trap that is shown. A trap stopped under another hands where to go back to on to it.
 */
export function trapFocus(root: HTMLElement | ShadowRoot, host: HTMLElement): () => void {
  const trap: Trap = { root, host, previous: deepActiveElement(host.ownerDocument) };
  if (traps.length === 0) host.ownerDocument.addEventListener('keydown', onPageKey);
  traps.push(trap);
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const list = focusables(root);
    if (list.length === 0) { event.preventDefault(); return; }
    const index = list.indexOf(deepActiveElement(host.ownerDocument) as HTMLElement);
    if (event.shiftKey && index <= 0) {
      event.preventDefault();
      list[list.length - 1]!.focus();
    } else if (!event.shiftKey && (index === -1 || index === list.length - 1)) {
      event.preventDefault();
      list[0]!.focus();
    }
  };
  host.addEventListener('keydown', onKey);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    host.removeEventListener('keydown', onKey);
    const at = traps.indexOf(trap);
    if (at >= 0) traps.splice(at, 1);
    if (traps.length === 0) host.ownerDocument.removeEventListener('keydown', onPageKey);
    // under another trap the focus stays where it is; that one goes back to where this one came from
    const above = at >= 0 ? traps[at] : undefined;
    if (above) {
      above.previous = trap.previous;
      return;
    }
    if (trap.previous?.isConnected) trap.previous.focus();
  };
}
