// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { colorTokens } from '../../src/theme/engine';
import { rustigExpressive } from '../../src/theme/rustig-expressive';
import type { AppEnvironment, MhApp } from '../../src/ui/app/app';
import '../../src/ui/app/app';
import { deep, deepAll, renderedText } from '../helpers/deep';
import { fakeHub, HOMEY_ID, memoryConfig } from '../helpers/fake-hub';

// Keyboard, names for screen readers and readable colours, checked on the whole app.

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame'] }); });
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

async function settle(app: MhApp): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await vi.advanceTimersByTimeAsync(1);
    await app.updateComplete;
  }
}

async function launch(saved: boolean): Promise<MhApp> {
  const hub = fakeHub();
  const app = document.createElement('mh-app') as MhApp;
  const environment: AppEnvironment = {
    configStore: memoryConfig(saved ? { homeyId: HOMEY_ID, apiKey: 'k' } : null),
    createRealClient: () => hub, createDemoClient: () => fakeHub(),
    schedule: (flush) => { setTimeout(flush, 0); },
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    browserLanguages: ['nl-NL'],
  };
  app.environment = environment;
  document.body.append(app);
  await settle(app);
  return app;
}

const CONTROLS = 'button, [role="button"], [role="switch"], [role="slider"], [role="radio"], [role="menuitemradio"], [role="menuitem"], input, summary';

/** True when the element or one of its ancestors, through shadow roots, is hidden from assistive technology. */
function hiddenFromAT(element: Element): boolean {
  let node: Node | null = element;
  while (node) {
    if (node instanceof Element && (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('inert'))) return true;
    node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
  }
  return false;
}

/** The accessible name: aria-label, aria-labelledby, a label for an input, or the rendered text. */
function accessibleName(element: HTMLElement): string {
  const label = element.getAttribute('aria-label');
  if (label?.trim()) return label.trim();
  const root = element.getRootNode() as Document | ShadowRoot;
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) return labelledBy.split(' ').map((id) => root.getElementById?.(id)?.textContent ?? '').join(' ').trim();
  if (element.id && element instanceof HTMLInputElement) {
    const forLabel = root.querySelector?.(`label[for="${element.id}"]`);
    if (forLabel?.textContent?.trim()) return forLabel.textContent.trim();
  }
  return renderedText(element).replace(/\s+/g, ' ').trim();
}

function unnamed(app: MhApp): string[] {
  return deepAll(app, CONTROLS).filter((c) => !hiddenFromAT(c) && accessibleName(c) === '').map((c) => `${c.tagName.toLowerCase()}.${c.className} in ${(c.getRootNode() as ShadowRoot).host?.tagName.toLowerCase()}`);
}

test('every control on the dashboard, in the panels and on the connect screen has an accessible name', async () => {
  const connect = await launch(false);
  expect(unnamed(connect)).toEqual([]);
  document.body.replaceChildren();

  const app = await launch(true);
  expect(deepAll(app, CONTROLS).filter((c) => !hiddenFromAT(c)).length).toBeGreaterThan(40);
  expect(unnamed(app)).toEqual([]);
  const tile = deep(app, 'mh-light-tile');
  tile.shadowRoot!.querySelector<HTMLElement>('.more')!.click();
  await settle(app);
  expect(unnamed(app)).toEqual([]);
  for (const to of ['theme', 'settings'] as const) {
    deep(app, 'mh-dashboard').dispatchEvent(new CustomEvent('navigate', { detail: { to } }));
    await settle(app);
    expect(unnamed(app)).toEqual([]);
  }
  // the panel of the wall tablet, with everything in it
  deep(app, 'mh-wall-panel').dispatchEvent(new CustomEvent('change', { detail: { wall: { ...app.state.wall, on: true } } }));
  deep(app, 'mh-settings-panel').dispatchEvent(new CustomEvent('open-wall'));
  await settle(app);
  expect(deepAll(deep(app, 'mh-wall-panel'), CONTROLS).length).toBeGreaterThan(10);
  expect(unnamed(app)).toEqual([]);
});

