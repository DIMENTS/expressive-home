type SimpleStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The browser's storage, or, when the browser refuses access (some private windows), a stand-in that
 * holds nothing and refuses to write: the app then works for this session and says once that saving failed.
 */
export function safeStorage(open: () => SimpleStorage): SimpleStorage {
  try {
    return open();
  } catch {
    return {
      getItem: () => null,
      setItem: () => { throw new Error('storage unavailable'); },
      removeItem: () => {},
    };
  }
}
