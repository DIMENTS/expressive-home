import type { WidgetTileSpec, TileSize } from '../dashboard/types';
import type { MessageKey, Translate } from '../i18n/index';
import { isLibraryIcon } from '../ui/icons/library';
import { ICONS, type IconName } from '../ui/icons/icons';

/** A widget the app brings itself. */
export interface BuiltInWidget { id: 'clock' | 'note' | 'board' | 'gauge' | 'countdown' | 'group' | 'weather' | 'energy'; icon: IconName; name: MessageKey; about: MessageKey; sizes: readonly TileSize[] }

export const BUILT_IN_WIDGETS: readonly BuiltInWidget[] = [
  { id: 'clock', icon: 'schedule', name: 'widget.clock', about: 'widget.clockAbout', sizes: ['wide', 'single'] },
  { id: 'note', icon: 'sticky_note_2', name: 'widget.note', about: 'widget.noteAbout', sizes: ['single', 'wide'] },
  { id: 'board', icon: 'arrow_forward', name: 'widget.board', about: 'widget.boardAbout', sizes: ['single', 'wide'] },
  { id: 'gauge', icon: 'speed', name: 'widget.gauge', about: 'widget.gaugeAbout', sizes: ['single', 'wide'] },
  { id: 'countdown', icon: 'hourglass_top', name: 'widget.countdown', about: 'widget.countdownAbout', sizes: ['single', 'wide'] },
  { id: 'group', icon: 'light_group', name: 'widget.group', about: 'widget.groupAbout', sizes: ['single', 'wide'] },
  { id: 'weather', icon: 'partly_cloudy_day', name: 'widget.weather', about: 'widget.weatherAbout', sizes: ['wide', 'single'] },
  { id: 'energy', icon: 'bolt', name: 'widget.energy', about: 'widget.energyAbout', sizes: ['wide', 'single'] },
];

export const builtInWidget = (id: string): BuiltInWidget | undefined => BUILT_IN_WIDGETS.find((widget) => widget.id === id);

/** Looks up something of an own widget, or undefined when there is no such widget. */
export type OwnLookup = (widget: string) => string | undefined;

/** The name of a placed widget: the owner's own, the title of a note, the widget's own name, or "Widget". */
export function widgetName(spec: WidgetTileSpec, t: Translate, ownName: OwnLookup = () => undefined): string {
  if (spec.label) return spec.label;
  const title = spec.settings['title'];
  if (['note', 'countdown', 'group'].includes(spec.widget) && typeof title === 'string' && title.trim() !== '') return title.trim();
  const builtIn = builtInWidget(spec.widget);
  return builtIn ? t(builtIn.name) : ownName(spec.widget) ?? t('widget.unnamed');
}

/** The icon of a placed widget: the owner's own, the one it brings, or the icon for widgets. */
export function widgetIcon(spec: WidgetTileSpec, ownIcon: OwnLookup = () => undefined): IconName {
  if (spec.icon && isLibraryIcon(spec.icon)) return spec.icon;
  const builtIn = builtInWidget(spec.widget);
  if (builtIn) return builtIn.icon;
  const own = ownIcon(spec.widget);
  return own !== undefined && Object.hasOwn(ICONS, own) ? own as IconName : 'widgets';
}