test('every tile and its More button can be reached with the keyboard', async () => {
  const app = await launch(true);
  const tiles = deepAll(app, '.tiles > *, .flows > *');
  expect(tiles.length).toBeGreaterThan(20);
  for (const tile of tiles) {
    const root = tile.shadowRoot!;
    const reachable = [...root.querySelectorAll<HTMLElement>('[role="button"], button')];
    expect([tile.tagName, reachable.length > 0]).toEqual([tile.tagName, true]);
    for (const element of reachable) {
      const native = element instanceof HTMLButtonElement && !element.disabled;
      expect([tile.tagName, element.className, native || element.getAttribute('tabindex') === '0']).toEqual([tile.tagName, element.className, true]);
    }
  }
});

test('the state of a tile is text, not only colour', async () => {
  const app = await launch(true);
  const tiles = deepAll(app, '.tiles > :not(mh-flow-tile)');
  let withState = 0;
  for (const tile of tiles) {
    const root = tile.shadowRoot!;
    const label = root.querySelector('[role="button"]')!.getAttribute('aria-label') ?? '';
    const name = root.querySelector('.name')!.textContent!;
    // everything the tile shows next to its name is also in its name for screen readers
    const shown = [...root.querySelectorAll('.state span, .value, .cell b, .cell .label')].map((el) => el.textContent!.replace(/\s+/g, ' ').trim()).filter(Boolean);
    expect([name, label.startsWith(name)]).toEqual([name, true]);
    for (const part of shown) {
      const words = part.replace(/([0-9])([^0-9,\s])/g, '$1 $2').split(' ').filter((w) => w.length > 1);
      for (const word of words) expect([name, word, label.includes(word)]).toEqual([name, word, true]);
    }
    // a tile without anything to show (a generic tile without a capability) is named after the device alone
    if (shown.length === 0) expect(label).toBe(name);
    else withState += 1;
  }
  expect(withState).toBeGreaterThan(20);
});

test('text stays readable on every surface, in light and dark, with every preset colour', () => {
  const luminance = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
  const pairs: [string, string, number][] = [
    ['on-surface', 'surface', 4.5], ['on-surface', 'surface-container', 4.5], ['on-surface', 'surface-container-high', 4.5],
    ['on-surface-variant', 'surface', 4.5], ['on-surface-variant', 'surface-container-high', 4.5],
    ['on-primary', 'primary', 4.5], ['on-primary-container', 'primary-container', 4.5], ['on-secondary-container', 'secondary-container', 4.5],
    ['on-error-container', 'error-container', 4.5], ['inverse-on-surface', 'inverse-surface', 4.5], ['primary', 'surface', 3],
  ];
  const failures: string[] = [];
  for (const preset of rustigExpressive.color.presets) {
    for (const mode of ['light', 'dark'] as const) {
      const t = colorTokens(preset.seed, mode, 0);
      for (const [fg, bg, min] of pairs) {
        const ratio = contrast(t[`--c-${fg}`]!, t[`--c-${bg}`]!);
        if (ratio < min) failures.push(`${preset.id} ${mode} ${fg} on ${bg}: ${ratio.toFixed(2)}`);
      }
    }
  }
  expect(failures).toEqual([]);
});

test('with reduced motion every shape that changes stays round and nothing moves on its own', async () => {
  const { DeviceTileElement } = await import('../../src/ui/tiles/tile-base');
  const { MhSwatchGroup } = await import('../../src/ui/parts/swatch-group');
  const { MhSheet } = await import('../../src/ui/parts/sheet');
  const { sharedStyles } = await import('../../src/ui/parts/shared-styles');
  const cssOf = (styles: unknown): string => (Array.isArray(styles) ? styles.map(cssOf).join('\n') : String((styles as { cssText?: string }).cssText ?? ''));
  const reduced = (text: string) => [...text.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?\})\s*\}/g)].map((m) => m[1]).join('\n');
  expect(reduced(cssOf(sharedStyles))).toMatch(/animation: none !important/);
  expect(reduced(cssOf(sharedStyles))).toMatch(/transition: none !important/);
  for (const [name, styles] of [['tile', DeviceTileElement.styles], ['swatch', MhSwatchGroup.styles], ['sheet', MhSheet.styles]] as const) {
    expect([name, reduced(cssOf(styles)).includes('clip-path: var(--shape-circle)')]).toEqual([name, true]);
  }
});

