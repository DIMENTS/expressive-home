// A code that was scanned: it stands behind the # of the address, which a browser never sends anywhere.

/** What a device is, as far as can be told; only for a name that can be changed. */
export type DeviceKind = 'phone' | 'tablet' | 'laptop';

const MARK = '#pair=';
/** A screen that is touched with a shorter side below this is a phone. */
const TABLET_SIDE_PX = 600;

/** The code that the page was opened with; it is taken out of the address at once. Null: there is none. */
export function takeScanned(location: Pick<Location, 'hash' | 'pathname' | 'search'>, history: Pick<History, 'replaceState' | 'state'>): string | null {
  const { hash, pathname, search } = location;
  if (!hash.startsWith(MARK)) return null;
  history.replaceState(history.state, '', pathname + search);
  const code = hash.slice(MARK.length);
  return /^[0-9]{6}$/.test(code) ? code : null;
}

/** The kind of a device by its pointer (a finger or not) and the shorter side of its screen. */
export function kindOf(touched: boolean, side: number): DeviceKind {
  return !touched ? 'laptop' : side < TABLET_SIDE_PX ? 'phone' : 'tablet';
}
