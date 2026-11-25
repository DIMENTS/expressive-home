// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/parts/text-field';
import { inside, mount, record } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

test('a field of more lines is a text area that keeps its line breaks and says what was typed', async () => {
  const field = await mount('mh-text-field', { label: 'Tekst', multiline: true, value: 'Melk\nbrood', maxlength: 500 });
  const area = inside<HTMLTextAreaElement>(field, 'textarea');
  expect(area.value).toBe('Melk\nbrood');
  expect(area.getAttribute('maxlength')).toBe('500');
  expect(field.shadowRoot!.querySelector('input')).toBeNull();
  const seen = record<{ value: string }>(field, 'input');
  area.value = 'Kaas';
  area.dispatchEvent(new Event('input'));
  expect(seen).toEqual([{ value: 'Kaas' }]);
});
