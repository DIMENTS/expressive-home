// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { createTranslate } from '../../../src/i18n';
import { ICON_LIBRARY } from '../../../src/ui/icons/library';
import '../../../src/ui/parts/icon-picker';
import { MhIconPicker } from '../../../src/ui/parts/icon-picker';
import { key, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const picker = (props: Record<string, unknown> = {}) => mount<MhIconPicker>('mh-icon-picker', { value: null, auto: 'lightbulb', ...props });
const radios = (host: MhIconPicker) => [...host.shadowRoot!.querySelectorAll<HTMLElement>('[role="radio"]')];
const groups = (host: MhIconPicker) => [...host.shadowRoot!.querySelectorAll('.group')].map((g) => g.textContent!.trim());
async function search(host: MhIconPicker, value: string) {
  host.shadowRoot!.querySelector('mh-text-field')!.dispatchEvent(new CustomEvent('input', { detail: { value } }));
  await settle(host);
}

test('the icon picker offers Automatisch first and reports null for it', async () => {
  const host = await picker({ value: 'bed' });
  const [first, ...rest] = radios(host);
  expect(first!.textContent).toContain('Automatisch');
  expect(first!.textContent).toContain('Het icoon dat de app kiest');
  expect(first!.querySelector('mh-icon')!.getAttribute('name')).toBe('lightbulb');
  expect(first!.getAttribute('aria-checked')).toBe('false');
  expect(rest).toHaveLength(ICON_LIBRARY.flatMap((g) => g.icons).length);
  const changes = record(host, 'change');
  first!.click();
  expect(changes).toEqual([{ icon: null }]);
});

test('without an automatic icon there is no Automatisch', async () => {
  const host = await picker({ auto: null, value: 'view_agenda' });
  expect(host.shadowRoot!.textContent).not.toContain('Automatisch');
});

test('the seven groups stand under their titles', async () => {
  expect(groups(await picker())).toEqual(['Ruimtes', 'Licht en stroom', 'Klimaat en water', 'Beveiliging en mensen', 'Media en netwerk', 'Buiten en weer', 'Overig']);
  expect(groups(await picker({ t: createTranslate('en') }))).toEqual(['Rooms', 'Light and power', 'Climate and water', 'Security and people', 'Media and network', 'Outdoors and weather', 'Other']);
});

test('searching narrows the groups; no match says so', async () => {
  const host = await picker();
  const field = host.shadowRoot!.querySelector('mh-text-field') as HTMLElement & { label: string; placeholder: string };
  expect(field.placeholder).toBe('Zoek een icoon, bijvoorbeeld lamp of water');
  await search(host, 'water');
  expect(groups(host)).toContain('Klimaat en water');
  expect(groups(host)).not.toContain('Media en netwerk');
  expect(radios(host).map((r) => r.dataset['icon'])).toEqual(expect.arrayContaining(['water_drop', 'water_pump']));
  // Automatisch is only there without a search
  expect(host.shadowRoot!.textContent).not.toContain('Automatisch');
  await search(host, 'zzzz');
  expect(radios(host)).toEqual([]);
  expect(host.shadowRoot!.querySelector('[role="status"]')!.textContent).toBe('Geen icoon met dat woord.');
  await search(host, '');
  expect(groups(host)).toHaveLength(7);
});

test('choosing an icon reports its name and marks it chosen', async () => {
  const host = await picker();
  const changes = record(host, 'change');
  const bed = radios(host).find((r) => r.dataset['icon'] === 'bed')!;
  bed.click();
  await settle(host);
  expect(changes).toEqual([{ icon: 'bed' }]);
  expect(radios(host).filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.dataset['icon'])).toEqual(['bed']);
  expect(bed.querySelector('mh-icon')!.hasAttribute('filled')).toBe(true);
});

test('an icon that is not in the library is shown as no choice', async () => {
  const host = await picker({ value: 'icon_of_later' });
  expect(radios(host).filter((r) => r.getAttribute('aria-checked') === 'true')).toEqual([]);
});

test('every icon button is a 48 by 48 target with a name', async () => {
  const host = await picker();
  for (const radio of radios(host).slice(1)) expect([radio.dataset['icon'], radio.getAttribute('aria-label')]).toEqual([radio.dataset['icon'], expect.stringMatching(/\w/)]);
  expect(radios(host).find((r) => r.dataset['icon'] === 'weekend')!.getAttribute('aria-label')).toBe('woonkamer bank zitkamer');
  const css = MhIconPicker.styles.map((s) => ('cssText' in s ? s.cssText : '')).join('\n');
  expect(css).toMatch(/\.pick\s*\{[^}]*width:\s*var\(--icon-pick-size\)[^}]*height:\s*var\(--icon-pick-size\)/);
});

test('names that begin with the same word differ', async () => {
  const names = radios(await picker()).slice(1).map((r) => r.getAttribute('aria-label')!);
  expect(new Set(names).size).toBe(names.length);
});

test('the arrows move through the icons, with one tab stop', async () => {
  const host = await picker();
  const all = radios(host);
  expect(all.filter((r) => r.getAttribute('tabindex') === '0')).toEqual([all[0]]);
  all[0]!.focus();
  key(all[0]!, 'ArrowRight');
  await settle(host);
  expect(host.shadowRoot!.activeElement).toBe(all[1]);
  key(all[1]!, 'End');
  await settle(host);
  expect(host.shadowRoot!.activeElement).toBe(all.at(-1));
  key(all.at(-1)!, 'ArrowRight');
  await settle(host);
  expect(host.shadowRoot!.activeElement).toBe(all[0]);
  const changes = record(host, 'change');
  key(all[1]!, 'Enter');
  expect(changes).toEqual([{ icon: 'home' }]);
});

test('the icons are a group named Icoon, apart from the field to search them', async () => {
  const host = await mount<MhIconPicker>('mh-icon-picker', { value: null, auto: null });
  expect(host.shadowRoot!.querySelector('[role="radiogroup"]')!.getAttribute('aria-label')).toBe('Icoon');
  expect(host.shadowRoot!.querySelector('mh-text-field')!.getAttribute('label')).toBe('Zoek een icoon');
});
