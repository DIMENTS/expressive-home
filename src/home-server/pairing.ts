/** What a paired device may do: use the dashboard, or also arrange it. */
export type Role = 'use' | 'edit';

export interface PairedDevice { id: string; name: string; role: Role; pairedAt: string; lastSeen: string }

/** Where a code is for: to scan or type over on another device, or to open the dashboard where the settings are open. */
export type Slot = 'scan' | 'here';
/** `serial` tells one code from the next, without being one. */
export interface OpenCode { code: string; role: Role; expiresAt: number; serial: string }
/** The newest code that can be used, the one that was used last, and every one that still can be used. */
export interface CodeState { open: Omit<OpenCode, 'code'> | null; used: { serial: string; name: string } | null; serials: string[] }
/** `chosen`: somebody chose the right, it did not come by itself. */
interface KeptCode extends OpenCode { slot: Slot; chosen: boolean }

/** As it is kept: never the token itself, only its fingerprint. */
export interface StoredDevice extends PairedDevice { fingerprint: string }

export type RedeemResult = { ok: true; token: string; device: PairedDevice } | { ok: false; reason: 'code' | 'locked' | 'full' };

export interface PairingDeps {
  load(): unknown;
  save(devices: StoredDevice[]): void;
  now(): number;
  /** A fresh random token. */
  token(): string;
  /** A fresh random code of six digits. */
  code(): string;
  fingerprint(token: string): string;
}

/** How long a code can be used. */
export const CODE_MS = 10 * 60_000;
/** A code with less time left than this is not shown again; whoever scanned it can still use it. */
export const LEFT_MS = 2 * 60_000;
/** After this many wrong codes in a row, pairing is closed for LOCK_MS. */
export const MAX_WRONG = 5;
export const LOCK_MS = 60_000;
export const MAX_DEVICES = 40;
/** As many codes are open at the same time. */
export const MAX_OPEN = 10;
/** "Last seen" is written at most this often per device. */
export const SEEN_MS = 10 * 60_000;
const MAX_NAME = 60;
const NO_NAME = 'Apparaat';

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

function storedDevices(raw: unknown): StoredDevice[] {
  const ids = new Set<string>();
  return (Array.isArray(raw) ? raw : []).flatMap((entry: unknown): StoredDevice[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { id, name, role, pairedAt, lastSeen, fingerprint } = entry as Record<string, unknown>;
    if (!isText(id) || ids.has(id) || !isText(name) || (role !== 'use' && role !== 'edit') || !isText(fingerprint)) return [];
    ids.add(id);
    return [{ id, name, role, pairedAt: isText(pairedAt) ? pairedAt : '', lastSeen: isText(lastSeen) ? lastSeen : '', fingerprint }];
  });
}

/**
 * The devices that may use the dashboard. The owner gets a code in the settings of the app on the hub; a device
 * that gives it becomes paired, with the right that was chosen for that code. A code is kept nowhere.
 */
