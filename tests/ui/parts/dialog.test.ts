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
