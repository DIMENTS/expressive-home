import type { Capability, Device } from '../homey/types';
import { find, fraction, words, yesNo } from './find';

export interface Media {
  playing: Capability | null; next: Capability | null; prev: Capability | null; shuffle: Capability | null; repeat: Capability | null;
  track: Capability | null; artist: Capability | null; album: Capability | null; position: Capability | null; duration: Capability | null;
  volume: Capability | null; up: Capability | null; down: Capability | null; mute: Capability | null; onoff: Capability | null;
  channelUp: Capability | null; channelDown: Capability | null;
}

export const MEDIA_CLASSES: readonly string[] = ['speaker', 'tv', 'amplifier', 'mediaplayer', 'settopbox', 'gameconsole'];

export function mediaOf(device: Device): Media | null {
  if (device.deviceClass === 'light' || device.deviceClass === 'socket') return null;
  const set = (baseId: string): Capability | null => find(device, baseId, { setable: true }) ?? null;
  const read = (baseId: string): Capability | null => find(device, baseId) ?? null;
  const media: Media = {
    playing: set('speaker_playing'), next: set('speaker_next'), prev: set('speaker_prev'), shuffle: set('speaker_shuffle'), repeat: set('speaker_repeat'),
    track: read('speaker_track'), artist: read('speaker_artist'), album: read('speaker_album'), position: read('speaker_position'), duration: read('speaker_duration'),
    volume: find(device, 'volume_set', { setable: true, type: 'number' }) ?? null, up: set('volume_up'), down: set('volume_down'), mute: set('volume_mute'), onoff: set('onoff'),
    channelUp: set('channel_up'), channelDown: set('channel_down'),
  };
  if (media.playing) return media;
  // a doorbell and a vacuum cleaner have a volume too
  const sound = media.volume ?? media.up ?? media.down;
  const ofClass = MEDIA_CLASSES.includes(device.deviceClass);
  return (ofClass && (sound ?? media.next ?? media.mute ?? media.channelUp) !== null) || (device.deviceClass === 'other' && sound !== null) ? media : null;
}

/** Null: it does not tell. */
export interface MediaState { on: boolean | null; playing: boolean | null; title: string; artist: string; volume: number | null; muted: boolean | null }

export function mediaState(media: Media): MediaState {
  const power = media.onoff?.getable ? yesNo(media.onoff) : null;
  const plays = media.playing ? yesNo(media.playing) : null;
  const on = power ?? plays;
  const volume = fraction(media.volume);
  return {
    on, playing: media.playing === null ? null : plays === true && on !== false,
    title: words(media.track), artist: words(media.artist),
    volume: volume === null ? null : Math.round(volume * 1000) / 1000, muted: media.mute?.getable ? yesNo(media.mute) : null,
  };
}
