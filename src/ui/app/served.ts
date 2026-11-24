import type { HomeyClient } from '../../homey/client';
import { createServedClient } from '../../served/client';
import { createLink } from '../../served/link';
import { kindOf, takeScanned } from '../../served/pair-link';
import { createServedStore } from '../../served/store';
import { STORAGE_KEY } from '../../storage/local-store';
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

  return {
    configStore: served.store,
    createRealClient: () => createServedClient(link),
    createDemoClient,
    schedule: (flush) => { requestAnimationFrame(flush); },
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    browserLanguages: navigator.languages?.length ? [...navigator.languages] : [navigator.language],
    watchStored: (changed) => {
      const stop = served.onChanged(changed);
      // the theme and the language of this device, chosen in another tab
      const onStorage = (event: StorageEvent): void => { if (event.key === STORAGE_KEY) changed(); };
      window.addEventListener('storage', onStorage);
      return () => {
        stop();
        window.removeEventListener('storage', onStorage);
      };
    },
    served: {
      pair: (code, name) => served.pair(code, name),
      mayArrange: () => served.mayArrange(),
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
