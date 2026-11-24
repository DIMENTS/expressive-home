// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { createTile, registerTile, tileTag } from '../../../src/ui/tiles/registry';
import { device, cap } from '../../helpers/build';
import { fakeContext } from '../../helpers/ui-context';

class FakeTile extends HTMLElement {}
customElements.define('fake-tile', FakeTile);

test('a kind can be registered once and unknown kinds are an error', () => {
  registerTile({ kind: 'button', tag: 'fake-tile', sizes: ['single'] });
  expect(() => registerTile({ kind: 'button', tag: 'fake-tile', sizes: ['single'] })).toThrow();
  expect(tileTag('button')).toBe('fake-tile');
  expect(() => tileTag('nope' as never)).toThrow();
});

test('createTile makes the registered element with its spec, context and density', () => {
  const { ctx } = fakeContext([device({ id: 'b', caps: [cap('button', { type: 'boolean', setable: true })] })]);
  const spec = { kind: 'button', id: 'b:button', deviceId: 'b', size: 'single', capabilityId: 'button' } as const;
  const tile = createTile(spec, ctx, 'compact') as FakeTile & { spec: unknown; ctx: unknown; density: string };
  expect(tile.tagName.toLowerCase()).toBe('fake-tile');
  expect(tile.spec).toBe(spec);
  expect(tile.ctx).toBe(ctx);
  expect(tile.density).toBe('compact');
});
