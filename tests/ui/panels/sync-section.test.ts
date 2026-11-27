// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { createTranslate } from '../../../src/i18n';
import '../../../src/ui/panels/sync-section';
import type { MhSyncSection } from '../../../src/ui/panels/sync-section';
import type { MhTextField } from '../../../src/ui/parts/text-field';
import { mount, record, settle } from '../../helpers/mount';

// In the settings of a page with a key: whether its dashboards are the same as on the hub, pairing with a code for away from
// home, and unpairing.

afterEach(() => { document.body.replaceChildren(); });

const open = (props: Record<string, unknown>) => mount<MhSyncSection>('mh-sync-section', { t: createTranslate('nl'), ...props });
const text = (el: HTMLElement) => (el.shadowRoot!.textContent ?? '').replace(/\s+/g, ' ');
const buttons = (el: HTMLElement) => [...el.shadowRoot!.querySelectorAll('mh-button')] as HTMLElement[];
const press = (button: HTMLElement) => button.shadowRoot!.querySelector('button')!.click();
const fields = (el: HTMLElement) => [...el.shadowRoot!.querySelectorAll('mh-text-field')] as MhTextField[];
function type(field: MhTextField, value: string): void {
  const input = field.shadowRoot!.querySelector('input')!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

test('not paired: what it would do, and a button to pair', async () => {
  const s = await open({ away: { paired: false, role: null, up: false, mismatch: null } });
  expect(text(s)).toContain('Gelijk met je Homey');
  expect(text(s)).toContain('Nog niet gekoppeld');
  expect(text(s)).toContain('Koppel dit apparaat met het appje op je Homey, dan zijn je dashboards hier en thuis hetzelfde.');
  expect(buttons(s).map((b) => b.textContent!.trim())).toContain('Koppelen met je Homey');
});

test('paired: what this device may, whether the hub answers, and a button to unpair', async () => {
  const s = await open({ away: { paired: true, role: 'use', up: true, mismatch: null } });
  expect(text(s)).toContain('Dit apparaat mag alleen gebruiken.');
  const unpairs = record(s, 'away-unpair');
  press(buttons(s).find((b) => b.textContent!.trim() === 'Ontkoppelen')!);
  expect(unpairs).toHaveLength(1);
  s.away = { paired: true, role: 'edit', up: false, mismatch: null };
  await settle(s);
  expect(text(s)).toContain('Dit apparaat mag ook bewerken.');
  expect(text(s)).toContain('Nog niet gelijk: je Homey antwoordt nu niet.');
  s.away = { paired: true, role: 'edit', up: true, mismatch: 'update-app' };
  await settle(s);
  expect(text(s)).toContain('Werk het appje op je Homey bij; tot dan kijk je hier alleen.');
  s.away = { paired: true, role: 'edit', up: true, mismatch: 'reload' };
  await settle(s);
  expect(text(s)).toContain('Herlaad deze pagina; tot dan kijk je hier alleen.');
});

test('pairing asks for the eight digits and a name, says what will be replaced, and what went wrong', async () => {
  const pairAway = vi.fn(async (): Promise<string> => 'code');
  const s = await open({ away: { paired: false, role: null, up: false, mismatch: null }, pairAway });
  press(buttons(s).find((b) => b.textContent!.trim() === 'Koppelen met je Homey')!);
  await settle(s);
  const dialog = s.shadowRoot!.querySelector('mh-dialog') as HTMLElement & { open: boolean };
  expect(dialog.open).toBe(true);
  expect(text(s)).toContain('Je dashboards hier worden vervangen door die van je Homey.');
  const [name, code] = fields(s);
  type(name!, 'Telefoon');
  type(code!, '1234 5678');
  await settle(s);
  press(buttons(s).find((b) => b.textContent!.trim() === 'Koppelen')!);
  await settle(s);
  expect(pairAway).toHaveBeenCalledWith('12345678', 'Telefoon');
  expect(text(s)).toContain('Deze code klopt niet of is verlopen.');
  for (const [issue, words] of [['locked', 'Te vaak een verkeerde code.'], ['full', 'Er zijn al te veel apparaten gekoppeld.'], ['unreachable', 'Je Homey antwoordt niet.']] as const) {
    pairAway.mockResolvedValueOnce(issue);
    const again = buttons(s).find((b) => b.textContent!.trim() === 'Koppelen')! as HTMLElement & { updateComplete: Promise<unknown> };
    await again.updateComplete;
    press(again);
    await settle(s);
    expect(text(s)).toContain(words);
  }
  // a code that is not eight digits is not sent
  type(code!, '1234');
  await settle(s);
  const before = pairAway.mock.calls.length;
  const last = buttons(s).find((b) => b.textContent!.trim() === 'Koppelen')! as HTMLElement & { updateComplete: Promise<unknown> };
  await last.updateComplete;
  press(last);
  await settle(s);
  expect(pairAway.mock.calls.length).toBe(before);
  expect(text(s)).toContain('Typ de acht cijfers uit de Homey-app.');
});

test('paired: the page is told, which then starts anew', async () => {
  const s = await open({ away: { paired: false, role: null, up: false, mismatch: null }, pairAway: async () => 'ok' });
  const done = record(s, 'away-paired');
  press(buttons(s).find((b) => b.textContent!.trim() === 'Koppelen met je Homey')!);
  await settle(s);
  type(fields(s)[1]!, '12345678');
  press(buttons(s).find((b) => b.textContent!.trim() === 'Koppelen')!);
  await settle(s);
  expect(done).toHaveLength(1);
});

test('in English too', async () => {
  const s = await open({ t: createTranslate('en'), away: { paired: false, role: null, up: false, mismatch: null } });
  expect(text(s)).toContain('Synced with your Homey');
  expect(buttons(s).map((b) => b.textContent!.trim())).toContain('Pair with your Homey');
});

test('a hub that is too busy is said so; a phone without a typed name gets a name of its own', async () => {
  const pairAway = vi.fn(async (): Promise<string> => 'busy');
  const s = await open({ away: { paired: false, role: null, up: false, mismatch: null }, pairAway });
  press(buttons(s).find((b) => b.textContent!.trim() === 'Koppelen met je Homey')!);
  await settle(s);
  type(fields(s)[1]!, '12345678');
  press(buttons(s).find((b) => b.textContent!.trim() === 'Koppelen')!);
  await settle(s);
  expect(pairAway).toHaveBeenCalledWith('12345678', 'Telefoon onderweg');
  expect(text(s)).toContain('Even te veel tegelijk. Probeer het over een minuut opnieuw.');
});
