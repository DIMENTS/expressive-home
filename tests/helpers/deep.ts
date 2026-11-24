/** Every element matching the selector, through every shadow root. */
export function deepAll(root: ParentNode, selector: string): HTMLElement[] {
  const found = [...root.querySelectorAll<HTMLElement>(selector)];
  if (root instanceof Element && root.shadowRoot) found.push(...deepAll(root.shadowRoot, selector));
  for (const element of root.querySelectorAll<HTMLElement>('*')) if (element.shadowRoot) found.push(...deepAll(element.shadowRoot, selector));
  return found;
}

export function deep(root: ParentNode, selector: string): HTMLElement {
  const found = deepAll(root, selector)[0];
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
}

/** The text of an element and everything in its shadow roots. */
export function deepText(node: Node): string {
  let text = '';
  for (const child of node.childNodes) text += child.nodeType === Node.TEXT_NODE ? child.textContent : deepText(child);
  if (node instanceof Element && node.shadowRoot) text += deepText(node.shadowRoot);
  return text;
}

/**
 * The text a screen reader takes from an element's content: the rendered (flattened) tree, slotted
 * content included, without anything marked aria-hidden.
 */
export function renderedText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof Element)) return '';
  if (node.getAttribute('aria-hidden') === 'true') return '';
  if (node instanceof HTMLSlotElement) return node.assignedNodes({ flatten: true }).map(renderedText).join('');
  const children = node.shadowRoot ? node.shadowRoot.childNodes : node.childNodes;
  return [...children].map(renderedText).join('');
}