test('with reduced motion the rule that stops everything is stronger than any other, in every part that moves', async () => {
  const modules = import.meta.glob<Record<string, unknown>>('../../src/ui/{app,panels,parts,screens,tiles}/**/*.ts');
  const cssOf = (styles: unknown): string => (Array.isArray(styles) ? styles.map(cssOf).join('\n') : String((styles as { cssText?: string } | undefined)?.cssText ?? ''));
  const STOP = /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ transition: none !important; animation: none !important; \}/;
  const without: string[] = [];
  let moving = 0;
  for (const load of Object.values(modules)) {
    for (const [name, value] of Object.entries(await load())) {
      if (typeof value !== 'function' || !('styles' in value)) continue;
      const css = cssOf(value.styles);
      if (!/(?:transition|animation): (?!none)/.test(css)) continue;
      moving += 1;
      if (!STOP.test(css)) without.push(name);
    }
  }
  expect([moving > 25, without]).toEqual([true, []]);
  const { pageStyles } = await import('../../src/ui/page-styles');
  expect(pageStyles.cssText).toMatch(/prefers-reduced-motion: reduce\) \{\s*body \{ transition: none; \}/);
});

const MENU_PARTS = '[role="menu"], [role="menuitemradio"], [role="menuitem"], [role="radiogroup"]';

test('every section menu, its choices and the language group have names, in both languages', async () => {
  const app = await launch(true);
  const triggers = deepAll(app, 'button.trigger');
  // the hero and every section, also Flows
  expect(triggers.length).toBe(deepAll(app, 'mh-section').length + 1);
  for (const trigger of triggers) expect(accessibleName(trigger)).toMatch(/^Menu van .+/);
  for (const trigger of triggers) {
    trigger.click();
    await settle(app);
    const parts = deepAll(app, MENU_PARTS).filter((c) => !hiddenFromAT(c));
    expect(parts.some((p) => p.getAttribute('role') === 'menu')).toBe(true);
    expect(parts.filter((p) => accessibleName(p) === '').map((p) => p.outerHTML.slice(0, 80))).toEqual([]);
    trigger.click();
    await settle(app);
  }
  deep(app, 'mh-dashboard').dispatchEvent(new CustomEvent('navigate', { detail: { to: 'settings' } }));
  await settle(app);
  const language = deepAll(app, '[role="radiogroup"]').find((g) => accessibleName(g) === 'Taal');
  expect(language).toBeDefined();
  deep(app, 'mh-settings-panel').dispatchEvent(new CustomEvent('language', { detail: { choice: 'en' } }));
  await settle(app);
  expect(document.documentElement.lang).toBe('en');
  expect(deepAll(app, '[role="radiogroup"]').some((g) => accessibleName(g) === 'Language')).toBe(true);
  expect(unnamed(app)).toEqual([]);
  for (const trigger of deepAll(app, 'button.trigger')) expect(accessibleName(trigger)).toMatch(/^Menu for .+/);
});

test('text stays readable in a section with its own colour, also next to the red of the dashboard', () => {
  const luminance = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
  // what a section with its own colour draws in its own roles: text on its surfaces, a tile that is on, the menu
  const own: [string, string, number][] = [
    ['on-surface', 'surface', 4.5], ['on-surface', 'surface-container', 4.5], ['on-surface', 'surface-container-high', 4.5],
    ['on-surface-variant', 'surface', 4.5], ['on-surface-variant', 'surface-container', 4.5], ['on-surface-variant', 'surface-container-high', 4.5],
    ['on-primary-container', 'primary-container', 4.5], ['on-tertiary-container', 'tertiary-container', 4.5],
    // the title icon and what is on: graphics, 3 to 1
    ['primary', 'surface', 3], ['primary', 'surface-container-high', 3],
  ];
  // the red of the dashboard (a low battery badge, a danger) on the surfaces of the section: a graphic, 3 to 1
  const mixed: [string, string, number][] = [['error', 'surface-container-high', 3], ['error', 'surface', 3]];
  const failures: string[] = [];
  for (const base of rustigExpressive.color.presets) {
    for (const section of rustigExpressive.color.presets) {
      for (const mode of ['light', 'dark'] as const) {
        const dashboard = colorTokens(base.seed, mode, 0);
        const sectionRoles = colorTokens(section.seed, mode, 0);
        for (const [fg, bg, min] of own) {
          const ratio = contrast(sectionRoles[`--c-${fg}`]!, sectionRoles[`--c-${bg}`]!);
          if (ratio < min) failures.push(`${section.id} ${mode} ${fg} on ${bg}: ${ratio.toFixed(2)}`);
        }
        for (const [fg, bg, min] of mixed) {
          const ratio = contrast(dashboard[`--c-${fg}`]!, sectionRoles[`--c-${bg}`]!);
          if (ratio < min) failures.push(`${base.id} red in ${section.id} ${mode} on ${bg}: ${ratio.toFixed(2)}`);
        }
      }
    }
  }
  expect([...new Set(failures)]).toEqual([]);
});

