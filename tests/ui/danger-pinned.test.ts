// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { DeviceTileElement as MhTileBase } from '../../src/ui/tiles/tile-base';
import '../../src/ui/parts/chip';
import '../../src/ui/screens/rest-screen';

const cssOf = (element: { styles?: unknown }): string => [element.styles].flat(Infinity as 1).map((sheet) => (sheet as { cssText?: string })?.cssText ?? '').join('\n').replace(/\s+/g, ' ');

test('an alarm tile pins its colours, its icon, its texts and its decoration from inside, which own CSS cannot override', () => {
  const css = cssOf(MhTileBase as unknown as { styles: unknown });
  for (const rule of [
    /:host\(\[state="danger"\]\) \.tile \{[^}]*background: var\(--tile-alert-bg\) !important[^}]*color: var\(--tile-alert-fg\) !important/,
    /:host\(\[state="danger"\]\) \.icon \{[^}]*background: var\(--tile-icon-alert-bg\) !important[^}]*color: var\(--tile-icon-alert-fg\) !important/,
    /:host\(\[state="danger"\]\) \.name, :host\(\[state="danger"\]\) \.state \{[^}]*color: var\(--tile-alert-fg\) !important/,
    /:host\(\[state="danger"\]\) \.tile::before, :host\(\[state="danger"\]\) \.tile::after \{[^}]*content: none !important/,
    /:host\(\[state="danger"\]\) \.tile \{[^}]*box-shadow: inset 0 0 0 var\(--tile-outline-width\) var\(--tile-outline\) !important[^}]*border: 0 none !important[^}]*padding: var\(--tile-pad\) !important/,
    /:host\(\[state="danger"\]\) \.tile \{[^}]*transition: background-color var\(--motion-effects\), color var\(--motion-effects\), opacity var\(--motion-effects\), border-radius var\(--motion-spatial\), transform var\(--motion-spatial\) !important/,
    /:host\(\[state="danger"\]\) \.icon \{[^}]*box-shadow: none !important[^}]*border: 0 none !important/,
  ]) expect(css).toMatch(rule);
});

test('an alarm chip and an alarm on the rest screen pin their colours too', () => {
  expect(cssOf(customElements.get('mh-chip') as unknown as { styles: unknown })).toMatch(/:host\(\[tone="alert"\]\)[^{]*\{[^}]*background: var\(--chip-alert-bg\) !important[^}]*color: var\(--chip-alert-fg\) !important/);
  expect(cssOf(customElements.get('mh-rest-screen') as unknown as { styles: unknown })).toMatch(/\.pill\.alarm \{[^}]*background: var\(--rest-alarm-bg\) !important[^}]*color: var\(--rest-alarm-fg\) !important/);
});

test('with own CSS, Thema and Instellingen in the bars keep a ground and a colour of their own, so they stay readable', async () => {
  await import('../../src/ui/screens/rail');
  await import('../../src/ui/screens/nav-bar');
  for (const tag of ['mh-rail', 'mh-nav-bar']) {
    expect(cssOf(customElements.get(tag) as unknown as { styles: unknown })).toMatch(/:host\(\[own-css\]\) [^{]*\.kept[^{]*\{[^}]*background: var\(--sheet-bg\)[^}]*color: var\(--sheet-fg\)/);
  }
  const rail = document.createElement('mh-rail') as HTMLElement & { ownCss: boolean; boards: unknown[]; updateComplete: Promise<unknown> };
  rail.boards = [];
  rail.ownCss = true;
  document.body.append(rail);
  await rail.updateComplete;
  expect(rail.hasAttribute('own-css')).toBe(true);
  expect([...rail.shadowRoot!.querySelectorAll('button.kept')].map((button) => button.textContent!.trim())).toEqual(['Thema', 'Instellingen']);
  expect([...rail.shadowRoot!.querySelectorAll('button.kept')].every((button) => !button.hasAttribute('part'))).toBe(true);
  rail.remove();
});
