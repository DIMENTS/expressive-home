import { HOUSE_KINDS, type Section, type TileSpec } from '../../dashboard/types';
import type { Column } from '../../layout/types';
import type { MessageKey, Translate } from '../../i18n/index';
import { sectionTitle, shownSectionIcon } from '../model/layout';
import type { MenuGroup } from '../parts/menu';
import { tileSizes } from '../tiles/registry';

/** Where a section or hero stands in its column. */
export interface SectionPlace { column: Column; first: boolean; last: boolean }

/** For a property that holds a place: only another place is a change, not the same one worked out again. */
export const placeChanged = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b);

/** What the menu of a section or hero asks for while editing; the dashboard does it. */
export type SectionAction = 'rename' | 'settings' | 'up' | 'down' | 'other' | 'remove';

/** The group "Indeling" of the menu of a section, or of the hero. */
export function layoutGroup(kind: 'section' | 'hero', place: SectionPlace, t: Translate): MenuGroup {
  const hero = kind === 'hero';
  return {
    kind: 'items', id: 'layout', title: t('edit.group.layout'), items: [
      hero ? { id: 'settings', label: t('edit.hero.settings'), checked: null, icon: 'tune' } : { id: 'rename', label: t('edit.section.rename'), checked: null, icon: 'edit' },
      { id: 'up', label: t('edit.section.up'), checked: null, icon: 'arrow_upward', disabled: place.first },
      { id: 'down', label: t('edit.section.down'), checked: null, icon: 'arrow_downward', disabled: place.last },
      { id: 'other', label: t('edit.section.otherColumn'), checked: null, icon: place.column === 'left' ? 'arrow_forward' : 'arrow_back' },
      { id: 'remove', label: t(hero ? 'edit.hero.remove' : 'edit.section.remove'), checked: null, icon: 'delete' },
    ],
  };
}

/** What the two sizes of a kind of tile are called: what comes with the wide one. */
export function sizeLabels(kind: TileSpec['kind']): readonly [single: MessageKey, wide: MessageKey] {
  if (kind === 'light') return ['edit.tile.singleLight', 'edit.tile.wideLight'];
  return HOUSE_KINDS.some((house) => house === kind) ? ['edit.tile.singleHouse', 'edit.tile.wideHouse'] : ['edit.tile.single', 'edit.tile.wide'];
}

/** The menu of a tile: its name, settings and size (not for a flow), its place, and removing it. */
export function tileMenuGroups(spec: TileSpec, name: string, place: { index: number; count: number }, t: Translate): MenuGroup[] {
  const flow = spec.kind === 'flow';
  const [single, wide] = sizeLabels(spec.kind);
  const sizes = tileSizes(spec.kind);
  const size = (id: 'single' | 'wide', label: string) => ({ id, label, checked: spec.size === id, disabled: !sizes.includes(id) });
  const top: MenuGroup[] = flow ? [] : [
    { kind: 'items', id: 'tile', title: name, items: [{ id: 'settings', label: t('edit.tile.settings'), checked: null, icon: 'tune' }] },
    {
      kind: 'items', id: 'size', title: t('edit.tile.size'),
      items: [size('single', t(single)), size('wide', t(wide))],
    },
  ];
  return [
    ...top,
    {
      kind: 'items', id: 'move', title: flow ? name : '', items: [
        { id: 'forward', label: t('edit.tile.forward'), checked: null, icon: 'arrow_back', disabled: place.index <= 0 },
        { id: 'back', label: t('edit.tile.back'), checked: null, icon: 'arrow_forward', disabled: place.index >= place.count - 1 },
        { id: 'to', label: t('edit.tile.moveTo'), checked: null, icon: 'drive_file_move' },
      ],
    },
    { kind: 'items', id: 'remove', title: '', items: [{ id: 'remove', label: t('edit.tile.remove'), checked: null, icon: 'delete' }] },
  ];
}

/** The second stand of the menu of a tile: the sections it can go to, the current one ticked. */
export function moveToGroups(sections: Section[], currentId: string, name: string, t: Translate): MenuGroup[] {
  return [
    { kind: 'items', id: 'back', title: '', items: [{ id: 'back', label: t('edit.tile.moveBack'), checked: null, icon: 'arrow_back' }] },
    {
      kind: 'items', id: 'section', title: t('edit.tile.moveTitle', { name }),
      items: sections.map((section) => ({ id: section.id, label: sectionTitle(section, t), icon: shownSectionIcon(section), checked: section.id === currentId })),
    },
  ];
}

/** What the menu of a dashboard asks for; the app does it. */
export type BoardAction = 'rename' | 'up' | 'down' | 'remove' | 'reset';

/**
 * The menu of a dashboard in the edit bar: name and icon, its place in the rail, and removing it. The
 * Overzicht always stays; instead it can go back to automatic, unless it still is.
 */
export function boardMenuGroups(name: string, place: { index: number; count: number }, overview: { automatic: boolean } | null, t: Translate): MenuGroup[] {
  return [
    {
      kind: 'items', id: 'board', title: name, items: [
        { id: 'rename', label: t('board.menu.rename'), checked: null, icon: 'edit' },
        { id: 'up', label: t('board.menu.up'), checked: null, icon: 'arrow_upward', disabled: place.index <= 0 },
        { id: 'down', label: t('board.menu.down'), checked: null, icon: 'arrow_downward', disabled: place.index >= place.count - 1 },
      ],
    },
    {
      kind: 'items', id: 'remove', title: '', items: [overview
        ? { id: 'reset', label: t('board.menu.reset'), checked: null, icon: 'restart_alt', disabled: overview.automatic }
        : { id: 'remove', label: t('board.menu.remove'), checked: null, icon: 'delete' }],
    },
  ];
}
