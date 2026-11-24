import { html, nothing } from 'lit';
import { mediaOf, mediaState } from '../../controls/media';
import type { DeviceTileSpec, HouseKind } from '../../dashboard/types';
import type { Device } from '../../homey/types';
import { mediaNames } from '../model/media-view';
import { controlButton, controlButtonIf } from './control-styles';
import { ControlTileElement } from './control-tile';

/** So many buttons fit beside the volume. */
const BUTTONS = 3;

/** A speaker or a television: what it plays; wide with its buttons and the volume. */
export class MhMediaTile extends ControlTileElement<Extract<DeviceTileSpec, { kind: HouseKind }>> {
  protected override renderControls(device: Device) {
    const media = mediaOf(device);
    if (!media) return nothing;
    const { t, actions } = this.ctx;
    const { playing, next, prev, onoff, mute, volume, up, down } = media;
    const state = mediaState(media);
    const names = mediaNames(device, media, t);
    const press = (cap: { id: string }) => () => actions.press(device.id, cap.id, true);
    const first = playing ? [prev, playing, next] : [onoff];
    const mutes = mute !== null && first.filter((cap) => cap !== null).length + 1 < BUTTONS;
    return html`<div class="line">
      ${playing ? html`
        ${controlButtonIf(prev, () => ({ icon: 'skip_previous', label: names.prev, run: press(prev!), filled: true }))}
        ${controlButton({ icon: state.playing ? 'pause' : 'play_arrow', label: names.play, run: () => this.command(playing.id, !state.playing), main: state.playing === true, filled: true })}
        ${controlButtonIf(next, () => ({ icon: 'skip_next', label: names.next, run: press(next!), filled: true }))}`
      : controlButtonIf(onoff, () => ({ icon: 'power_settings_new', label: names.power, run: () => this.command(onoff!.id, onoff!.value !== true), main: state.on === true }))}
      ${controlButtonIf(mutes, () => ({ icon: state.muted ? 'volume_off' : 'volume_up', label: names.mute, run: () => this.command(mute!.id, mute!.value !== true) }))}
      ${volume ? this.renderSlider({ cap: volume, fraction: state.volume ?? 0, label: names.volume, valueText: names.volumeText, dimmed: this.view.state !== 'on' })
      : html`${controlButtonIf(down, () => ({ icon: 'remove', label: names.softer, run: press(down!) }))}${controlButtonIf(up, () => ({ icon: 'add', label: names.louder, run: press(up!) }))}`}
    </div>`;
  }
}

if (!customElements.get('mh-media-tile')) customElements.define('mh-media-tile', MhMediaTile);
