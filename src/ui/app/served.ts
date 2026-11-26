import type { HomeyClient } from '../../homey/client';
import { createServedClient } from '../../served/client';
import { createLink } from '../../served/link';
import { kindOf, takeScanned } from '../../served/pair-link';
import { createServedStore } from '../../served/store';
import { STORAGE_KEY } from '../../storage/local-store';
import { LOOKS_KEY, createLooksStore } from '../../storage/looks-store';
import { createLooksSync } from '../../served/looks-sync';
import { createServedWidgets } from '../../widgets/library-source';
import { createAppLive } from '../../widgets/app-live';
import type { LooksDoc } from '../../theme/looks-doc';
import type { AppEnvironment } from './app';
import { safeStorage } from './safe-storage';

/** A tab that is out of sight for this long gives its live stream back: a browser keeps only six connections with one address. */
export const HIDDEN_MS = 60_000;

/** The environment of a page that the app on the hub served: everything goes through that app. */
export function servedEnvironment(createDemoClient: AppEnvironment['createDemoClient']): AppEnvironment {
  const link = createLink({
    fetch: (path, init) => window.fetch(path, init),
    openStream: (path) => new EventSource(path),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    now: () => Date.now(),
  });
  const served = createServedStore(safeStorage(() => window.localStorage), link);
  /** The version of the dashboard that this page is. */
  let build: string | null = null;
  let newBuild: () => void = () => {};
  link.on('build', (next) => {
    const other = build !== null && next !== build;
    build = next;
    if (other) newBuild();
  });
  const scanned = takeScanned(window.location, window.history);
  let hidden: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (hidden !== null) window.clearTimeout(hidden);
    hidden = null;
    if (document.visibilityState === 'hidden') {
      served.flush();
      hidden = window.setTimeout(() => link.sleep(), HIDDEN_MS);
    } else {
      link.wake();
    }
  });
  window.addEventListener('pagehide', () => served.flush(true));
  for (const back of ['pageshow', 'online']) window.addEventListener(back, () => link.wake());

  // the looks of the house: what was heard before the app listened is given to it when it does
  let lastLooks: LooksDoc | null = null;
  let onLooks: (doc: LooksDoc) => void = () => {};
  let onRefused: () => void = () => {};
  let onTooBig: () => void = () => {};
  const looks = createLooksSync({
    link,
    adopt: (doc) => { lastLooks = doc; onLooks(doc); },
    refused: () => onRefused(),
    tooBig: () => onTooBig(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  });

  // the live news of apps for their widgets on this page
  const appLive = createAppLive({
    link, random: () => Math.random(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  });

  return {
    configStore: served.store,
    looksStore: createLooksStore(safeStorage(() => window.localStorage)),
    createRealClient: () => createServedClient(link),
    createDemoClient,
    schedule: (flush) => { requestAnimationFrame(flush); },
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    browserLanguages: navigator.languages?.length ? [...navigator.languages] : [navigator.language],
    watchStored: (changed) => {
      const stop = served.onChanged(changed);
      // the theme and the language of this device, chosen in another tab
      const onStorage = (event: StorageEvent): void => { if (event.key === STORAGE_KEY || event.key === LOOKS_KEY) changed(); };
      window.addEventListener('storage', onStorage);
      return () => {
        stop();
        window.removeEventListener('storage', onStorage);
      };
    },
    served: {
      pair: (code, name) => served.pair(code, name),
      mayArrange: () => served.mayArrange(),
      knownRole: () => served.knownRole(),
      widgets: createServedWidgets(link),
      appWidgets: () => link.request('GET', 'api/app-widgets'),
      appWidgetApi: (ref, method, route, body) => link.request('POST', 'api/app-widget-api', { ref, method, route, body }),
      appLive: (ref, listener) => appLive.listen(ref, listener),
      appWidgetSearch: (ref, setting, query) => link.request('GET', `api/app-widget-autocomplete?${new URLSearchParams({ ref, setting, query }).toString()}`),
      sendLooks: (ops) => looks.send(ops),
      onLooks: (listener) => { onLooks = listener; if (lastLooks) listener(lastLooks); },
      onLooksRefused: (listener) => { onRefused = listener; },
      onLooksTooBig: (listener) => { onTooBig = listener; },
      onConflict: (listener) => served.onConflict(listener),
      onUnsaved: (listener) => served.onUnsaved(listener),
      onNight: (listener) => { link.on('night', (word) => listener(word ? { night: word.night, at: Date.now() - word.age } : null)); },
      onNewBuild: (listener) => { newBuild = listener; },
      settled: () => served.settled(),
      reload: () => window.location.reload(),
      scanned: () => scanned,
      onScanned: (listener) => {
        // scanned again in the tab where the page is open
        window.addEventListener('hashchange', () => {
          const code = takeScanned(window.location, window.history);
          if (code !== null) listener(code);
        });
      },
      kind: () => kindOf(typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches, Math.min(window.screen.width, window.screen.height)),
    },
  };
}
