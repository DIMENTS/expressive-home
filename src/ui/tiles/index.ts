// Registers the built-in tiles. Import this module once; own widgets later register the same way.
import { registerTile } from './registry';
import './light-tile';
import './switch-tile';
import './sensor-tile';
import './tank-tile';
import './multi-tile';
import './generic-tile';
import './button-tile';
import './flow-tile';
import './climate-tile';
import './cover-tile';
import './media-tile';
import './guard-tile';

registerTile({ kind: 'light', tag: 'mh-light-tile', sizes: ['wide', 'single'] });
registerTile({ kind: 'switch', tag: 'mh-switch-tile', sizes: ['single', 'wide'] });
registerTile({ kind: 'sensor', tag: 'mh-sensor-tile', sizes: ['single', 'wide'] });
registerTile({ kind: 'tank', tag: 'mh-tank-tile', sizes: ['single', 'wide'] });
registerTile({ kind: 'multi', tag: 'mh-multi-tile', sizes: ['wide'] });
registerTile({ kind: 'generic', tag: 'mh-generic-tile', sizes: ['single', 'wide'] });
registerTile({ kind: 'button', tag: 'mh-button-tile', sizes: ['single', 'wide'] });
registerTile({ kind: 'flow', tag: 'mh-flow-tile', sizes: ['single'] });
registerTile({ kind: 'climate', tag: 'mh-climate-tile', sizes: ['single', 'wide'] });
registerTile({ kind: 'cover', tag: 'mh-cover-tile', sizes: ['single', 'wide'] });
registerTile({ kind: 'media', tag: 'mh-media-tile', sizes: ['single', 'wide'] });
registerTile({ kind: 'guard', tag: 'mh-guard-tile', sizes: ['single', 'wide'] });
