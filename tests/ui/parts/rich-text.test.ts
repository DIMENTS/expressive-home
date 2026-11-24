// @vitest-environment happy-dom
import { render } from 'lit';
import { expect, test } from 'vitest';
import { richText } from '../../../src/ui/parts/rich-text';

function rendered(text: string): string {
  const box = document.createElement('div');
  render(richText(text), box);
  return box.innerHTML.replace(/<!--[^>]*-->/g, '');
}

test('bold parts become <b> and the rest stays text', () => {
  expect(rendered('Open **my.homey.app** en ga naar **Instellingen**.')).toBe('Open <b>my.homey.app</b> en ga naar <b>Instellingen</b>.');
  expect(rendered('**Niet bereikbaar.** Homey meldt iets.')).toBe('<b>Niet bereikbaar.</b> Homey meldt iets.');
});

test('markup in a text is shown, never parsed', () => {
  expect(rendered('a <img src=x> b')).toBe('a &lt;img src=x&gt; b');
});
