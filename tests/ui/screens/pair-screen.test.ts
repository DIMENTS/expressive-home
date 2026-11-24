// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { createTranslate } from '../../../src/i18n';
import '../../../src/ui/screens/pair-screen';
import type { MhPairScreen } from '../../../src/ui/screens/pair-screen';
import { deepText } from '../../helpers/deep';
import { mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const screen = (props: Record<string, unknown> = {}) => mount<MhPairScreen>('mh-pair-screen', { issue: 'none', busy: false, revoked: false, ...props });
const field = (host: MhPairScreen, label: string) => [...host.shadowRoot!.querySelectorAll('mh-text-field')].find((f) => f.getAttribute('label') === label) as HTMLElement & { value: string; state: string; help: string };
const type = async (host: MhPairScreen, label: string, value: string) => { field(host, label).dispatchEvent(new CustomEvent('input', { detail: { value }, bubbles: true, composed: true })); await settle(host); };
const labels = (host: MhPairScreen) => [...host.shadowRoot!.querySelectorAll('mh-text-field')].map((f) => f.getAttribute('label'));
const buttons = (host: MhPairScreen) => [...host.shadowRoot!.querySelectorAll('mh-button')].map((b) => b.textContent!.trim());
const press = async (host: MhPairScreen, text: string) => { [...host.shadowRoot!.querySelectorAll('mh-button')].find((b) => b.textContent!.trim() === text)!.click(); await settle(host); };
const button = (host: MhPairScreen) => host.shadowRoot!.querySelector('mh-button') as HTMLElement & { busy: boolean };

test('it asks for a name and a code, and reports both', async () => {
  const host = await screen();
  expect(deepText(host)).toContain('Koppel dit apparaat');
  const pairs = record<{ code: string; name: string }>(host, 'pair');
  await type(host, 'Naam van dit apparaat', ' Tablet ');
  await type(host, 'Code', '123 456');
  button(host).click();
  expect(pairs).toEqual([{ code: '123456', name: 'Tablet' }]);
  field(host, 'Code').dispatchEvent(new CustomEvent('submit', { bubbles: true, composed: true }));
  expect(pairs).toHaveLength(2);
});

test('a code that cannot be right is said at once, not sent', async () => {
  const host = await screen();
  const pairs = record(host, 'pair');
  for (const code of ['', '12345', 'abcdef', '1234567']) {
    await type(host, 'Code', code);
    button(host).click();
    await settle(host);
    expect([code, pairs.length, field(host, 'Code').state, field(host, 'Code').help]).toEqual([code, 0, 'error', 'Vul de zes cijfers in.']);
  }
  await type(host, 'Code', '123456');
  expect(field(host, 'Code').state).toBe('idle');
});

test('what went wrong stands at the code, until something is typed', async () => {
  const host = await screen({ issue: 'code' });
  expect([field(host, 'Code').state, field(host, 'Code').help]).toEqual(['error', 'Deze code klopt niet of is verlopen. Maak zo nodig een nieuwe in de Homey-app.']);
  await type(host, 'Code', '1');
  expect(field(host, 'Code').state).toBe('idle');
  for (const [issue, text] of [['locked', 'Te vaak een verkeerde code.'], ['full', 'Er zijn al te veel apparaten gekoppeld.'], ['unreachable', 'De Homey antwoordt niet.']] as const) {
    host.issue = issue;
    await settle(host);
    expect(field(host, 'Code').help).toContain(text);
  }
});

test('while pairing nothing is sent twice; a device that was taken away hears why it is here', async () => {
  const host = await screen({ busy: true, revoked: true });
  const pairs = record(host, 'pair');
  await type(host, 'Code', '123456');
  button(host).click();
  expect([pairs.length, button(host).busy]).toEqual([0, true]);
  expect(deepText(host)).toContain('Dit apparaat is losgekoppeld.');
});

test('the pair screen follows the language and says that the connection is not encrypted', async () => {
  const host = await screen({ t: createTranslate('en') });
  expect(deepText(host)).toContain('Pair this device');
  expect(deepText(host)).toContain('not encrypted');
});

test('a device without a name gets one in the language of the app', async () => {
  for (const [language, name] of [['nl', 'Apparaat'], ['en', 'Device']] as const) {
    const host = await screen({ t: createTranslate(language) });
    const pairs = record<{ code: string; name: string }>(host, 'pair');
    (host.shadowRoot!.querySelectorAll('mh-text-field')[1] as HTMLElement).dispatchEvent(new CustomEvent('input', { detail: { value: '123456' }, bubbles: true, composed: true }));
    button(host).click();
    expect(pairs).toEqual([{ code: '123456', name }]);
  }
});

test('the code is typed on a keyboard of digits; while pairing the focus stays where it is', async () => {
  const host = await screen({ busy: true });
  const input = field(host, 'Code').shadowRoot!.querySelector('input')!;
  expect([input.getAttribute('inputmode'), input.disabled]).toEqual(['numeric', false]);
  expect(field(host, 'Naam van dit apparaat').shadowRoot!.querySelector('input')!.hasAttribute('inputmode')).toBe(false);
});

test('that the device was taken away is read out at once', async () => {
  const host = await screen({ revoked: true });
  expect(host.shadowRoot!.querySelector('mh-note[tone="error"]')!.getAttribute('role')).toBe('alert');
});

test('a code that was scanned asks for one tap', async () => {
  const host = await screen({ scanned: '482913', kind: 'tablet' });
  const pairs = record<{ code: string; name: string }>(host, 'pair');
  expect(deepText(host)).toContain('De code is gescand');
  expect(deepText(host)).not.toContain('482913');
  expect([labels(host), field(host, 'Naam van dit apparaat').value, buttons(host)]).toEqual([['Naam van dit apparaat'], 'Tablet', ['Koppelen', 'Een andere code typen']]);
  await press(host, 'Koppelen');
  expect(pairs).toEqual([{ code: '482913', name: 'Tablet' }]);
  // while it is on its way nothing is sent twice
  host.busy = true;
  await settle(host);
  await press(host, 'Koppelen…');
  expect(pairs).toHaveLength(1);
});

test('the name that is filled in says what the device is, and can be another', async () => {
  for (const [kind, nl, en] of [['phone', 'Telefoon', 'Phone'], ['tablet', 'Tablet', 'Tablet'], ['laptop', 'Laptop', 'Laptop']] as const) {
    expect(field(await screen({ scanned: '482913', kind }), 'Naam van dit apparaat').value).toBe(nl);
    expect(field(await screen({ scanned: '482913', kind, t: createTranslate('en') }), 'Name of this device').value).toBe(en);
  }
  const host = await screen({ scanned: '482913', kind: 'tablet' });
  const pairs = record<{ code: string; name: string }>(host, 'pair');
  await type(host, 'Naam van dit apparaat', 'Tablet in de keuken');
  field(host, 'Naam van dit apparaat').dispatchEvent(new CustomEvent('submit', { bubbles: true, composed: true }));
  await type(host, 'Naam van dit apparaat', '');
  await press(host, 'Koppelen');
  expect(pairs).toEqual([{ code: '482913', name: 'Tablet in de keuken' }, { code: '482913', name: 'Apparaat' }]);
});

test('another code can be typed instead', async () => {
  const host = await screen({ scanned: '482913', kind: 'tablet' });
  const pairs = record<{ code: string; name: string }>(host, 'pair');
  await press(host, 'Een andere code typen');
  expect([labels(host), field(host, 'Naam van dit apparaat').value, field(host, 'Code').value]).toEqual([['Naam van dit apparaat', 'Code'], 'Tablet', '']);
  await type(host, 'Code', '111222');
  await press(host, 'Koppelen');
  expect(pairs).toEqual([{ code: '111222', name: 'Tablet' }]);
});

test('a scanned code that no longer works says so, and what to do', async () => {
  const host = await screen({ scanned: '482913', kind: 'phone' });
  host.issue = 'code';
  await settle(host);
  expect(deepText(host)).toContain('Deze code werkt niet meer');
  expect(deepText(host)).toContain('Een code werkt één keer en vervalt na tien minuten.');
  expect(deepText(host)).not.toContain('Nog één tik');
  expect([labels(host), buttons(host)]).toEqual([[], ['Code typen']]);
  // the button that had the focus is gone
  expect((host.shadowRoot!.activeElement as HTMLElement | null)?.textContent?.trim()).toBe('Code typen');
  await press(host, 'Code typen');
  expect([labels(host), field(host, 'Code').state]).toEqual([['Naam van dit apparaat', 'Code'], 'idle']);
  // and a new one that was scanned counts again
  host.issue = 'none';
  host.scanned = '555666';
  await settle(host);
  const pairs = record<{ code: string; name: string }>(host, 'pair');
  await press(host, 'Koppelen');
  expect(pairs).toEqual([{ code: '555666', name: 'Telefoon' }]);
});

test.each([['locked', 'Te vaak een verkeerde code.'], ['full', 'Er zijn al te veel apparaten gekoppeld.'], ['unreachable', 'De Homey antwoordt niet.']] as const)('a scanned code is kept to try again: %s', async (issue, text) => {
  const host = await screen({ scanned: '482913', kind: 'tablet', issue });
  const pairs = record<{ code: string; name: string }>(host, 'pair');
  expect(deepText(host)).toContain(text);
  expect(buttons(host)).toEqual(['Opnieuw proberen', 'Een andere code typen']);
  await press(host, 'Opnieuw proberen');
  expect(pairs).toEqual([{ code: '482913', name: 'Tablet' }]);
});

test('with a scanned code the focus is on the button, so no keyboard comes up', async () => {
  const host = await screen({ scanned: '482913', kind: 'tablet' });
  host.focus();
  expect((host.shadowRoot!.activeElement as HTMLElement).localName).toBe('mh-button');
});

test('a device that was taken away and scans a new code hears both', async () => {
  const host = await screen({ scanned: '482913', kind: 'tablet', revoked: true });
  expect(deepText(host)).toContain('Dit apparaat is losgekoppeld.');
  expect(deepText(host)).toContain('De code is gescand');
});
