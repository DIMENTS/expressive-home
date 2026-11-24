/** Puts a custom element in the document, sets its properties and waits for its first render. */
export async function mount<T extends HTMLElement>(tag: string, props: Record<string, unknown> = {}, inner = ''): Promise<T & { updateComplete: Promise<unknown> }> {
  const element = document.createElement(tag) as T & { updateComplete: Promise<unknown> };
  Object.assign(element, props);
  if (inner) element.innerHTML = inner;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

/** Waits until an element has rendered again after a change. */
export async function settle(element: { updateComplete: Promise<unknown> }): Promise<void> {
  await element.updateComplete;
}

/** The first element in an element's shadow root that matches the selector. */
export function inside<E extends Element = HTMLElement>(host: Element, selector: string): E {
  const found = host.shadowRoot?.querySelector<E>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
}

/** Collects the detail of every event of one type that reaches the element. */
export function record<D = unknown>(element: EventTarget, type: string): D[] {
  const seen: D[] = [];
  element.addEventListener(type, (event) => seen.push((event as CustomEvent<D>).detail));
  return seen;
}

export function key(target: EventTarget, name: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}
