import type { HubLayout } from '../layout/types';

/** What the card "Verder inrichten" offers after a first start. */
export type NextStep = 'edit' | 'widget' | 'wall' | 'pair' | 'away';
const ALL: readonly NextStep[] = ['edit', 'widget', 'wall', 'pair', 'away'];

/** Whether the card was taken away, and what of it was done. */
export interface NextState { dismissed: boolean; done: NextStep[] }

/** Where the card is kept, in the browser of the device that did the first start; absent: there is no card. */
export const NEXT_KEY = 'dashboard.next';

export const startNext = (): NextState => ({ dismissed: false, done: [] });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function readNext(text: string | null): NextState | null {
  if (text === null) return null;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!isRecord(raw) || typeof raw['dismissed'] !== 'boolean' || !Array.isArray(raw['done'])) return null;
  const done = ALL.filter((step) => (raw['done'] as unknown[]).includes(step));
  return { dismissed: raw['dismissed'], done };
}

export const writeNext = (state: NextState): string => JSON.stringify(state);

/** The same state when it was done already. */
export const withDone = (state: NextState, step: NextStep): NextState => (state.done.includes(step) ? state : { ...state, done: [...state.done, step] });

/** What this device can do: arranging and a wall tablet are not for a phone, arranging only for a device that may. */
export function nextSteps({ phone, mayArrange }: { phone: boolean; mayArrange: boolean }): NextStep[] {
  return ALL.filter((step) => (step === 'edit' || step === 'widget' ? !phone && mayArrange : step === 'wall' ? !phone : true));
}

/** A widget stands on one of the dashboards. */
export const hasWidget = (layout: HubLayout): boolean =>
  layout.dashboards.some((board) => (board.sections ?? []).some((section) => section.tiles.some((tile) => tile.spec.kind === 'widget')));