test('with reduced motion the swatches of a section menu stay round', async () => {
  const { MhMenu } = await import('../../src/ui/parts/menu');
  const css = MhMenu.styles.map((s) => ('cssText' in s ? s.cssText : '')).join('\n');
  const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?\})\s*\}/g)].map((m) => m[1]).join('\n');
  expect(reduced).toContain('clip-path: var(--shape-circle)');
});

test('a touch target stays around its own control: every .hit that unsets its style is positioned again', async () => {
  // .hit::after is placed against its control; without a position of its own it would cover the whole page
  for (const tag of ['mh-section', 'mh-hero'] as const) {
    const css = (customElements.get(tag) as unknown as { styles: { cssText?: string }[] }).styles.map((part) => part.cssText ?? '').join('\n');
    const grip = /\.grip\s*\{([^}]*)\}/.exec(css)![1]!;
    expect([tag, grip.includes('all: unset'), /position:\s*relative/.test(grip)]).toEqual([tag, true, true]);
  }
});

// ----- the edit mode -----

async function editing(): Promise<MhApp> {
  const app = await launch(true);
  deep(app, 'mh-rail').dispatchEvent(new CustomEvent('toggle-edit', { bubbles: true, composed: true }));
  await settle(app);
  return app;
}

test('while editing every control has a name, and the heading of a section is its title alone', async () => {
  const app = await editing();
  expect(unnamed(app)).toEqual([]);
  for (const host of deepAll(app, 'mh-section, mh-hero')) {
    const root = host.shadowRoot!;
    const heading = root.querySelector('h2')!;
    expect(heading.querySelectorAll('button, mh-section-menu')).toHaveLength(0);
    expect(renderedText(heading).trim()).toBe(root.querySelector('.title')!.textContent);
    expect(root.querySelector('section')!.getAttribute('aria-labelledby')).toBe(heading.id);
  }
});

test('two tiles of one device have different names while editing', async () => {
  const app = await editing();
  const names = deepAll(app, 'mh-sensor-tile').map((tile) => tile.shadowRoot!.querySelector('.face')!.getAttribute('aria-label'));
  expect(names.length).toBeGreaterThan(1);
  expect(new Set(names).size).toBe(names.length);
  expect(names.filter((name) => / · .+, menu openen$/.test(name!)).length).toBeGreaterThan(1);
});

test('what the edit mode draws stands out from what is behind it, in light and dark, with every colour', () => {
  const luminance = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
  const pairs: [string, string, string, number][] = [
    ['the edit bar', 'on-secondary-container', 'secondary-container', 4.5],
    ['the text of a place to add, in a section', 'on-surface-variant', 'surface', 4.5], ['the text of a place to add, on the page', 'on-surface-variant', 'surface-container', 4.5],
    ['the border of a place to add, in a section', 'outline', 'surface', 3], ['the border of a place to add, on the page', 'outline', 'surface-container', 3],
    ['the grip of a tile', 'on-surface-variant', 'surface-container-high', 3], ['the grip of a tile that is on', 'on-primary-container', 'primary-container', 3],
    ['the grip of a section', 'on-surface-variant', 'surface', 3],
    ['where it lands, in a section', 'primary', 'surface', 3], ['where it lands, on the page', 'primary', 'surface-container', 3],
    ['a new tile that lights up', 'primary', 'surface', 3], ['the dot of something new', 'primary', 'secondary-container', 3], ['the dot of something new, on the page', 'primary', 'surface-container', 3],
  ];
  const failures: string[] = [];
  for (const preset of rustigExpressive.color.presets) {
    for (const mode of ['light', 'dark'] as const) {
      const t = colorTokens(preset.seed, mode, 0);
      for (const [what, fg, bg, min] of pairs) {
        const ratio = contrast(t[`--c-${fg}`]!, t[`--c-${bg}`]!);
        if (ratio < min) failures.push(`${what}, ${preset.id} ${mode}: ${ratio.toFixed(2)}`);
      }
    }
  }
  expect(failures).toEqual([]);
});

