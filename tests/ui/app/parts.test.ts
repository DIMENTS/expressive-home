// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { createMockClient } from '../../../src/mock/mock-client';
import { PART_NAMES, STATE_NAMES } from '../../../src/theme/css/parts';
import { demoRaw } from '../../../src/ui/app/demo';
import type { AppEnvironment, MhApp } from '../../../src/ui/app/app';
import { fakeHub, HOMEY_ID, memoryConfig } from '../../helpers/fake-hub';

// The parts own CSS can reach, on the whole app: every part is passed up to the app, nothing else is.

beforeAll(async () => { await import('../../../src/ui/app/app'); }, 60_000);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame'] });
  vi.setSystemTime(new Date('2026-11-25T12:00:00'));
  const quiet = { matches: false, addEventListener: () => {}, removeEventListener: () => {} };
  vi.stubGlobal('matchMedia', () => quiet);
  window.localStorage.clear();
});
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function launch(): Promise<MhApp> {
  const configStore = memoryConfig({ homeyId: HOMEY_ID, apiKey: 'k' });
  const environment: AppEnvironment = {
    configStore, createRealClient: () => fakeHub(), createDemoClient: () => createMockClient(demoRaw()),
    schedule: (flush) => { setTimeout(flush, 0); }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    browserLanguages: ['nl-NL'], watchStored: () => () => {},
  };
  const app = document.createElement('mh-app') as MhApp;
  app.environment = environment;
  document.body.append(app);
  for (let i = 0; i < 10; i += 1) { await vi.advanceTimersByTimeAsync(1); await app.updateComplete; }
  return app;
}

const names = (value: string | null): string[] => (value ?? '').split(/[\s,]+/).filter(Boolean);
/** What a host passes up: `a, b` or `a:b`; only plain names are used here. */
const exported = (host: Element): Set<string> => new Set((host.getAttribute('exportparts') ?? '').split(',').map((item) => item.trim()).filter(Boolean));

/** Every element with a part in the app, with the hosts between it and the app's own shadow tree. */
function partsIn(app: MhApp): { element: Element; hosts: Element[] }[] {
  const found: { element: Element; hosts: Element[] }[] = [];
  const walk = (root: ShadowRoot, hosts: Element[]): void => {
    for (const element of root.querySelectorAll('*')) {
      if (element.hasAttribute('part')) found.push({ element, hosts });
      if (element.shadowRoot) walk(element.shadowRoot, [element, ...hosts]);
    }
  };
  walk(app.shadowRoot!, []);
  return found;
}

test('every part in the app is passed up to the app, with all its names, and only names of the list', async () => {
  const app = await launch();
  const reachable = new Set<string>();
  for (const { element, hosts } of partsIn(app)) {
    for (const name of names(element.getAttribute('part'))) {
      expect([name, [...PART_NAMES, ...STATE_NAMES].includes(name)]).toEqual([name, true]);
      const missing = hosts.find((host) => !exported(host).has(name));
      expect([element.tagName, name, missing?.tagName ?? null]).toEqual([element.tagName, name, null]);
      reachable.add(name);
    }
  }
  for (const name of ['page', 'rail', 'rail-item', 'header', 'greeting', 'chip', 'section', 'section-title', 'hero', 'hero-number', 'tile', 'tile-icon', 'tile-name', 'tile-state', 'slider', 'slider-fill', 'on', 'off']) {
    expect([name, reachable.has(name)]).toEqual([name, true]);
  }
});

test('the buttons Thema and Instellingen, the panels and the dialogs have no part', async () => {
  const app = await launch();
  for (const { element, hosts } of partsIn(app)) {
    expect(hosts.some((host) => /^MH-(THEME-PANEL|SETTINGS-PANEL|DIALOG|SHEET|MENU|ASK-DANGER|HOLD-BUTTON)/.test(host.tagName))).toBe(false);
    const label = `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`;
    if (names(element.getAttribute('part')).includes('rail-item')) expect(label).not.toMatch(/Thema|Instellingen/);
  }
});
