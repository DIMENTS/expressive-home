// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { isFramed } from '../../../src/ui/app/framed';
import { colorTokens } from '../../../src/theme/engine';
import type { MhApp } from '../../../src/ui/app/app';

// Another website can put the dashboard in a frame and lay something over it. Pages cannot forbid that by a header,
// so the app refuses itself: in a frame it only says how to open it in a tab of its own, and touches nothing.

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('a page is in a frame when its top window is another one, or when asking that fails', () => {
  const own: { self?: unknown; top?: unknown } = {};
  own.self = own;
  own.top = own;
  expect(isFramed(own as Window)).toBe(false);
  expect(isFramed({ self: {} as Window, top: {} as Window } as Window)).toBe(true);
  const odd = { self: {} as Window } as Window;
  Object.defineProperty(odd, 'top', { get: () => { throw new Error('no'); } });
  expect(isFramed(odd)).toBe(true);
  expect(isFramed({ self: {} as Window, top: null } as unknown as Window)).toBe(true);
});

test('this test page itself is not in a frame', () => {
  expect(isFramed(window)).toBe(false);
});

async function framedApp(): Promise<MhApp & { updateComplete: Promise<unknown> }> {
  await import('../../../src/ui/app/app');
  const app = document.createElement('mh-app') as MhApp & { updateComplete: Promise<unknown> };
  app.inFrame = true;
  // building the environment would already read and listen: in a frame it is never built
  app.environment = new Proxy({}, { get: () => { throw new Error('the environment was used'); } }) as MhApp['environment'];
  document.body.append(app);
  await app.updateComplete;
  return app;
}

test('in a frame the app reads nothing from storage, connects to nothing, and only shows how to open it', async () => {
  await import('../../../src/ui/app/app');
  const storage = vi.spyOn(window, 'localStorage', 'get');
  const session = vi.spyOn(window, 'sessionStorage', 'get');
  const app = await framedApp();
  const screen = app.shadowRoot!.querySelector('mh-framed-screen') as HTMLElement & { address: string } | null;
  expect(screen).not.toBeNull();
  expect(screen!.address).toBe(`${location.origin}${location.pathname}`);
  expect(app.shadowRoot!.querySelector('mh-connect-screen, mh-pair-screen, mh-dashboard, mh-rest-screen')).toBeNull();
  expect([storage.mock.calls.length, session.mock.calls.length]).toEqual([0, 0]);
  app.remove();
  document.body.append(app);
  app.remove();
  expect([storage.mock.calls.length, session.mock.calls.length]).toEqual([0, 0]);
});

test('in a frame the page has the default theme, light or dark as the system is', async () => {
  const app = await framedApp();
  expect(document.documentElement.style.getPropertyValue('--c-surface')).toBe(colorTokens('#3b6939', document.documentElement.dataset['mode'] === 'dark' ? 'dark' : 'light', 0)['--c-surface']);
  expect(app.shadowRoot!.querySelector('mh-framed-screen')).not.toBeNull();
});

test('the card is in the language of the browser, for the screen reader too', async () => {
  const app = await framedApp();
  const screen = app.shadowRoot!.querySelector('mh-framed-screen') as HTMLElement & { t: { language: string } };
  expect(document.documentElement.lang).toBe(screen.t.language);
});

test('it shows the address of the page, not what the other website put behind it', async () => {
  location.hash = '#Typ-hier-iets-anders';
  const app = await framedApp();
  const screen = app.shadowRoot!.querySelector('mh-framed-screen') as HTMLElement & { address: string };
  expect(screen.address).toBe(`${location.origin}${location.pathname}`);
  expect(screen.address).not.toMatch(/[#?]/);
  location.hash = '';
});

test('the card follows the system when it turns dark', async () => {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const media = { matches: false, addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => { listeners.add(listener); }, removeEventListener: () => {} };
  vi.stubGlobal('matchMedia', () => media);
  await framedApp();
  const surface = () => document.documentElement.style.getPropertyValue('--c-surface');
  expect(surface()).toBe(colorTokens('#3b6939', 'light', 0)['--c-surface']);
  media.matches = true;
  for (const listener of listeners) listener({ matches: true });
  expect(surface()).toBe(colorTokens('#3b6939', 'dark', 0)['--c-surface']);
});
