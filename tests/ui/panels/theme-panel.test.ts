// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/panels/theme-panel';
import type { MhThemePanel } from '../../../src/ui/panels/theme-panel';
import { rustigExpressive } from '../../../src/theme/rustig-expressive';
import type { ThemeSettings } from '../../../src/theme/types';
import { inside, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const theme: ThemeSettings = { seed: '#3b6939', mode: 'light', density: 'comfortable' };
const open = () => mount<MhThemePanel>('mh-theme-panel', { open: true, theme, presets: rustigExpressive.color.presets });
const swatches = (panel: MhThemePanel) => inside(panel, 'mh-swatch-group').shadowRoot!;

test('choosing a preset reports the new theme and marks the swatch', async () => {
  const panel = await open();
  const changes = record<ThemeSettings>(panel, 'change');
  const radios = [...swatches(panel).querySelectorAll<HTMLElement>('[role="radio"]')];
  expect(radios).toHaveLength(5);
  expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false']);
  expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Bosgroen', 'Blauw', 'Paars', 'Terracotta', 'Framboos']);
  radios[1]!.click();
  expect(changes).toEqual([{ seed: '#3a5ba9', mode: 'light', density: 'comfortable' }]);
  panel.theme = changes[0]!;
  await settle(panel);
  await settle(inside(panel, 'mh-swatch-group') as unknown as { updateComplete: Promise<unknown> });
  expect(swatches(panel).querySelectorAll('[role="radio"]')[1]!.getAttribute('aria-checked')).toBe('true');
});

test('the colour picker of the system sets a free colour', async () => {
  const panel = await open();
  const changes = record<ThemeSettings>(panel, 'change');
  const picker = swatches(panel).querySelector<HTMLInputElement>('input[type="color"]')!;
  expect(swatches(panel).querySelector('.custom')!.getAttribute('aria-label')).toBe('Eigen kleur kiezen');
  picker.value = '#123456';
  picker.dispatchEvent(new Event('input', { bubbles: true }));
  expect(changes).toEqual([{ seed: '#123456', mode: 'light', density: 'comfortable' }]);
});

test('light, dark and automatic, and comfortable and compact', async () => {
  const panel = await open();
  const changes = record<ThemeSettings>(panel, 'change');
  const groups = [...panel.shadowRoot!.querySelectorAll('mh-choice-group')];
  groups[0]!.dispatchEvent(new CustomEvent('change', { detail: { value: 'auto' }, bubbles: true, composed: true }));
  groups[1]!.dispatchEvent(new CustomEvent('change', { detail: { value: 'compact' }, bubbles: true, composed: true }));
  expect(changes).toEqual([{ ...theme, mode: 'auto' }, { ...theme, density: 'compact' }]);
});

test('the theme panel is a sheet named Thema', async () => {
  const panel = await open();
  const sheet = inside(panel, 'mh-sheet') as HTMLElement & { heading: string; open: boolean };
  expect(sheet.heading).toBe('Thema');
  expect(sheet.open).toBe(true);
  const closes = record(panel, 'close');
  sheet.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  expect(closes).toHaveLength(1);
});

test('on a phone there is no choice between roomy and compact, and what the owner chose is left alone', async () => {
  const groups = (panel: MhThemePanel) => [...panel.shadowRoot!.querySelectorAll('mh-choice-group')] as (HTMLElement & { label: string })[];
  const wide = await open();
  expect(groups(wide).map((g) => g.getAttribute('label'))).toEqual(['Licht of donker', 'Weergave']);
  const panel = await mount<MhThemePanel>('mh-theme-panel', { open: true, theme: { ...theme, density: 'compact' }, presets: rustigExpressive.color.presets, phone: true });
  expect(groups(panel).map((g) => g.getAttribute('label'))).toEqual(['Licht of donker']);
  const changes = record<ThemeSettings>(panel, 'change');
  groups(panel)[0]!.dispatchEvent(new CustomEvent('change', { detail: { value: 'dark' }, bubbles: true, composed: true }));
  expect(changes).toEqual([{ ...theme, density: 'compact', mode: 'dark' }]);
});
