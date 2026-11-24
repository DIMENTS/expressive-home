import type { DeviceTileSpec } from '../../dashboard/types';
import { DeviceTileElement } from './tile-base';

/** The button tile: icon, name and "Indrukken"; a tap presses the button. */
export class MhButtonTile extends DeviceTileElement<Extract<DeviceTileSpec, { kind: 'button' }>> {}

if (!customElements.get('mh-button-tile')) customElements.define('mh-button-tile', MhButtonTile);