test('with reduced motion nothing lights up and what is picked up does not grow', () => {
  const cssOf = (tag: string) => (customElements.get(tag) as unknown as { styles: { cssText?: string }[] }).styles.map((part) => part.cssText ?? '').join('\n');
  expect(cssOf('mh-section')).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\*[^}]*animation: none/);
  // the dimmer is gone at once instead of standing still until it is taken away
  expect(cssOf('mh-dimmer')).toContain('(prefers-reduced-motion: reduce) { :host([closing]) .scrim, :host([closing]) .dimmer { visibility: hidden; } }');
  for (const tag of ['mh-dashboard', 'mh-hero-panel']) {
    const reduced = [...cssOf(tag).matchAll(/@media \(prefers-reduced-motion: reduce\) \{([^}]*\})/g)].map((m) => m[1]).join('\n');
    expect(reduced).toMatch(/\.lifted \{ transform: translate\(/);
  }
});

test('on a phone every control has a name too, the connection is told, and a panel takes the focus and gives it back', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('width'), addEventListener() {}, removeEventListener() {} }));
  const app = await launch(true);
  expect(deepAll(app, 'mh-nav-bar')).toHaveLength(1);
  expect(unnamed(app)).toEqual([]);
  expect(deepAll(app, '[role="img"]').map((c) => c.getAttribute('aria-label'))).toContain('Lokaal verbonden');
  // what a tile shows is still in its name
  for (const tile of deepAll(app, 'mh-light-tile')) expect(tile.shadowRoot!.querySelector('[role="button"]')!.getAttribute('aria-label')).toContain(tile.shadowRoot!.querySelector('.name')!.textContent!);
  const more = deep(app, 'mh-nav-bar').shadowRoot!.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
  expect(accessibleName(more)).toBe('Meer');
  more.focus();
  more.click();
  await settle(app);
  expect(unnamed(app)).toEqual([]);
  deepAll(app, '[role="menuitem"]').find((c) => accessibleName(c) === 'Thema')!.click();
  await settle(app);
  const panel = deep(app, 'mh-theme-panel').shadowRoot!.querySelector('mh-sheet')!;
  expect(panel.shadowRoot!.activeElement).not.toBeNull();
  expect(unnamed(app)).toEqual([]);
  vi.unstubAllGlobals();
});

test('the dimmer can be read on its track and in its fill', () => {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (c: number[]) => { const v = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!; };
  const contrast = (a: number[], b: number[]) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
  expect(rustigExpressive.components['dimmer-bg']).toBe('color-mix(in srgb, var(--c-primary) 24%, var(--c-surface-container-low))');
  const failures: string[] = [];
  for (const preset of rustigExpressive.color.presets) {
    for (const mode of ['light', 'dark'] as const) {
      const t = colorTokens(preset.seed, mode, 0);
      const [primary, low, on] = ['primary', 'surface-container-low', 'on-surface'].map((role) => channels(t[`--c-${role}`]!)) as [number[], number[], number[]];
      const track = primary.map((value, i) => value * 0.24 + low[i]! * 0.76);
      const ratio = contrast(on, track);
      if (ratio < 4.5) failures.push(`${preset.id} ${mode} on the track: ${ratio.toFixed(2)}`);
      if (contrast(primary, track) < 3) failures.push(`${preset.id} ${mode} the fill on the track: ${contrast(primary, track).toFixed(2)}`);
    }
  }
  expect(failures).toEqual([]);
});
