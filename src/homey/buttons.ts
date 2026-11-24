// The buttons of the dashboard that start a flow: every name that somebody fills in on the flow card of the app.
// To the dashboard they are flows, with an id of their own.

/** The flow card of the app on the hub. */
export const BUTTON_CARD = 'dashboard_button';
const APP = 'homey:app:app.expressive.home';
const PREFIX = 'button:';
/** As long as a name can be. */
const MAX_NAME = 60;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** The name as it is shown; null when it is none. With a tag in it there is no telling what it will be, so nobody can press it. */
export function buttonName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  return name === '' || name.includes('[[') || [...name].length > MAX_NAME ? null : name;
}

/** The same for every spelling of a name that counts as the same. */
export const buttonKey = (name: string): string => name.toLowerCase();

export const buttonId = (name: string): string => PREFIX + buttonKey(name);

export const isButton = (flowId: string): boolean => flowId.startsWith(PREFIX);

function nameOn(card: unknown): string | null {
  if (!isRecord(card)) return null;
  const own = card['id'] === `${APP}:${BUTTON_CARD}` || (card['uri'] === APP && card['id'] === BUTTON_CARD);
  return own && isRecord(card['args']) ? buttonName(card['args']['button']) : null;
}

/** The names on the cards that a flow of the hub begins with, as the hub tells the flow. */
export function buttonsIn(flow: unknown): string[] {
  if (!isRecord(flow)) return [];
  const cards = isRecord(flow['cards']) ? Object.values(flow['cards']).filter((card) => isRecord(card) && card['type'] === 'trigger') : [];
  const names = new Map<string, string>();
  for (const card of [flow['trigger'], ...cards]) {
    const name = nameOn(card);
    if (name !== null && !names.has(buttonKey(name))) names.set(buttonKey(name), name);
  }
  return [...names.values()];
}
