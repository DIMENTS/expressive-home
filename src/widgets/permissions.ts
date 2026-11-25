import type { WidgetFile } from './widget-file';

/** How many devices and flows a widget asks for when it is placed: what it may use, before it is taken in. */
export function chosenKinds(widget: WidgetFile): { devices: number; flows: number } {
  return { devices: widget.settings.filter((s) => s.type === 'device').length, flows: widget.settings.filter((s) => s.type === 'flow').length };
}
