import type { DeviceTileSpec } from '../../dashboard/types';
import { DeviceTileElement } from './tile-base';

/** The switch tile: icon, name and state with one detail value ("Aan · 45 W"); a tap toggles. */
export class MhSwitchTile extends DeviceTileElement<Extract<DeviceTileSpec, { kind: 'switch' }>> {}

if (!customElements.get('mh-switch-tile')) customElements.define('mh-switch-tile', MhSwitchTile);
