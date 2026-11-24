// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/parts/choice-group';
import '../../../src/ui/parts/radio-list';
import type { MhChoiceGroup } from '../../../src/ui/parts/choice-group';
import { key, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const options = [{ id: 'light', label: 'Licht', icon: 'light_mode' }, { id: 'dark', label: 'Donker', icon: 'dark_mode' }, { id: 'auto', label: 'Automatisch' }];
const radios = (host: Element) => [...host.shadowRoot!.querySelectorAll<HTMLElement>('[role="radio"]')];

test('a choice group moves with the arrow keys and reports the choice', async () => {
  const group = await mount<MhChoiceGroup>('mh-choice-group', { options, value: 'light', label: 'Licht of donker' });
  const changes = record<{ value: string }>(group, 'change');
  const list = group.shadowRoot!.querySelector('[role="radiogroup"]')!;
  expect(list.getAttribute('aria-label')).toBe('Licht of donker');
  expect(radios(group).map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
  expect(radios(group).map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  key(radios(group)[0]!, 'ArrowRight');
  await settle(group);
  expect(changes).toEqual([{ value: 'dark' }]);
  expect(radios(group).map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
  key(radios(group)[1]!, 'ArrowLeft');
  key(radios(group)[0]!, 'ArrowLeft');
  await settle(group);
  expect(changes.map((c) => c.value)).toEqual(['dark', 'light', 'auto']);
});

test('a click on an option chooses it, a click on the chosen one does not report again', async () => {
  const group = await mount<MhChoiceGroup>('mh-choice-group', { options, value: 'light', label: 'Licht of donker' });
  const changes = record<{ value: string }>(group, 'change');
  radios(group)[2]!.click();
  await settle(group);
  radios(group)[2]!.click();
  await settle(group);
  expect(changes).toEqual([{ value: 'auto' }]);
});

test('without a value the first option takes the tab stop', async () => {
  const group = await mount<MhChoiceGroup>('mh-choice-group', { options, value: '', label: 'Keuze' });
  expect(radios(group).map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
});

test('a radio list behaves the same, one under the other', async () => {
  const list = await mount<MhChoiceGroup>('mh-radio-list', { options, value: 'auto', label: 'Modus' });
  const changes = record<{ value: string }>(list, 'change');
  key(radios(list)[2]!, 'ArrowDown');
  await settle(list);
  expect(changes).toEqual([{ value: 'light' }]);
});

test('a disabled option cannot be chosen, also not with the arrows', async () => {
  const group = await mount<MhChoiceGroup>('mh-choice-group', { label: 'Soort', value: 'own', options: [{ id: 'own', label: 'Eigen' }, { id: 'hero', label: 'Blikvanger', disabled: true }, { id: 'x', label: 'Iets' }] });
  const changes = record<{ value: string }>(group, 'change');
  const radios = [...group.shadowRoot!.querySelectorAll<HTMLElement>('[role="radio"]')];
  expect(radios.map((r) => r.getAttribute('aria-disabled'))).toEqual([null, 'true', null]);
  radios[1]!.click();
  key(radios[0]!, 'ArrowRight');
  await settle(group);
  expect(changes).toEqual([{ value: 'x' }]);
});
