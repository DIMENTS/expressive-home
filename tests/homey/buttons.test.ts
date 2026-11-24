import { expect, test } from 'vitest';
import { buttonId, buttonName, buttonsIn, isButton } from '../../src/homey/buttons';
import { toFlow } from '../../src/homey/map';

test('a name is a text of somebody, without spaces around it', () => {
  expect(['Film kijken', '  Film   kijken ', 'Film\nkijken'].map(buttonName)).toEqual(['Film kijken', 'Film kijken', 'Film kijken']);
  expect(['😀', '"><b>', 'constructor', 'a'.repeat(60)].map(buttonName)).toEqual(['😀', '"><b>', 'constructor', 'a'.repeat(60)]);
  // nothing to show, nothing that can ever start, and no end
  expect([undefined, null, 5, {}, '', '   ', '[[homey:manager:logic|x]]', 'Film [[x]]', 'a'.repeat(61), '😀'.repeat(61)].map(buttonName)).toEqual(Array(10).fill(null));
});

test('capitals make no difference', () => {
  expect(buttonId('Film Kijken')).toBe(buttonId('film kijken'));
  expect(buttonId('É')).toBe(buttonId('e\u0301'.normalize('NFC').toLowerCase()));
  expect([isButton(buttonId('x')), isButton('12345678-1234'), isButton('')]).toEqual([true, false, false]);
});

const CARD = 'homey:app:app.expressive.home:dashboard_button';

test('the buttons of a flow are in its trigger, also in an Advanced Flow', () => {
  expect(buttonsIn({ trigger: { id: CARD, args: { button: ' Film ' } } })).toEqual(['Film']);
  // as older versions of Homey write a card
  expect(buttonsIn({ trigger: { uri: 'homey:app:app.expressive.home', id: 'dashboard_button', args: { button: 'Film' } } })).toEqual(['Film']);
  expect(buttonsIn({ cards: {
    a: { type: 'trigger', id: CARD, args: { button: 'Film' } }, b: { type: 'trigger', id: CARD, args: { button: 'Nacht' } }, c: { type: 'trigger', id: CARD, args: { button: 'film' } },
    d: { type: 'action', id: CARD, args: { button: 'Nee' } }, e: { type: 'trigger', id: 'homey:app:other:dashboard_button', args: { button: 'Nee' } }, f: null,
  } })).toEqual(['Film', 'Nacht']);
  for (const raw of [null, {}, { trigger: null }, { trigger: { id: CARD } }, { trigger: { id: CARD, args: { button: 5 } } }, { trigger: { id: 'homey:manager:flow:programmatic_trigger' } }, { cards: 'x' }]) expect(buttonsIn(raw)).toEqual([]);
});

test('a flow knows its buttons and whether it is off; any other flow is as it was', () => {
  expect(toFlow({ id: 'f', name: 'Film', enabled: true, triggerable: false, trigger: { id: CARD, args: { button: 'Film' } } }, 'flow')).toEqual({ id: 'f', name: 'Film', kind: 'flow', startable: false, buttons: ['Film'] });
  expect(toFlow({ id: 'f', name: 'Film', enabled: false, cards: { a: { type: 'trigger', id: CARD, args: { button: 'Film' } } } }, 'advanced')).toEqual({ id: 'f', name: 'Film', kind: 'advanced', startable: false, buttons: ['Film'], off: true });
  expect(toFlow({ id: 'f', name: 'Alles uit', enabled: false }, 'flow')).toEqual({ id: 'f', name: 'Alles uit', kind: 'flow', startable: false });
});
