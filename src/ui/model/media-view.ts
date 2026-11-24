import { mediaState, type Media } from '../../controls/media';
import type { Device } from '../../homey/types';
import type { Translate } from '../../i18n/index';

export interface MediaNames { prev: string; play: string; next: string; shuffle: string; repeat: string; channelUp: string; channelDown: string; power: string; mute: string; softer: string; louder: string; volume: string; volumeText: string }

/** What the buttons of a speaker or a television are called, as it is now. */
export function mediaNames(device: Device, media: Media, t: Translate): MediaNames {
  const { name } = device;
  const { playing, on, muted, volume } = mediaState(media);
  return {
    prev: t('media.label.prev', { name }), next: t('media.label.next', { name }), play: t(playing ? 'media.label.pause' : 'media.label.play', { name }),
    power: t(on === null ? 'media.label.power' : on ? 'media.label.off' : 'media.label.on', { name }), mute: t(muted ? 'media.label.unmute' : 'media.label.mute', { name }),
    shuffle: t('media.label.shuffle', { name }), repeat: t('media.label.repeat', { name }), channelUp: t('media.label.channelUp', { name }), channelDown: t('media.label.channelDown', { name }),
    softer: t('media.label.softer', { name }), louder: t('media.label.louder', { name }), volume: t('media.label.volume', { name }),
    volumeText: volume === null ? '' : t('media.percent', { n: Math.round(volume * 100) }),
  };
}
