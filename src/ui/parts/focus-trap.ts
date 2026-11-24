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

/**
 * Keeps Tab and Shift+Tab inside `host` (searching for focusable elements in `root`) and, when
 * stopped, gives focus back to the element that had it before.
 */
export function trapFocus(root: HTMLElement | ShadowRoot, host: HTMLElement): () => void {
  const previous = deepActiveElement(host.ownerDocument);
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
  return () => {
    host.removeEventListener('keydown', onKey);
    if (previous?.isConnected) previous.focus();
  };
}