export function createPairing(deps: PairingDeps) {
  let devices = storedDevices(deps.load());
  /** Every code that was made and not used; the newest last. */
  let codes: KeptCode[] = [];
  const used: Record<Slot, CodeState['used']> = { scan: null, here: null };
  let wrong = 0;
  let lockedUntil = 0;
  const listeners = new Set<(id: string) => void>();
  const roleListeners = new Set<(id: string, role: Role) => void>();
  const plain = ({ fingerprint: _secret, ...device }: StoredDevice): PairedDevice => device;

  function keep(next: StoredDevice[]): void {
    devices = next;
    deps.save(devices);
  }

  /** The device is there now; written at most every SEEN_MS. */
  function seen(device: StoredDevice): void {
    const now = deps.now();
    if (Math.abs(now - Date.parse(device.lastSeen)) > SEEN_MS) keep(devices.map((d) => (d === device ? { ...d, lastSeen: new Date(now).toISOString() } : d)));
  }

  /** The codes that can be used now. */
  function usable(): KeptCode[] {
    codes = codes.filter((made) => deps.now() <= made.expiresAt);
    return codes;
  }

  function freshCode(): string {
    for (let tries = 0; tries < 100; tries += 1) {
      const code = deps.code();
      if (codes.every((made) => made.code !== code)) return code;
    }
    throw new Error('No code to give');
  }

  /** Somebody has to be able to arrange it. */
  const usual = (): Role => (devices.some((device) => device.role === 'edit') ? 'use' : 'edit');

  /**
   * The code to show, for one device. On another device it is the one that is open, as long as there is time to use it; another
   * right counts for it as it is. Where the dashboard itself is opened every device has its own. A code that is not shown any more
   * can be used until its time is over, unless `fresh`: then a new one replaces them all, and what was guessed no longer counts.
   */
  function openCode(slot: Slot, role: Role | null, fresh = false): OpenCode {
    const made = usable().filter((code) => code.slot === slot).at(-1);
    if (made && slot === 'scan' && !fresh && (role !== null || made.expiresAt - deps.now() >= LEFT_MS)) {
      if (role !== null) [made.role, made.chosen] = [role, true];
      else if (!made.chosen) made.role = usual();
      return shown(made);
    }
    if (fresh) {
      codes = codes.filter((code) => code.slot !== slot);
      wrong = 0;
      lockedUntil = 0;
    }
    const chosen = role !== null || (slot === 'scan' && made?.chosen === true);
    const next: KeptCode = { slot, code: freshCode(), role: role ?? (chosen ? made!.role : usual()), chosen, expiresAt: deps.now() + CODE_MS, serial: deps.token().slice(0, 12) };
    codes = [...codes, next].slice(-MAX_OPEN);
    return shown(next);
  }
  const shown = ({ code, role, expiresAt, serial }: KeptCode): OpenCode => ({ code, role, expiresAt, serial });

  return {
    openCode,
    /** A new code for another device, by hand. */
    newCode(role: Role): { code: string; expiresAt: number } {
      const { code, expiresAt } = openCode('scan', role, true);
      return { code, expiresAt };
    },
    /** What became of the codes; never a code itself. */
    codes(): Record<Slot, CodeState> {
      const state = (slot: Slot): CodeState => {
        const own = usable().filter((code) => code.slot === slot);
        const made = own.at(-1);
        return { open: made ? { role: made.role, expiresAt: made.expiresAt, serial: made.serial } : null, used: used[slot], serials: own.map((code) => code.serial) };
      };
      return { scan: state('scan'), here: state('here') };
    },
    redeem(code: string, name: string): RedeemResult {
      const now = deps.now();
      if (now < lockedUntil) return { ok: false, reason: 'locked' };
      // without a code there is nothing to guess: that does not count
      if (usable().length === 0) return { ok: false, reason: 'code' };
      const made = codes.find((one) => one.code === code);
      if (!made) {
        wrong += 1;
        if (wrong >= MAX_WRONG) {
          wrong = 0;
          lockedUntil = now + LOCK_MS;
        }
        return { ok: false, reason: 'code' };
      }
      if (devices.length >= MAX_DEVICES) return { ok: false, reason: 'full' };
      const { role, serial, slot } = made;
      codes = codes.filter((one) => one !== made);
      wrong = 0;
      const token = deps.token();
      const at = new Date(now).toISOString();
      const fingerprint = deps.fingerprint(token);
      const device: StoredDevice = { id: fingerprint.slice(0, 16), name: [...name.trim()].slice(0, MAX_NAME).join('').trim() || NO_NAME, role, pairedAt: at, lastSeen: at, fingerprint };
      keep([...devices, device]);
      used[slot] = { serial, name: device.name };
      return { ok: true, token, device: plain(device) };
    },
    /** The device a token belongs to; null for any other. */
    find(token: string): PairedDevice | null {
      if (token === '') return null;
      const fingerprint = deps.fingerprint(token);
      const device = devices.find((d) => d.fingerprint === fingerprint);
      if (!device) return null;
      seen(device);
      return plain(device);
    },
    /** A device that only listens is there too. */
    touch(id: string): void {
      const device = devices.find((d) => d.id === id);
      if (device) seen(device);
    },
    list: (): PairedDevice[] => devices.map(plain),
    remove(id: string): boolean {
      if (!devices.some((d) => d.id === id)) return false;
      keep(devices.filter((d) => d.id !== id));
      for (const listener of [...listeners]) listener(id);
      return true;
    },
    /** What a device may do from now on. */
    setRole(id: string, role: Role): boolean {
      const device = devices.find((d) => d.id === id);
      if (!device) return false;
      if (device.role === role) return true;
      keep(devices.map((d) => (d === device ? { ...d, role } : d)));
      for (const listener of [...roleListeners]) listener(id, role);
      return true;
    },
    /** Hears of a device that may do something else from now on. */
    onRole(listener: (id: string, role: Role) => void): () => void {
      roleListeners.add(listener);
      return () => { roleListeners.delete(listener); };
    },
    /** Hears of a device that is taken away. */
    subscribe(listener: (id: string) => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type Pairing = ReturnType<typeof createPairing>;
