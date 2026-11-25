import { expect, test } from 'vitest';
import { ICON_NAMES, ICONS } from '../../src/ui/icons/icons';
import { ICON_LIBRARY } from '../../src/ui/icons/library';

/** The icons the app itself draws; the library adds those the owner can choose. */
const OWN = ['dashboard', 'palette', 'settings', 'home', 'cloud', 'cloud_off', 'progress_activity', 'warning', 'visibility', 'science', 'lightbulb',
  'power', 'toggle_on', 'thermostat', 'humidity_percentage', 'co2', 'air', 'water_drop', 'shield', 'person', 'sensors', 'door_front', 'detector_smoke',
  'water_damage', 'lock', 'mode_heat', 'mode_fan', 'touch_app', 'settings_remote', 'satellite_alt', 'electrical_services', 'bolt', 'battery_5_bar',
  'battery_alert', 'solar_power', 'trending_up', 'trending_down', 'play_arrow', 'play_circle', 'check_circle', 'error', 'cancel', 'link_off', 'more_vert',
  'close', 'check', 'chevron_right', 'colorize', 'light_mode', 'dark_mode', 'brightness_auto', 'view_agenda', 'density_small', 'logout', 'key', 'key_off',
  'tablet', 'bedtime', 'link', 'lan', 'wifi_off', 'devices_other', 'category', 'info', 'sync', 'radio_button_checked', 'radio_button_unchecked', 'live_tv',
  // a house
  'blinds', 'curtains', 'vertical_shades', 'roller_shades', 'remove', 'keyboard_arrow_up', 'keyboard_arrow_down', 'stop', 'skip_previous', 'pause', 'skip_next', 'volume_up', 'volume_off', 'shuffle', 'repeat', 'repeat_one',
  'garage_home', 'notifications_active', 'countertops', 'shield_lock', 'refresh', 'lock_open', 'ac_unit', 'tv', 'speaker', 'music_note', 'power_settings_new',
  // the edit mode
  'edit', 'add', 'add_circle', 'undo', 'search', 'delete', 'drag_indicator', 'drive_file_move', 'arrow_back', 'arrow_forward', 'arrow_upward', 'arrow_downward', 'download', 'upload', 'restart_alt', 'check_box', 'check_box_outline_blank',
  // themes
  'share', 'content_copy', 'history', 'contrast', 'verified_user',
  // widgets
  'sticky_note_2', 'block', 'code', 'apps', 'speed', 'hourglass_top'];

const EXPECTED = [...new Set([...OWN, ...ICON_LIBRARY.flatMap((g) => g.icons.map((icon) => icon.name))])];

test('the module has exactly the icons the app uses and the library offers', () => {
  expect([...ICON_NAMES].sort()).toEqual([...EXPECTED].sort());
  expect(Object.keys(ICONS).sort()).toEqual([...EXPECTED].sort());
});

test('every icon has an outlined and a filled drawing', () => {
  for (const [name, icon] of Object.entries(ICONS)) {
    expect([name, icon.outline.includes('<svg')]).toEqual([name, true]);
    expect([name, icon.fill.includes('<svg')]).toEqual([name, true]);
  }
});

test('the two drawings of an icon differ', () => {
  expect(ICONS.lightbulb.outline).not.toBe(ICONS.lightbulb.fill);
});

test('no drawing carries a style attribute, which the content security policy would block', () => {
  for (const icon of Object.values(ICONS)) expect(`${icon.outline}${icon.fill}`).not.toMatch(/\sstyle=/);
});
