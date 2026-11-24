import { expect, test } from 'vitest';
import { offeredFlows } from '../../src/homey/flows';
import type { Flow, FlowAccess } from '../../src/homey/types';

const flows: Flow[] = [
  { id: 'button:film', name: 'Film', kind: 'flow', startable: true }, { id: 'button:nacht', name: 'Nacht', kind: 'flow', startable: false },
  { id: 'f1', name: 'Alles uit', kind: 'flow', startable: true }, { id: 'f2', name: 'Automatisch', kind: 'advanced', startable: false },
];
const offered = (flowAccess?: FlowAccess) => offeredFlows({ flows, ...(flowAccess === undefined ? {} : { flowAccess }) }).map((flow) => flow.id);

test('what can be chosen: the buttons, also one that is off, and with a key what can be started by hand', () => {
  expect([offered('works'), offered('refused'), offered('none')]).toEqual([['button:film', 'button:nacht', 'f1'], ['button:film', 'button:nacht', 'f1'], ['button:film', 'button:nacht']]);
  // a page with a key of its own does not have this
  expect(offered()).toEqual(['button:film', 'button:nacht', 'f1']);
});
