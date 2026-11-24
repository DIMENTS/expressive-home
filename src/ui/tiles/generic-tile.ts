import type { DeviceTileSpec } from '../../dashboard/types';
import { DeviceTileElement } from './tile-base';

/** The generic tile: icon, name and the value of its capability as the state; an alarm can make it on or danger. */
export class MhGenericTile extends DeviceTileElement<Extract<DeviceTileSpec, { kind: 'generic' }>> {}

if (!customElements.get('mh-generic-tile')) customElements.define('mh-generic-tile', MhGenericTile);
