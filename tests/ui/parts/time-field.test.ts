// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/parts/time-field';
import type { MhTimeField } from '../../../src/ui/parts/time-field';
import { inside, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

async function setup() {
  const field = await mount<MhTimeField>('mh-time-field', { label: 'Van', value: '22:30' });
  const input = inside<HTMLInputElement>(field, 'input');
  const type = (value: string) => {
    Object.defineProperty(input, 'value', { value, writable: true, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  };
  return { field, input, type, changes: record<{ value: string }>(field, 'change') };
}

test('a time is shown and has a name', async () => {
  const { field, input } = await setup();
  expect([input.type, input.value, inside(field, 'label').textContent, inside(field, 'label').getAttribute('for') === input.id]).toEqual(['time', '22:30', 'Van', true]);
});

test('another time is reported once, as a time', async () => {
  const { type, changes, field } = await setup();
  type('07:05');
  expect([changes, field.value]).toEqual([[{ value: '07:05' }], '07:05']);
  type('07:05');
  expect(changes).toHaveLength(1);
});

test.each(['', '25:00', '7:5', 'x'])('what is no time is not reported, and the old one is there again afterwards: %j', async (wrong) => {
  const { field, input, type, changes } = await setup();
  type(wrong);
  expect([changes, field.value]).toEqual([[], '22:30']);
  input.dispatchEvent(new Event('blur'));
  await settle(field);
  expect(input.value).toBe('22:30');
});

test('what is typed does not leave it as an event of its own', async () => {
  const { field, input } = await setup();
  const seen = record(field, 'input');
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  expect(seen).toHaveLength(0);
});
