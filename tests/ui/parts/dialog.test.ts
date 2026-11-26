// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/parts/dialog';
import '../../../src/ui/parts/button';
import type { MhDialog } from '../../../src/ui/parts/dialog';
import { inside, key, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

test('a dialog starts on the element marked data-autofocus and Escape cancels', async () => {
  const dialog = await mount<MhDialog>('mh-dialog', { heading: 'Verbinding verbreken?' },
    'De sleutel wordt gewist.<mh-button slot="actions" variant="text" data-autofocus>Annuleren</mh-button><mh-button slot="actions">Verbreken</mh-button>');
  const cancels = record(dialog, 'cancel');
  dialog.open = true;
  await settle(dialog);
  const box = inside(dialog, '[role="alertdialog"]');
  expect(box.getAttribute('aria-modal')).toBe('true');
  expect(inside(dialog, `#${box.getAttribute('aria-labelledby')}`).textContent).toBe('Verbinding verbreken?');
  expect(document.activeElement).toBe(dialog.querySelector('[data-autofocus]'));
  key(box, 'Escape');
  expect(cancels).toHaveLength(1);
});

test('a closed dialog cannot be reached and ignores Escape', async () => {
  const dialog = await mount<MhDialog>('mh-dialog', { heading: 'Vraag' });
  const cancels = record(dialog, 'cancel');
  key(inside(dialog, '[role="alertdialog"]'), 'Escape');
  expect(cancels).toHaveLength(0);
  expect(inside(dialog, '[role="alertdialog"]').hasAttribute('inert')).toBe(true);
});

test('a dialog over a sheet: with the focus lost, Escape cancels the dialog and leaves the sheet', async () => {
  await import('../../../src/ui/parts/sheet');
  const sheet = await mount<HTMLElement & { open: boolean; updateComplete: Promise<unknown> }>('mh-sheet', { heading: 'Plafond' }, '<mh-button>Iets</mh-button>');
  sheet.open = true;
  await settle(sheet);
  const dialog = await mount<MhDialog>('mh-dialog', { heading: 'Vraag' }, '<mh-button slot="actions" data-autofocus>Nee</mh-button>');
  const [cancels, closes] = [record(dialog, 'cancel'), record(sheet, 'close')];
  dialog.open = true;
  await settle(dialog);
  dialog.querySelector('mh-button')!.remove();
  (document.activeElement as HTMLElement | null)?.blur();
  key(document.body, 'Escape');
  expect([cancels.length, closes.length]).toEqual([1, 0]);
  // the dialog gone, the focus is back in the sheet, and Escape there closes it
  dialog.open = false;
  await settle(dialog);
  key(sheet.shadowRoot!.activeElement!, 'Escape');
  expect([cancels.length, closes.length]).toEqual([1, 1]);
});

test('a sheet closed under an open dialog leaves the focus in the dialog; the dialog gives it back to where it was before both', async () => {
  await import('../../../src/ui/parts/sheet');
  const before = document.createElement('button');
  document.body.append(before);
  before.focus();
  const sheet = await mount<HTMLElement & { open: boolean; updateComplete: Promise<unknown> }>('mh-sheet', { heading: 'Plafond' }, '<mh-button>Iets</mh-button>');
  sheet.open = true;
  await settle(sheet);
  const dialog = await mount<MhDialog>('mh-dialog', { heading: 'Vraag' }, '<mh-button slot="actions" data-autofocus>Nee</mh-button>');
  dialog.open = true;
  await settle(dialog);
  const inDialog = dialog.querySelector('mh-button')!;
  expect(document.activeElement).toBe(inDialog);
  sheet.open = false;
  await settle(sheet);
  expect(document.activeElement).toBe(inDialog);
  dialog.open = false;
  await settle(dialog);
  expect(document.activeElement).toBe(before);
});
