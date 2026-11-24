import { expect, test } from 'vitest';
import { addressShape, maskDigits, parseAddress, privateIPv4From } from '../../src/homey/address';

const ID = '64a1b2c3d4e5f60718293a4b'; const OTHER = '0123456789abcdef01234567';

test('privateIPv4From finds a private address and nothing else', () => {
  expect(privateIPv4From('192.168.1.50')).toBe('192.168.1.50');
  expect(privateIPv4From('192.168.1.50:80')).toBe('192.168.1.50');
  expect(privateIPv4From('10.0.0.7/24')).toBe('10.0.0.7');
  expect(privateIPv4From('172.20.3.4')).toBe('172.20.3.4');
  for (const no of ['8.8.8.8', '172.32.0.1', 'fe80::1', '999.168.1.1', '', undefined, null, 42]) expect(privateIPv4From(no)).toBeNull();
});
test('privateIPv4From skips what is not an address and takes the first private one', () => {
  expect(privateIPv4From('wlan0 8.8.8.8, 192.168.2.9 en 10.0.0.1')).toBe('192.168.2.9');
  for (const no of ['1192.168.1.50', '192.168.1.500', '192.168.1', '192.168.1.50.7', '172.15.0.1', '11.0.0.1']) expect(privateIPv4From(no)).toBeNull();
});
test('maskDigits keeps the shape and hides the digits', () => { expect(maskDigits('192.168.1.50:80')).toBe('nnn.nnn.n.nn:nn'); });
test('addressShape shows the form of the field and nothing that identifies', () => {
  expect(addressShape('192.168.1.50:80')).toBe('nnn.nnn.n.nn:nn');
  expect(addressShape('Camper 10.0.0.7')).toBe('aaaaaa nn.n.n.n');
  expect(addressShape(undefined)).toBeNull();
  expect(addressShape(null)).toBe('(object)');
  expect(addressShape(42)).toBe('(number)');
  expect(addressShape('1'.repeat(200))).toHaveLength(60);
});

test('parseAddress reads an id from a pasted address, a bare id or an IP address', () => {
  expect(parseAddress(`https://my.homey.app/homeys/${ID}/devices`)).toEqual({ kind: 'homeyId', homeyId: ID });
  expect(parseAddress(`https://my.homey.app/homeys/${ID}/x?ref=${OTHER}`)).toEqual({ kind: 'invalid', reason: 'ambiguous' });
  expect(parseAddress(`  ${ID.toUpperCase()}\n`)).toEqual({ kind: 'homeyId', homeyId: ID });
  expect(parseAddress(' 192.168.1.50 ')).toEqual({ kind: 'ip', address: '192.168.1.50' });
  expect(parseAddress('http://192.168.1.50/')).toEqual({ kind: 'ip', address: '192.168.1.50' });
  for (const bad of ['', '   ', 'hallo', '999.1.1.1', `${ID}0`]) expect(parseAddress(bad)).toEqual({ kind: 'invalid', reason: 'unknown' });
  expect(parseAddress(`${ID} ${OTHER}`)).toEqual({ kind: 'invalid', reason: 'ambiguous' });
});
test('parseAddress handles the messy ways people paste', () => {
  // The id right after homeys/ wins, also in upper case and without a scheme.
  expect(parseAddress(`MY.HOMEY.APP/HOMEYS/${ID.toUpperCase()}`)).toEqual({ kind: 'homeyId', homeyId: ID });
  // The same id twice is still one id.
  expect(parseAddress(`${ID}\n${ID}`)).toEqual({ kind: 'homeyId', homeyId: ID });
  // An id inside a longer hexadecimal run is not an id.
  expect(parseAddress(`a${ID}`)).toEqual({ kind: 'invalid', reason: 'unknown' });
  expect(parseAddress(`https://my.homey.app/homeys/${ID}ff/devices`)).toEqual({ kind: 'invalid', reason: 'unknown' });
  expect(parseAddress('https://192.168.1.50')).toEqual({ kind: 'ip', address: '192.168.1.50' });
  for (const bad of ['192.168.1.50:80', 'http://192.168.1.50/x', '192.168.1', 'https://my.homey.app/', 'ftp://192.168.1.50']) expect(parseAddress(bad)).toEqual({ kind: 'invalid', reason: 'unknown' });
});

test.each(['192.168.001.020', '0.0.0.0', '10.0.0.01', 'http://010.0.0.1/'])('%s is not a usable address', (input) => {
  expect(parseAddress(input)).toEqual({ kind: 'invalid', reason: 'unknown' });
});
test('an id after homeys/ and a different id elsewhere is ambiguous', () => {
  expect(parseAddress('https://my.homey.app/homeys/5f2a00000000000000000c81 en 5f2a00000000000000000c82')).toEqual({ kind: 'invalid', reason: 'ambiguous' });
});
test('the same id twice is fine', () => {
  expect(parseAddress('homeys/5f2a00000000000000000c81 5f2a00000000000000000c81')).toEqual({ kind: 'homeyId', homeyId: '5f2a00000000000000000c81' });
  expect(parseAddress('homeys/5f2a00000000000000000c81 5F2A00000000000000000C81')).toEqual({ kind: 'homeyId', homeyId: '5f2a00000000000000000c81' });
});
test('a plain address with a zero in it is still fine', () => {
  expect(parseAddress('10.0.0.1')).toEqual({ kind: 'ip', address: '10.0.0.1' });
  expect(parseAddress('192.168.0.100')).toEqual({ kind: 'ip', address: '192.168.0.100' });
});
