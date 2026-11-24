// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/tiles/index';
import '../../../src/ui/screens/section';
import type { MhSection } from '../../../src/ui/screens/section';
import { generateDashboard } from '../../../src/dashboard/generate';
import { toSnapshot } from '../../../src/homey/map';
import { houseRaw } from '../../../src/mock/house';
import { inside, mount, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

// What the head of a section says goes along with its devices.

afterEach(() => { document.body.replaceChildren(); });

async function section(grouping: 'type' | 'zone', id: string) {
  const house = toSnapshot(houseRaw('nl'));
  const fake = fakeContext(Object.values(house.devices));
  fake.store.apply({ type: 'structure', zones: house.zones, flows: [] });
  fake.flush();
  const found = generateDashboard(house, { grouping }).sections.find((s) => s.id === id)!;
  const element = await mount<MhSection>('mh-section', { section: found, ctx: fake.ctx, density: 'comfortable', note: '' });
  return {
    element, count: () => element.shadowRoot!.querySelector('.count')?.textContent ?? '', title: () => inside(element, 'h2').textContent!.trim(),
    async set(deviceId: string, capabilityId: string, value: unknown) {
      fake.store.apply({ type: 'capability', deviceId, capabilityId, value: value as never, at: null });
      fake.flush();
      await settle(element);
    },
  };
}

test('curtains, music and security count along', async () => {
  const covers = await section('type', 'type:covers');
  expect(covers.count()).toBe('3 open');
  await covers.set('living-blind', 'windowcoverings_set', 0);
  expect(covers.count()).toBe('2 open');
  const media = await section('type', 'type:media');
  await media.set('living-speaker', 'speaker_playing', false);
  expect(media.count()).toBe('');
  const security = await section('type', 'type:security');
  await security.set('hall-lock', 'locked', false);
  expect(security.count()).toBe('1 van slot');
});

test('the head of a room says its temperature, also when that is no tile of it', async () => {
  const living = await section('zone', 'own:zone:living');
  expect([living.title(), living.count()]).toEqual(['Woonkamer', '20,8°']);
  await living.set('living-motion', 'measure_temperature', 19.4);
  expect(living.count()).toBe('19,4°');
  // the sensor says nothing any more: the thermostat does
  await living.set('living-motion', 'measure_temperature', null);
  expect(living.count()).toBe('20,5°');
});

test('a room without a temperature says what is on', async () => {
  const hall = await section('zone', 'own:zone:hall');
  expect(hall.count()).toBe('Alles uit');
  await hall.set('hall-lamp', 'onoff', true);
  expect(hall.count()).toBe('1 aan');
});
