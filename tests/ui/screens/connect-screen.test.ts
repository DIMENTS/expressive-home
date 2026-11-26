// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/screens/connect-screen';
import type { MhConnectScreen } from '../../../src/ui/screens/connect-screen';
import type { MhTextField } from '../../../src/ui/parts/text-field';
import { inside, key, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const ID = '5f2a00000000000000000c81';
const open = (props: Record<string, unknown> = {}) => mount<MhConnectScreen>('mh-connect-screen', { issue: 'none', busy: false, waitingForPermission: false, review: null, address: '', ...props });
const fields = (screen: MhConnectScreen) => [...screen.shadowRoot!.querySelectorAll('mh-text-field')] as MhTextField[];
const input = (field: MhTextField) => field.shadowRoot!.querySelector('input')!;
function type(field: MhTextField, text: string): void {
  const box = input(field);
  box.value = text;
  box.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}
const text = (screen: MhConnectScreen) => screen.shadowRoot!.textContent ?? '';
const buttons = (screen: MhConnectScreen) => [...screen.shadowRoot!.querySelectorAll('mh-button')] as HTMLElement[];
const press = (button: HTMLElement) => button.shadowRoot!.querySelector('button')!.click();

test('the screen explains the three steps and lists the seven rights', async () => {
  const screen = await open();
  expect(screen.shadowRoot!.querySelectorAll('ol.steps > li')).toHaveLength(3);
  expect(screen.shadowRoot!.querySelectorAll('.rights li')).toHaveLength(7);
  expect(inside(screen, 'h1').textContent).toBe('Verbind je Homey');
  expect(inside(screen, 'h2').textContent).toBe('Verbinden');
});

test('a pasted web app address is recognised while typing', async () => {
  const screen = await open();
  const [address] = fields(screen);
  type(address!, `https://my.homey.app/homeys/${ID}/devices`);
  await settle(screen);
  expect(address!.state).toBe('ok');
  expect(address!.help).toBe('Homey-ID herkend.');
  type(address!, '192.168.1.20');
  await settle(screen);
  expect(address!.help).toBe('IP-adres herkend.');
});

test('nonsense is only an error after leaving the field or submitting', async () => {
  const screen = await open();
  const [address] = fields(screen);
  type(address!, 'mijn homey');
  await settle(screen);
  expect(address!.state).toBe('idle');
  input(address!).dispatchEvent(new Event('blur'));
  input(address!).dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
  await settle(screen);
  expect(address!.state).toBe('error');
  expect(address!.help).toBe('Dit is geen adres van my.homey.app, Homey-ID of IP-adres.');
});

test('submitting reports the two values as typed', async () => {
  const screen = await open();
  const connects = record<{ address: string; apiKey: string }>(screen, 'connect');
  const [address, apiKey] = fields(screen);
  type(address!, ID);
  type(apiKey!, ' geheim ');
  await settle(screen);
  press(buttons(screen)[0]!);
  key(input(apiKey!), 'Enter');
  key(input(address!), 'Enter');
  expect(connects).toEqual([{ address: ID, apiKey: ' geheim ' }, { address: ID, apiKey: ' geheim ' }, { address: ID, apiKey: ' geheim ' }]);
});

test('while busy the fields are locked and the button shows the loader', async () => {
  const screen = await open({ busy: true });
  const connects = record(screen, 'connect');
  expect(fields(screen).every((f) => f.disabled)).toBe(true);
  const submit = buttons(screen)[0]! as HTMLElement & { busy: boolean };
  expect(submit.busy).toBe(true);
  expect(submit.textContent).toContain('Verbinden…');
  press(submit);
  expect(connects).toHaveLength(0);
});

test('each problem appears at the field it is about', async () => {
  const unreachable = await open({ issue: 'unreachable', address: ID });
  expect(unreachable.shadowRoot!.querySelector('mh-note[tone="error"]')!.textContent).toContain('We kunnen je Homey niet bereiken.');
  expect(fields(unreachable)[0]!.state).toBe('error');
  document.body.replaceChildren();

  const auth = await open({ issue: 'none' });
  type(fields(auth)[1]!, 'oude-sleutel');
  auth.issue = 'auth';
  await settle(auth);
  await settle(auth);
  expect(fields(auth)[1]!.state).toBe('error');
  expect(fields(auth)[1]!.help).toBe('Je Homey weigert deze sleutel. Plak hem opnieuw of maak een nieuwe.');
  expect(input(fields(auth)[1]!).value).toBe('');
  document.body.replaceChildren();

  const missing = await open({ issue: 'missing-key' });
  expect(fields(missing)[1]!.state).toBe('error');
  document.body.replaceChildren();

  const invalid = await open({ issue: 'invalid-address' });
  expect(fields(invalid)[0]!.state).toBe('error');
});

test('typing in a field clears the problem shown at it', async () => {
  const screen = await open({ issue: 'missing-key' });
  type(fields(screen)[1]!, 'k');
  await settle(screen);
  expect(fields(screen)[1]!.state).toBe('idle');
});

test('a revoked key shows the note, the title Opnieuw verbinden and the saved address', async () => {
  const screen = await open({ issue: 'revoked', address: ID });
  expect(inside(screen, 'h2').textContent).toBe('Opnieuw verbinden');
  expect(text(screen)).toContain('Je sleutel werkt niet meer.');
  expect(input(fields(screen)[0]!).value).toBe(ID);
  expect(input(fields(screen)[1]!).value).toBe('');
});

test('the permission hint appears when asked', async () => {
  const screen = await open({ busy: true, waitingForPermission: true });
  expect(text(screen)).toContain('Wacht op toestemming van je browser…');
});

test('the rights review names what is missing and offers both ways on', async () => {
  const screen = await open({ review: ['startFlows'] });
  expect(inside(screen, 'h2').textContent).toBe('Verbonden. Deze sleutel mag niet alles.');
  const missing = [...screen.shadowRoot!.querySelectorAll('.results li.missing')];
  expect(missing).toHaveLength(1);
  expect(missing[0]!.textContent).toContain('Flows starten ontbreekt');
  expect(missing[0]!.textContent).toContain('Flow-knoppen blijven uitgeschakeld.');
  expect(text(screen)).toContain('Apparaten bekijken en bedienen');
  const continues = record(screen, 'continue');
  const others = record(screen, 'other-key');
  const [go, other] = buttons(screen);
  press(go!);
  press(other!);
  expect(continues).toHaveLength(1);
  expect(others).toHaveLength(1);
  expect(screen.shadowRoot!.querySelectorAll('mh-text-field')).toHaveLength(0);
});

test('looking around first: in a house, or in a camper', async () => {
  const screen = await open();
  const demos = record(screen, 'demo');
  press(buttons(screen).find((b) => b.textContent?.trim() === 'Rondkijken in een voorbeeldhuis')!);
  press(buttons(screen).find((b) => b.textContent?.trim() === 'Of in een camper')!);
  expect(demos).toEqual([{ which: 'house' }, { which: 'camper' }]);
});

test('the key never ends up in an attribute or in the page text', async () => {
  const screen = await open();
  type(fields(screen)[1]!, 'geheim-123');
  await settle(screen);
  expect(screen.outerHTML).not.toContain('geheim-123');
  expect(screen.shadowRoot!.innerHTML).not.toContain('geheim-123');
  expect(text(screen)).not.toContain('geheim-123');
  expect(fields(screen)[1]!.outerHTML).not.toContain('geheim-123');
});

test('two different Homey IDs give their own error at the address field', async () => {
  const screen = await open({ issue: 'ambiguous-address' });
  expect(fields(screen)[0]!.state).toBe('error');
  expect(fields(screen)[0]!.help).toBe('Dit adres bevat twee verschillende Homey-ID\'s. Plak het adres van één Homey.');
});

test('while busy a cancel button stops the attempt', async () => {
  const idle = await open();
  expect(buttons(idle).some((b) => b.textContent?.trim() === 'Annuleren')).toBe(false);
  document.body.replaceChildren();
  const screen = await open({ busy: true });
  const cancels = record(screen, 'cancel');
  const cancel = buttons(screen).find((b) => b.textContent?.trim() === 'Annuleren')!;
  expect(cancel).toBeDefined();
  press(cancel);
  expect(cancels).toHaveLength(1);
});

test('the event with the key stays at the screen: it does not bubble and does not leave the shadow root', async () => {
  const screen = await open({ address: ID });
  const seen: Event[] = [];
  screen.addEventListener('connect', (event) => seen.push(event));
  const above: Event[] = [];
  document.body.addEventListener('connect', (event) => above.push(event));
  type(fields(screen)[1]!, 'geheim');
  await settle(screen);
  press(buttons(screen)[0]!);
  expect(seen).toHaveLength(1);
  expect(seen[0]!.bubbles).toBe(false);
  expect(seen[0]!.composed).toBe(false);
  expect(above).toHaveLength(0);
});

test('the permission hint also mentions a mistyped address', async () => {
  const screen = await open({ busy: true, waitingForPermission: true });
  expect(text(screen)).toContain('Wacht op toestemming van je browser… Duurt het lang, kijk dan ook of het adres klopt.');
});

test('for the weather and the energy two more rights are named, as a choice: the seven stay the seven', async () => {
  const screen = await open();
  expect(screen.shadowRoot!.querySelectorAll('.rights li')).toHaveLength(7);
  expect(inside(screen, '.rights-more').textContent?.replace(/\s+/g, ' ').trim()).toBe('Voor de widgets Weer en Energie ook Locatie en Energie, als je Homey die rechten aanbiedt.');
});

test('it advises a key of its own for every device, and says where the key goes', async () => {
  const screen = await open();
  expect(text(screen)).toContain('Maak een nieuwe sleutel voor dit apparaat en vink deze zeven rechten aan:');
  const notes = [...screen.shadowRoot!.querySelectorAll('mh-note')].map((note) => note.textContent!.replace(/\s+/g, ' ').trim());
  expect(notes).toContain('Een eigen sleutel per apparaat. Raak je er een kwijt, dan verwijder je in my.homey.app alleen die sleutel.');
  expect(fields(screen)[1]!.getAttribute('help')).toBe('Blijft in deze browser en gaat alleen naar je Homey: thuis rechtstreeks, onderweg via de Homey-cloud.');
});
