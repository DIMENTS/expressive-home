import type { WidgetSettingValue, WidgetTileSpec } from '../dashboard/types';
import type { Translate } from '../i18n/index';
import { widgetText, type WidgetFile } from './widget-file';
import { APP_DEVICES, type AppWidgetRow } from './app-widget-link';

export type SettingType = 'text' | 'textarea' | 'number' | 'checkbox' | 'dropdown' | 'device' | 'capability' | 'flow' | 'board' | 'devices' | 'anyDevices' | 'date' | 'autocomplete';

/** One setting of a widget as the window "Widget instellen" shows it. */
export interface SettingDef {
  id: string;
  type: SettingType;
  title: string;
  default?: WidgetSettingValue;
  /** For a dropdown. */
  values?: { id: string; title: string }[];
  min?: number;
  max?: number;
  /** For a capability: the setting that holds its device. */
  device?: string;
}

/** The settings of the widgets of the app, in the language of the app. */
export function builtInSettings(widget: string, t: Translate): SettingDef[] {
  switch (widget) {
    case 'clock': return [
      { id: 'date', type: 'checkbox', title: t('widget.setting.date'), default: true },
      { id: 'seconds', type: 'checkbox', title: t('widget.setting.seconds'), default: false },
    ];
    case 'note': return [
      { id: 'title', type: 'text', title: t('widget.setting.title'), default: '' },
      { id: 'text', type: 'textarea', title: t('widget.setting.text'), default: '' },
      { id: 'accent', type: 'checkbox', title: t('widget.setting.accent'), default: false },
    ];
    case 'board': return [{ id: 'board', type: 'board', title: t('widget.setting.board'), default: null }];
    case 'gauge': return [
      { id: 'device', type: 'device', title: t('widget.setting.device') },
      { id: 'capability', type: 'capability', device: 'device', title: t('widget.setting.value') },
      { id: 'min', type: 'number', title: t('widget.setting.min'), default: 0 },
      { id: 'max', type: 'number', title: t('widget.setting.max'), default: 100 },
    ];
    case 'countdown': return [
      { id: 'title', type: 'text', title: t('widget.setting.title'), default: '' },
      { id: 'date', type: 'date', title: t('widget.setting.date2') },
    ];
    case 'group': return [
      { id: 'title', type: 'text', title: t('widget.setting.title'), default: '' },
      { id: 'devices', type: 'devices', title: t('widget.setting.devices') },
    ];
    case 'weather': return [{ id: 'days', type: 'checkbox', title: t('widget.setting.days'), default: false }];
    case 'energy': return [
      { id: 'period', type: 'dropdown', title: t('widget.setting.period'), default: 'day', values: [{ id: 'day', title: t('widget.period.day') }, { id: 'week', title: t('widget.period.week') }, { id: 'month', title: t('widget.period.month') }] },
      { id: 'devices', type: 'checkbox', title: t('widget.setting.perDevice'), default: false },
    ];
    default: return [];
  }
}

/** What a placed widget has for one setting: its own value, or the default. */
export function settingValue(spec: WidgetTileSpec, def: SettingDef): WidgetSettingValue {
  return Object.hasOwn(spec.settings, def.id) ? spec.settings[def.id]! : def.default ?? null;
}

/** Whether a widget wants its settings before it is any use: everything but the clock, the weather, the energy and a widget of an app. */
export const wantsSettings = (widget: string): boolean => !['clock', 'weather', 'energy'].includes(widget) && !widget.startsWith('app:');

/** The settings of an own widget as its file describes them, in the language of the app. */
export function ownSettings(widget: WidgetFile, language: string): SettingDef[] {
  return widget.settings.map((setting) => ({
    id: setting.id, type: setting.type, title: widgetText(setting.title, language),
    ...(setting.default === undefined ? {} : { default: setting.default }),
    ...(setting.values ? { values: setting.values.map((value) => ({ id: value.id, title: widgetText(value.title, language) })) } : {}),
    ...(setting.min === undefined ? {} : { min: setting.min }),
    ...(setting.max === undefined ? {} : { max: setting.max }),
    ...(setting.device === undefined ? {} : { device: setting.device }),
  }));
}

/** The settings of a widget of an app that the dashboard can show, and its devices; others are left to the app's defaults. */
export function appSettings(row: AppWidgetRow, language: string, devicesTitle: string): SettingDef[] {
  const kept = (row.settings ?? []).flatMap((setting): SettingDef[] => {
    if (!['text', 'textarea', 'number', 'checkbox', 'dropdown', 'autocomplete'].includes(setting.type)) return [];
    return [{
      id: setting.id, type: setting.type as SettingType, title: widgetText(setting.title, language) || setting.id,
      ...(setting.value === undefined ? {} : { default: setting.value }),
      ...(setting.values ? { values: setting.values.map((value) => ({ id: value.id, title: widgetText(value.title, language) || value.id })) } : {}),
    }];
  });
  return row.devices ? [...kept, { id: APP_DEVICES, type: row.devices.singular ? 'device' : 'anyDevices', title: devicesTitle }] : kept;
}
