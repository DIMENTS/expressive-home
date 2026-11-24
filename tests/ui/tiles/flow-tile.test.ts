// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '../../../src/ui/tiles/index';
import { createTile } from '../../../src/ui/tiles/registry';
import { FLOW_FEEDBACK_MS, type MhFlowTile } from '../../../src/ui/tiles/flow-tile';
import type { DashboardStatus } from '../../../src/ui/app/context';
import { inside, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const spec = { kind: 'flow', id: 'f1:flow', flowId: 'f1', flowKind: 'flow', size: 'single' } as const;

async function setup(result: boolean, status: Partial<DashboardStatus> = {}, flowId = 'f1', startable = true) {
  const fake = fakeContext([], status, [{ id: flowId, name: 'Alles uit', kind: 'flow', startable }]);
  fake.actions.startFlow.mockResolvedValue(result);
  const tile = createTile({ ...spec, flowId }, fake.ctx, 'comfortable') as MhFlowTile;
  document.body.append(tile);
  await tile.updateComplete;
  return { ...fake, tile };
}

const iconName = (tile: MhFlowTile) => inside(tile, 'mh-icon').getAttribute('name');

test('a flow tile carries the name of its flow', async () => {
  const { tile } = await setup(true);
  expect(inside(tile, 'button').textContent).toContain('Alles uit');
  expect(tile.flowName).toBe('Alles uit');
});

test('a flow tile starts the flow and shows that it worked', async () => {
  expect(FLOW_FEEDBACK_MS).toBe(1400);
  const { tile, actions } = await setup(true);
  inside(tile, 'button').click();
  await vi.waitFor(() => expect(actions.startFlow).toHaveBeenCalledWith('f1', 'flow'));
  await settle(tile);
  await settle(tile);
  expect(iconName(tile)).toBe('check_circle');
  vi.advanceTimersByTime(FLOW_FEEDBACK_MS);
  await settle(tile);
  expect(iconName(tile)).toBe('play_arrow');
});

test('a flow tile shows that it failed', async () => {
  const { tile } = await setup(false);
  inside(tile, 'button').click();
  await Promise.resolve();
  await settle(tile);
  await settle(tile);
  expect(iconName(tile)).toBe('error');
  vi.advanceTimersByTime(FLOW_FEEDBACK_MS);
  await settle(tile);
  expect(iconName(tile)).toBe('play_arrow');
});

test('a flow tile is disabled without the right to start flows', async () => {
  const { tile, actions } = await setup(true, { canStartFlows: false });
  const button = inside<HTMLButtonElement>(tile, 'button');
  expect(button.disabled).toBe(true);
  button.click();
  tile.click();
  expect(actions.startFlow).not.toHaveBeenCalled();
});

test('a second tap while a flow is starting does nothing', async () => {
  const { tile, actions } = await setup(true);
  let finish: (ok: boolean) => void = () => {};
  actions.startFlow.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  inside(tile, 'button').click();
  inside(tile, 'button').click();
  expect(actions.startFlow).toHaveBeenCalledTimes(1);
  finish(true);
  await settle(tile);
  inside(tile, 'button').click();
  expect(actions.startFlow).toHaveBeenCalledTimes(2);
});

test('a button starts its flow without the right to start flows', async () => {
  const { tile, actions } = await setup(true, { canStartFlows: false }, 'button:film');
  expect(inside<HTMLButtonElement>(tile, 'button').disabled).toBe(false);
  inside(tile, 'button').click();
  expect(actions.startFlow).toHaveBeenCalledWith('button:film', 'flow');
});

test('a button whose flows are all off is disabled, until one is on again', async () => {
  const { tile, actions, store, flush } = await setup(true, {}, 'button:film', false);
  const button = () => inside<HTMLButtonElement>(tile, 'button');
  expect(button().disabled).toBe(true);
  button().click();
  expect(actions.startFlow).not.toHaveBeenCalled();
  store.apply({ type: 'structure', zones: {}, flows: [{ id: 'button:film', name: 'Film', kind: 'flow', startable: true }] });
  flush();
  await settle(tile);
  expect([button().disabled, tile.flowName]).toEqual([false, 'Film']);
  // gone: pressing it says so
  store.apply({ type: 'structure', zones: {}, flows: [] });
  flush();
  await settle(tile);
  expect([button().disabled, tile.flowName]).toEqual([false, 'Flow verdwenen']);
});
