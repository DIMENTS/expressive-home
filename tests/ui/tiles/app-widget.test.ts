// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/tiles/app-widget';
import { mount } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

afterEach(() => { document.body.replaceChildren(); });

test('a widget of an app starts anew when its settings change, so another layout shows at once', async () => {
  const fake = fakeContext([]);
  fake.ctx.widgets = { boards: () => [], openBoard: () => {}, appApi: async () => null };
  const spec = { kind: 'widget', id: 't-1', size: 'single', widget: 'app:com.example/channels', settings: { layout: 'panel' } } as const;
  const element = await mount<HTMLElement & { spec: unknown; updateComplete: Promise<unknown> }>('mh-app-widget', { spec, ctx: fake.ctx });
  const first = element.shadowRoot!.querySelector('iframe');
  expect(first).not.toBeNull();
  element.spec = { ...spec, settings: { layout: 'camper' } };
  await element.updateComplete;
  await element.updateComplete;
  const second = element.shadowRoot!.querySelector('iframe');
  expect(second).not.toBeNull();
  expect(second).not.toBe(first);
  element.spec = { ...spec, settings: { layout: 'camper' } };
  await element.updateComplete;
  expect(element.shadowRoot!.querySelector('iframe')).toBe(second);
});
