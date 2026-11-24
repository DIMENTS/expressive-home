// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/parts/text-field';
import type { MhTextField } from '../../../src/ui/parts/text-field';
import { inside, key, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

test('a text field reports what is typed, links its help text and marks an error', async () => {
  const field = await mount<MhTextField>('mh-text-field', { label: 'Adres van je Homey', help: 'Het adres van my.homey.app.', icon: 'link' });
  const inputs = record<{ value: string }>(field, 'input');
  const input = inside<HTMLInputElement>(field, 'input');
  type(input, 'my.homey.app');
  expect(inputs).toEqual([{ value: 'my.homey.app' }]);
  const help = inside(field, `#${input.getAttribute('aria-describedby')}`);
  expect(help.textContent).toContain('Het adres van my.homey.app.');
  expect(input.getAttribute('aria-invalid')).toBe('false');
  field.state = 'error';
  await settle(field);
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(inside(field, 'label').getAttribute('for')).toBe(input.id);
  expect(input.getAttribute('autocomplete')).toBe('off');
  expect(input.getAttribute('spellcheck')).toBe('false');
});

test('Enter in a text field asks to submit', async () => {
  const field = await mount<MhTextField>('mh-text-field', { label: 'Sleutel' });
  const submits = record(field, 'submit');
  key(inside(field, 'input'), 'Enter');
  expect(submits).toHaveLength(1);
});

test('a password field never mirrors its value to an attribute', async () => {
  const field = await mount<MhTextField>('mh-text-field', { label: 'API-sleutel', type: 'password' });
  const input = inside<HTMLInputElement>(field, 'input');
  type(input, 'geheim-123');
  await settle(field);
  expect(input.type).toBe('password');
  expect(field.outerHTML).not.toContain('geheim-123');
  expect(field.shadowRoot!.innerHTML).not.toContain('geheim-123');
  expect([...input.attributes].map((a) => a.value).join(' ')).not.toContain('geheim-123');
});

test('a disabled field cannot be typed in', async () => {
  const field = await mount<MhTextField>('mh-text-field', { label: 'Adres', disabled: true });
  expect(inside<HTMLInputElement>(field, 'input').disabled).toBe(true);
});

test('focus() puts the caret in the field', async () => {
  const field = await mount<MhTextField>('mh-text-field', { label: 'Adres' });
  field.focus();
  expect(field.shadowRoot!.activeElement).toBe(inside(field, 'input'));
});

test('a quiet field, such as a search field, has its name and no lines of text around it', async () => {
  const field = await mount<MhTextField>('mh-text-field', { label: 'Zoek een icoon', placeholder: 'Zoek een icoon', icon: 'search', type: 'search', quiet: true });
  const input = inside<HTMLInputElement>(field, 'input');
  expect(input.type).toBe('search');
  expect(input.getAttribute('aria-label')).toBe('Zoek een icoon');
  expect(field.shadowRoot!.querySelector('label')).toBeNull();
  expect(field.shadowRoot!.querySelector('.help')).toBeNull();
  expect(input.hasAttribute('aria-describedby')).toBe(false);
});

test('a focused field has one ring, a long hint ends in dots and a search field has no mark of the browser', () => {
  const css = (customElements.get('mh-text-field') as unknown as { styles: { cssText?: string }[] }).styles.map((part) => part.cssText ?? '').join('\n');
  expect(css).toMatch(/input:focus-visible\s*\{[^}]*outline:\s*none/);
  expect(css).toMatch(/input\s*\{[^}]*text-overflow:\s*ellipsis/);
  expect(css).toMatch(/::-webkit-search-cancel-button\s*\{[^}]*appearance:\s*none/);
});

test('the whole height of a field can be tapped', () => {
  const css = (customElements.get('mh-text-field') as unknown as { styles: { cssText?: string }[] }).styles.map((part) => part.cssText ?? '').join('\n');
  expect(css).toMatch(/input\s*\{[^}]*align-self:\s*stretch/);
});
