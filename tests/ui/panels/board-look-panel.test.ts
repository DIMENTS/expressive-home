// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/panels/board-look-panel';
import type { MhBoardLookPanel } from '../../../src/ui/panels/board-look-panel';
import { BUILT_IN, type ThemeFile } from '../../../src/theme/look';
import { inside, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const avond: ThemeFile = { format: 1, id: 't-aaaaaaaaaaaaaaaa', name: 'Avondlicht', maker: '', base: 'glas', seed: null, userSeed: true, knobs: {}, app: '' };
const open = (theme: string | null) => mount<MhBoardLookPanel>('mh-board-look-panel', { open: true, name: 'Woonkamer', theme, themes: [...BUILT_IN, avond], role: 'edit', seed: '#3a5ba9', mode: 'light' });
const choice = (panel: MhBoardLookPanel) => inside(panel, 'mh-choice-group') as HTMLElement & { value: string };
const change = (element: HTMLElement, detail: unknown) => element.dispatchEvent(new CustomEvent('change', { detail, bubbles: true, composed: true }));

test('a dashboard like the house: one choice, no cards', async () => {
  const panel = await open(null);
  expect((inside(panel, 'mh-sheet') as HTMLElement & { heading: string }).heading).toBe('Dashboard “Woonkamer”');
  expect(choice(panel).value).toBe('house');
  expect(panel.shadowRoot!.querySelector('mh-look-picker')).toBeNull();
});

test('a theme of its own: the cards, and every choice is told', async () => {
  const panel = await open(null);
  const told = record<{ theme: string | null }>(panel, 'board-theme');
  change(choice(panel), { value: 'own' });
  await settle(panel);
  expect(told).toEqual([{ theme: 'rustig' }]);
  panel.theme = 'rustig';
  await settle(panel);
  const picker = inside(panel, 'mh-look-picker') as HTMLElement & { value: string; options: { id: string }[] };
  expect(picker.options.map((o) => o.id)).toEqual(['rustig', 'uitbundig', 'glas', 'helder', avond.id]);
  change(picker, { value: avond.id });
  change(choice(panel), { value: 'house' });
  expect(told).toEqual([{ theme: 'rustig' }, { theme: avond.id }, { theme: null }]);
});

test('a theme with a colour of its own is shown in that colour', async () => {
  const paars: ThemeFile = { ...avond, id: 't-pppppppppppppppp', seed: '#6750a4', userSeed: false };
  const panel = await mount<MhBoardLookPanel>('mh-board-look-panel', { open: true, name: 'Woonkamer', theme: 'rustig', themes: [...BUILT_IN, paars], role: 'edit', seed: '#3a5ba9', mode: 'light' });
  const options = (inside(panel, 'mh-look-picker') as HTMLElement & { options: { id: string; seed: string }[] }).options;
  expect([options.find((o) => o.id === 'rustig')!.seed, options.find((o) => o.id === paars.id)!.seed]).toEqual(['#3a5ba9', '#6750a4']);
});
