import type { Page } from '@playwright/test';

/** Texts outside the padding of their block; what an ancestor cuts off does not stick out. */
export const sticksOut = (page: Page) => page.evaluate(() => {
  const found = new Set<string>();
  const walk = (root: ParentNode): void => {
    for (const element of root.querySelectorAll<HTMLElement>('*')) {
      if (element.shadowRoot) walk(element.shadowRoot);
      if (![...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== '')) continue;
      const block = element.closest<HTMLElement>('.stat, .cell, .tile, .main');
      if (!block || element.offsetWidth === 0 || getComputedStyle(element).visibility === 'hidden') continue;
      const box = block.getBoundingClientRect();
      const style = getComputedStyle(block);
      const [left, right] = [box.left + parseFloat(style.paddingLeft), box.right - parseFloat(style.paddingRight)];
      const range = document.createRange();
      range.selectNodeContents(element);
      for (const rect of range.getClientRects()) {
        let [from, to] = [rect.left, rect.right];
        for (let up: HTMLElement | null = element; up && up !== block; up = up.parentElement) {
          if (getComputedStyle(up).overflowX === 'visible') continue;
          const cut = up.getBoundingClientRect();
          [from, to] = [Math.max(from, cut.left), Math.min(to, cut.right)];
        }
        if (to > right + 1 || from < left - 1) found.add(`${block.className}: ${element.textContent!.trim().slice(0, 30)} by ${Math.round(Math.max(to - right, left - from))}px`);
      }
    }
  };
  walk(document);
  return [...found];
});
