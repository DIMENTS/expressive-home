import { expect, test } from 'vitest';
import type { HomeySnapshot } from '../../../src/homey/types';
import { createSwitchableTranslate } from '../../../src/i18n';
import { createStore } from '../../../src/state/store';
import { createLocalConfigStore } from '../../../src/storage/local-store';
import { createController } from '../../../src/ui/app/controller';
import { camperSnapshot, fakeHub, HOMEY_ID } from '../../helpers/fake-hub';

// Two tabs of one browser over one storage: what one saves, the other takes over.

const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

/** A storage with storage events to the other tabs, only when the value really changes, as in a browser. */
function browser(connection: { homeyId: string | null; localAddress: string | null; apiKey: string | null } = { homeyId: HOMEY_ID, localAddress: null, apiKey: 'test-key' }) {
  let value: string | null = JSON.stringify({ version: 3, connection, theme: {}, sectionSeeds: {}, language: null, layouts: {} });
  const changed = new Map<number, () => void>();
  const queue: (() => void)[] = [];
  let tabs = 0;
  const counts = { writes: 0 };
  async function openTab(snapshot: HomeySnapshot) {
    const id = (tabs += 1);
    const hub = fakeHub(snapshot);
    const storage = {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        if (next === value) return;
        value = next;
        counts.writes += 1;
        for (const [other, on] of changed) if (other !== id) queue.push(on);
      },
      removeItem: () => { value = null; },
    };
    const controller = createController({
      configStore: createLocalConfigStore(storage), store: createStore((flush) => flush()), createRealClient: () => hub, createDemoClient: () => hub, notify: () => {},
      setTimeout: () => 0, clearTimeout: () => {}, t: createSwitchableTranslate('nl'), browserLanguages: ['nl'],
    });
    changed.set(id, () => { void controller.reloadStored(); });
    await controller.start();
    await settle();
    return { controller, hub };
  }
  /** Hands out the storage events until none are left; the number of them. */
  async function rest(limit = 50): Promise<number> {
    let rounds = 0;
    while (queue.length > 0 && rounds < limit) {
      queue.shift()!();
      await settle();
      rounds += 1;
    }
    return rounds;
  }
  return { openTab, rest, counts, stored: () => JSON.parse(value!) as { connection: { apiKey: string | null }; layouts: Record<string, { names: Record<string, string> }> }, raw: () => value! };
}

/** Takes the first tile of the Overzicht away. */
function removeOne(controller: ReturnType<typeof createController>): void {
  const board = controller.getState().board!;
  const block = [...board.left, ...board.right].find((b) => b.type === 'section' && b.section.tiles.length > 1);
  if (block?.type !== 'section') throw new Error('no section');
  controller.edit({ type: 'remove-tile', dashboardId: 'overview', tileId: block.section.tiles[0]!.id });
}

test('two tabs that see the hub differently come to rest, and undo stays', async () => {
  const b = browser();
  const first = await b.openTab(camperSnapshot());
  removeOne(first.controller);
  await settle();
  // a flow gets another name in the Homey app; flows are read when connecting, so the first tab does not know
  const renamed = camperSnapshot();
  const flow = renamed.flows.find((f) => f.startable)!;
  flow.name = `${flow.name} (nieuw)`;
  const second = await b.openTab(renamed);
  expect(await b.rest()).toBeLessThan(5);
  expect(first.controller.getState().canUndo).toBe(true);
  // and what one of them arranges reaches the other
  removeOne(second.controller);
  await settle();
  expect(await b.rest()).toBeLessThan(5);
  expect(first.controller.getState().layout.dashboards).toEqual(second.controller.getState().layout.dashboards);
  expect(first.controller.getState().canUndo).toBe(false);
});

test('a tab without a route does not write what it saw before', async () => {
  const b = browser();
  const first = await b.openTab(camperSnapshot());
  removeOne(first.controller);
  await settle();
  first.hub.emit({ type: 'route', route: null });
  const renamed = camperSnapshot();
  renamed.devices['device-2']!.name = 'Anders';
  await b.openTab(renamed);
  expect(await b.rest()).toBeLessThan(5);
  expect(b.stored().layouts[HOMEY_ID]!.names['device-2']).toBe('Anders');
});

test('disconnecting in one tab leaves the other too, and the key never comes back', async () => {
  const b = browser();
  const first = await b.openTab(camperSnapshot());
  const second = await b.openTab(camperSnapshot());
  await first.controller.disconnect();
  await settle();
  // before the second tab has heard of it, it saves something
  second.controller.setTheme({ seed: '#a6422a', mode: 'dark', density: 'compact' });
  removeOne(second.controller);
  await settle();
  expect(b.raw()).not.toContain('test-key');
  await b.rest();
  expect(second.controller.getState()).toMatchObject({ phase: 'connect', connectIssue: 'none', editing: false });
  expect(second.hub.disconnect).toHaveBeenCalled();
  second.controller.setTheme({ seed: '#3a5ba9', mode: 'light', density: 'compact' });
  await settle();
  expect(b.raw()).not.toContain('test-key');
  expect(b.stored().connection.apiKey).toBeNull();
});

test('a new key in one tab is not put back by the other', async () => {
  const b = browser();
  const first = await b.openTab(camperSnapshot());
  const second = await b.openTab(camperSnapshot());
  await first.controller.connect('192.168.1.20', 'another-key');
  await settle();
  second.controller.setTheme({ seed: '#a6422a', mode: 'dark', density: 'compact' });
  await settle();
  await b.rest();
  expect(b.stored().connection.apiKey).toBe('another-key');
  expect(second.controller.getState().phase).toBe('dashboard');
});

test('the example hub in one tab stays when the other disconnects', async () => {
  const b = browser();
  const first = await b.openTab(camperSnapshot());
  const second = await b.openTab(camperSnapshot());
  await second.controller.startDemo();
  await first.controller.disconnect();
  await settle();
  await b.rest();
  expect(second.controller.getState().phase).toBe('demo');
  expect(b.raw()).not.toContain('test-key');
});
