import { coverOf, coverRestsAt, coverState, type Cover } from '../../controls/cover';
import type { Device } from '../../homey/types';
import type { Translate } from '../../i18n/index';

/** A part as a whole percentage: not quite open or closed is not said to be. */
export const partly = (part: number): number => (part <= 0 ? 0 : part >= 1 ? 100 : Math.min(99, Math.max(1, Math.round(part * 100))));

/** "60% open", "Dicht" */
export function coverText(part: number | null, awning: boolean, t: Translate): string {
  if (part === null) return t('cover.unknown');
  const percent = partly(part);
  if (percent === 0) return t(awning ? 'awning.in' : 'cover.closed');
  if (percent === 100) return t(awning ? 'awning.out' : 'cover.open');
  return t(awning ? 'awning.part' : 'cover.part', { n: percent });
}

/** What its buttons and its slider are called. */
export function coverNames(device: Device, { awning }: Cover, t: Translate): { up: string; stop: string; down: string; position: string } {
  const { name } = device;
  return {
    up: t(awning ? 'awning.label.in' : 'cover.label.open', { name }), stop: t('cover.label.stop', { name }),
    down: t(awning ? 'awning.label.out' : 'cover.label.close', { name }), position: t('cover.label.position', { name }),
  };
}

/** How long it is said to move at the most, when nothing more is reported; null when it does not move. */
export function coverWait(device: Device | undefined, now = Date.now()): number | null {
  const cover = device ? coverOf(device) : null;
  const rests = cover && coverState(cover, now).moving ? coverRestsAt(cover) : null;
  return rests === null ? null : Math.max(0, rests - now);
}
