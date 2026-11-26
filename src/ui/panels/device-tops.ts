import { css, html, nothing, type TemplateResult } from 'lit';
import { live } from 'lit/directives/live.js';
import { clampTarget, climateOf, climateState, targetRange, targetStep } from '../../controls/climate';
import { coverCommands, coverOf, type CoverCommand } from '../../controls/cover';
import { fraction } from '../../controls/find';
import { guardOf } from '../../controls/guard';
import { applianceOf, applianceState } from '../../controls/appliance';
import { carOf, carState } from '../../controls/car';
import { chargerOf, chargerState } from '../../controls/charger';
import { fanOf, fanState } from '../../controls/fan';
import { vacuumCommands, vacuumOf, vacuumState } from '../../controls/vacuum';
import { formatKwh } from '../../widgets/energy';
import { applianceCommand, chargerCommand } from '../model/held-view';
import { heldButton } from '../tiles/held';
import { mediaOf, mediaState } from '../../controls/media';
import type { HouseKind } from '../../dashboard/types';
import type { Capability, Device } from '../../homey/types';
import { formatValue, joinValue } from '../../i18n/format';
import type { UiContext } from '../app/context';
import { targetView } from '../model/climate-view';
import { coverNames, coverText } from '../model/cover-view';
import { changedText, houseTile, modeOf, nextRepeat, positionsOf, shutOf, slatsOf, songPlace } from '../model/device-top';
import { carLock, guardCommands, type GuardCommand } from '../model/guard-view';
import { mediaNames } from '../model/media-view';
import { fractionOf, stepOf, valueAt } from '../model/slider-math';
import { dangerOf, degrees, guardText } from '../model/tile-view';
import { askDanger } from '../parts/ask-danger';
import { controlButton, controlButtonIf, controlStyles } from '../tiles/control-styles';
import '../parts/hold-button';
import '../parts/icon';
import '../parts/slider';
import '../parts/stepper';

/** The window a top is drawn in. */
export interface TopHost extends EventTarget {
  ctx: UiContext;
  /** Where a slider is being dragged to that is only sent when it is let go. */
  preview: { capabilityId: string; value: number } | null;
  requestUpdate(): void;
}

/** A value that is sent when its slider is let go; until then the window says where that would be. */
function settle(host: TopHost, device: Device, cap: Capability, value: number, final: boolean): void {
  host.preview = final ? null : { capabilityId: cap.id, value };
  if (final) host.ctx.actions.slide(device.id, cap.id, value, true);
  host.requestUpdate();
}

/** What is shown of a capability: where its slider is dragged to, otherwise what the hub says. */
const shown = (host: TopHost, cap: Capability): Capability => (host.preview?.capabilityId === cap.id ? { ...cap, value: host.preview.value } : cap);
type Draw = (cap: Capability) => TemplateResult | typeof nothing;

export const topStyles = [controlStyles, css`
  .top-of { display: grid; gap: var(--space-14); container-type: inline-size; }
  .top-of > * { min-width: 0; }
  .ends { display: flex; justify-content: space-between; margin-top: calc(var(--space-6) * -1); font-size: var(--type-label-s-size); line-height: var(--type-label-s-line); color: var(--c-on-surface-variant); }
  .top-of > mh-slider, .top-of .row mh-slider { --slider-height: var(--sheet-slider-height); }
  .top-of .b { width: auto; min-width: var(--control-height); }
  .top-of .line.tall .b { height: var(--control-large-height); border-radius: var(--control-large-radius); flex: 1 1 0; --icon-size: var(--icon-l); }
  .top-of .line.song-buttons { justify-content: center; }
  .top-of .line.song-buttons .b { flex: 0 1 auto; width: var(--target-min); height: var(--target-min); background: transparent; --icon-size: var(--icon-l); }
  .top-of .line.song-buttons .b:hover { background: color-mix(in srgb, currentColor var(--state-hover), transparent); }
  .top-of .line.song-buttons .b[aria-pressed="true"] { color: var(--c-primary); background: var(--control-bg); }
  .top-of .line.song-buttons .b.main, .top-of .line.song-buttons .b.middle { width: var(--control-large-width); height: var(--control-large-height); border-radius: var(--control-large-radius); }
  .top-of .line.song-buttons .b.main { background: var(--control-main-bg); color: var(--control-main-fg); }
  .top-of .line.song-buttons .b.middle:not(.main) { background: var(--control-bg); }
  .top-of .line mh-hold-button { flex: 1 1 0; }
  .top-of .line.sound { flex: 1; }
  .top-of > mh-stepper { padding: var(--space-8) 0; }

  .win { position: relative; height: var(--top-window-height); border-radius: var(--sheet-row-radius); background: var(--top-window-bg); overflow: hidden; }
  /* the frame */
  .win::before { content: ""; position: absolute; inset: 0; background: linear-gradient(var(--top-frame), var(--top-frame)) center / var(--space-6) 100% no-repeat, linear-gradient(var(--top-frame), var(--top-frame)) center / 100% var(--space-6) no-repeat; }
  .cloth {
    position: absolute; inset: 0 0 auto; height: max(var(--top-roll), calc(var(--_shut, 0) * 100%));
    background: repeating-linear-gradient(var(--top-cloth-bg) 0 var(--top-slat), var(--top-cloth-line) var(--top-slat) calc(var(--top-slat) + var(--space-2)));
    transition: height var(--motion-effects);
  }
  .cloth::after {
    content: ""; position: absolute; left: 50%; bottom: 0; width: var(--rail-indicator-width); height: var(--space-6); transform: translateX(-50%);
    border-radius: var(--shape-full); background: var(--c-primary);
  }
  .win.sides .cloth { inset: 0 auto 0 0; height: auto; width: max(var(--top-bunch), calc(var(--_shut, 0) * 50%)); transition: width var(--motion-effects); background: repeating-linear-gradient(to right, var(--top-cloth-bg) 0 var(--top-slat), var(--top-cloth-line) var(--top-slat) calc(var(--top-slat) + var(--space-2))); }
  .win.sides .cloth + .cloth { inset: 0 0 0 auto; }
  .win.sides .cloth::after { display: none; }

  .art { height: var(--top-art-height); border-radius: var(--sheet-row-radius); display: grid; place-items: center; background: var(--top-art-bg); color: var(--c-on-primary-container); --icon-size: var(--top-art-icon); }
  .song { display: grid; gap: var(--space-2); text-align: center; overflow-wrap: anywhere; }
  .song b { font-size: var(--type-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong); }
  .song span { font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); color: var(--c-on-surface-variant); }
  .bar { position: relative; height: var(--space-4); border-radius: var(--shape-full); background: var(--slider-track); overflow: hidden; }
  .bar::before { content: ""; position: absolute; inset: 0 auto 0 0; width: calc(var(--_part, 0) * 100%); background: var(--slider-fill); border-radius: inherit; }
  .times { display: flex; justify-content: space-between; margin-top: calc(var(--space-8) * -1); font-size: var(--type-label-s-size); line-height: var(--type-label-s-line); color: var(--c-on-surface-variant); font-variant-numeric: tabular-nums; }

  .stands { display: grid; justify-items: center; gap: var(--space-8); padding: var(--space-24) var(--space-16); border-radius: var(--sheet-row-radius); background: var(--sheet-row-bg); text-align: center; }
  .stands .big {
    width: var(--top-icon-box); height: var(--top-icon-box); display: grid; place-items: center; border-radius: var(--shape-full); --icon-size: var(--top-icon);
    background: var(--tile-icon-bg); color: var(--tile-icon-fg); transition: background-color var(--motion-effects), color var(--motion-effects);
  }
  .stands.on .big { background: var(--tile-icon-on-bg); color: var(--tile-icon-on-fg); }
  .stands.danger { background: var(--tile-alert-bg); color: var(--tile-alert-fg); }
  .stands.danger .big { background: var(--tile-icon-alert-bg); color: var(--tile-icon-alert-fg); }
  .stands b { font-size: var(--type-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong); }
  .stands .alarm { font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); }
  .stands span.since { font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
  .stands.danger span.since { color: inherit; }
`];

function climateTop(host: TopHost, device: Device, enabled: boolean, draw: Draw) {
  const climate = climateOf(device);
  if (!climate) return nothing;
  const { t, actions } = host.ctx;
  const { humidity } = climate;
  const target = shown(host, climate.target);
  const { target: value } = climateState({ ...climate, target });
  const { min, max } = targetRange(target);
  const { value: text, unit, spoken, less, more, atLeast, atMost } = targetView(device, target, value, t);
  const at = (part: number): number => clampTarget(target, valueAt(part, { min, max, step: targetStep(target) }));
  const slide = (event: CustomEvent<{ fraction: number }>, final: boolean): void => settle(host, device, target, at(event.detail.fraction), final);
  const mode = modeOf(device);
  return html`
    <mh-stepper large value=${text} unit=${unit} spoken=${spoken} less=${less} more=${more} ?atLeast=${atLeast || !enabled} ?atMost=${atMost || !enabled}
      @step=${(event: CustomEvent<{ steps: number }>) => actions.nudge(device.id, event.detail.steps)}></mh-stepper>
    <mh-slider .fraction=${live(value === null ? 0 : fractionOf(value, { min, max, step: null }))} label=${t('climate.slider', { name: device.name })} valueText=${value === null ? '' : degrees(value, t)}
      .step=${targetStep(target) / (max - min || 1)} ?disabled=${!enabled} @slide=${(e: CustomEvent<{ fraction: number }>) => slide(e, false)} @commit=${(e: CustomEvent<{ fraction: number }>) => slide(e, true)}></mh-slider>
    <div class="ends"><span>${degrees(min, t)}</span><span>${degrees(max, t)}</span></div>
    ${mode ? draw(mode) : nothing}
    ${humidity ? html`<div class="row"><span class="label">${humidity.title}</span><span class="value">${joinValue(formatValue(humidity, 'full', t))}</span></div>` : nothing}`;
}

function coverTop(host: TopHost, device: Device, enabled: boolean, draw: Draw) {
  const cover = coverOf(device);
  if (!cover) return nothing;
  const { t, actions } = host.ctx;
  const names = coverNames(device, cover, t);
  const { up, stop, down } = coverCommands(cover);
  const run = ({ capabilityId, value }: CoverCommand) => () => actions.setCapability(device.id, capabilityId, value);
  const positions = positionsOf(device);
  const position = (real: Capability): TemplateResult => {
    const cap = shown(host, real);
    const open = fraction(cap);
    const part = open === null ? null : cover.awning ? 1 - open : open;
    const range = { min: cap.min ?? 0, max: cap.max ?? 1, step: cap.step };
    const slide = (event: CustomEvent<{ fraction: number }>, final: boolean): void => {
      const { fraction: to } = event.detail;
      settle(host, device, cap, valueAt(cover.awning ? 1 - to : to, range), final);
    };
    const one = positions.length === 1;
    const text = coverText(part, cover.awning, t);
    return html`<div class="row stack"><div class="top"><span class="label">${one ? t('cover.position') : cap.title}</span><span class="value">${text}</span></div>
      <mh-slider .fraction=${live(part ?? 0)} label=${one ? names.position : cap.title} valueText=${text} .step=${stepOf(range) / (range.max - range.min || 1)} ?disabled=${!enabled}
        @slide=${(e: CustomEvent<{ fraction: number }>) => slide(e, false)} @commit=${(e: CustomEvent<{ fraction: number }>) => slide(e, true)}></mh-slider></div>`;
  };
  return html`
    ${shutOf(cover) === null ? nothing : html`<div class="win ${device.deviceClass === 'curtain' ? 'sides' : ''}" aria-hidden="true"><i class="cloth"></i>${device.deviceClass === 'curtain' ? html`<i class="cloth"></i>` : nothing}</div>`}
    <div class="line tall">
      ${controlButton({ icon: 'keyboard_arrow_up', label: names.up, run: run(up), disabled: !enabled })}
      ${controlButtonIf(stop, () => ({ icon: 'stop', label: names.stop, run: run(stop!), filled: true, disabled: !enabled }))}
      ${controlButton({ icon: 'keyboard_arrow_down', label: names.down, run: run(down), disabled: !enabled })}
    </div>
    ${positions.map(position)}${slatsOf(device).map(draw)}`;
}

function mediaTop(host: TopHost, device: Device, enabled: boolean) {
  const media = mediaOf(device);
  if (!media) return nothing;
  const { t, actions } = host.ctx;
  const { playing, next, prev, shuffle, repeat, album, onoff, mute, volume, up, down, channelUp, channelDown } = media;
  const state = mediaState(media);
  const names = mediaNames(device, media, t);
  const disabled = !enabled;
  const press = (cap: Capability | null) => () => actions.press(device.id, cap!.id, true);
  const set = (cap: Capability, value: string | boolean) => () => actions.setCapability(device.id, cap.id, value);
  const by = [state.artist, typeof album?.value === 'string' ? album.value.trim() : ''].filter(Boolean);
  const place = songPlace(media);
  const slide = (event: CustomEvent<{ fraction: number }>, final: boolean): void => {
    actions.slide(device.id, volume!.id, valueAt(event.detail.fraction, { min: volume!.min ?? 0, max: volume!.max ?? 1, step: volume!.step }), final);
    if (final) host.requestUpdate();
  };
  const sound = mute || volume || up || down;
  return html`
    ${state.title ? html`<div class="art" aria-hidden="true"><mh-icon name="music_note" filled></mh-icon></div>
      <div class="song"><b>${state.title}</b>${by.length ? html`<span>${by.length === 2 ? t('tile.join', { a: by[0]!, b: by[1]! }) : by[0]}</span>` : nothing}</div>
      ${place ? html`<div class="bar" data-part=${place.part}></div><div class="times"><span>${place.at}</span><span>${place.of}</span></div>` : nothing}` : nothing}
    <div class="line song-buttons">
      ${controlButtonIf(shuffle, () => ({ icon: 'shuffle', label: names.shuffle, run: set(shuffle!, shuffle!.value !== true), pressed: shuffle!.value === true, disabled }))}
      ${controlButtonIf(prev, () => ({ icon: 'skip_previous', label: names.prev, run: press(prev), filled: true, disabled }))}
      ${playing ? controlButton({ icon: state.playing ? 'pause' : 'play_arrow', label: names.play, run: set(playing, !state.playing), main: true, filled: true, disabled })
      : controlButtonIf(onoff, () => ({ icon: 'power_settings_new', label: names.power, run: set(onoff!, onoff!.value !== true), main: state.on === true, middle: true, disabled }))}
      ${controlButtonIf(next, () => ({ icon: 'skip_next', label: names.next, run: press(next), filled: true, disabled }))}
      ${controlButtonIf(repeat, () => ({ icon: repeat!.value === 'track' ? 'repeat_one' : 'repeat', label: names.repeat, run: set(repeat!, nextRepeat(repeat!)), pressed: typeof repeat!.value === 'string' && repeat!.value !== 'none', disabled }))}
    </div>
    ${sound ? html`<div class="row"><div class="line sound">
      ${controlButtonIf(mute, () => ({ icon: state.muted ? 'volume_off' : 'volume_up', label: names.mute, run: set(mute!, mute!.value !== true), disabled }))}
      ${volume ? html`<mh-slider .fraction=${live(state.volume ?? 0)} label=${names.volume} valueText=${names.volumeText} ?dimmed=${state.muted === true} ?disabled=${disabled}
        @slide=${(e: CustomEvent<{ fraction: number }>) => slide(e, false)} @commit=${(e: CustomEvent<{ fraction: number }>) => slide(e, true)}></mh-slider>`
      : html`${controlButtonIf(down, () => ({ icon: 'remove', label: names.softer, run: press(down), disabled }))}${controlButtonIf(up, () => ({ icon: 'add', label: names.louder, run: press(up), disabled }))}`}
    </div></div>` : nothing}
    ${channelUp || channelDown ? html`<div class="row"><span class="label">${t('media.channel')}</span><div class="line">
      ${controlButtonIf(channelDown, () => ({ icon: 'keyboard_arrow_down', label: names.channelDown, run: press(channelDown), disabled }))}
      ${controlButtonIf(channelUp, () => ({ icon: 'keyboard_arrow_up', label: names.channelUp, run: press(channelUp), disabled }))}</div></div>` : nothing}`;
}

function guardTop(host: TopHost, device: Device, enabled: boolean) {
  const guard = guardOf(device);
  if (!guard) return nothing;
  const { ctx } = host;
  const view = houseTile(device, 'guard', ctx.t, ctx.busy(device.id));
  const since = changedText(guard.cap, new Date(), ctx.t);
  const alarm = dangerOf(device);
  const commands = guardCommands(device, ctx.t);
  const busy = ctx.busy(device.id) !== null;
  const many = commands.length > 2;
  const button = (command: GuardCommand): TemplateResult => html`<mh-hold-button large text=${command.text} short=${command.short} label=${command.label} icon=${many ? '' : command.icon}
    ?guarded=${command.guarded} ?busy=${busy} ?disabled=${!enabled} ?main=${many ? command.current : !command.guarded} pressed=${many ? String(command.current) : nothing}
    @go=${() => { if (!command.current) ctx.actions.guard(device.id, command.capabilityId, command.value); }}
    @ask=${() => askDanger(host, ctx, device.id, command.capabilityId, command.value)}></mh-hold-button>`;
  return html`
    <div class="stands ${alarm ? 'danger' : view.state}"><span class="big"><mh-icon name=${view.icon === 'link_off' ? 'lock' : view.icon} filled></mh-icon></span>
      <b role="status">${guardText(device, ctx.t, ctx.busy(device.id))}</b>${alarm ? html`<span class="alarm" role="alert">${alarm.title}</span>` : nothing}${since ? html`<span class="since">${since}</span>` : nothing}</div>
    ${commands.length ? html`<div class="line ${many ? 'joined' : 'apart'}">${commands.map(button)}</div>` : nothing}`;
}

/** Its state large, with its icon; in colour as on its tile. */
function standsOf(host: TopHost, device: Device, kind: HouseKind, more: TemplateResult | typeof nothing = nothing): TemplateResult {
  const view = houseTile(device, kind, host.ctx.t, host.ctx.busy(device.id));
  const said = view.stateText || view.name;
  // only the word of its state is read out when it changes, not every number beside it
  return html`<div class="stands ${view.state}"><span class="big"><mh-icon name=${view.icon === 'link_off' ? 'devices_other' : view.icon} filled></mh-icon></span>
    <b>${said}</b><span class="unseen" role="status">${said.split(' · ')[0]}</span>${more}</div>`;
}

/** How full or how far, 0 to 1: painted through the CSSOM. */
const barOf = (part: number | null): TemplateResult | typeof nothing => (part === null ? nothing : html`<div class="bar" aria-hidden="true" data-part=${String(Math.round(part * 1000) / 1000)}></div>`);

function fanTop(host: TopHost, device: Device, enabled: boolean, draw: Draw) {
  const fan = fanOf(device);
  if (!fan) return nothing;
  const { t } = host.ctx;
  const speed = fan.speed ? shown(host, fan.speed) : null;
  const { on, oscillating } = fanState(fan);
  const part = fraction(speed);
  const name = { name: device.name };
  const range = { min: speed?.min ?? 0, max: speed?.max ?? 1, step: speed?.step ?? null };
  return html`${standsOf(host, device, 'fan')}
    <div class="line tall">
      ${controlButtonIf(fan.onoff, () => ({ icon: 'power_settings_new', label: t('fan.label.power', name), run: () => host.ctx.actions.setCapability(device.id, fan.onoff!.id, on !== true), main: on === true, disabled: !enabled }))}
      ${controlButtonIf(fan.oscillating, () => ({ icon: 'swap_horiz', label: t('fan.label.swing', name), run: () => host.ctx.actions.setCapability(device.id, fan.oscillating!.id, oscillating !== true), pressed: oscillating === true, disabled: !enabled }))}
    </div>
    ${speed ? html`<mh-slider .fraction=${live(part ?? 0)} label=${t('fan.label.speed', name)} valueText=${part === null ? '' : `${Math.round(part * 100)}%`} .step=${stepOf(range) / (range.max - range.min || 1)} ?disabled=${!enabled}
      @slide=${(e: CustomEvent<{ fraction: number }>) => settle(host, device, speed, valueAt(e.detail.fraction, range), false)}
      @commit=${(e: CustomEvent<{ fraction: number }>) => settle(host, device, speed, valueAt(e.detail.fraction, range), true)}></mh-slider>` : nothing}
    ${fan.mode ? draw(fan.mode) : nothing}`;
}

function vacuumTop(host: TopHost, device: Device, enabled: boolean, draw: Draw) {
  const vacuum = vacuumOf(device);
  if (!vacuum) return nothing;
  const { t, actions } = host.ctx;
  const { stand, battery } = vacuumState(vacuum);
  const { go, pause, dock } = vacuumCommands(vacuum);
  const cleaning = stand === 'cleaning' || stand === 'spot_cleaning';
  const first = cleaning ? pause : go;
  const name = { name: device.name };
  return html`${standsOf(host, device, 'vacuum')}${barOf(battery === null ? null : battery / 100)}
    ${first || dock ? html`<div class="line tall">
      ${controlButtonIf(first, () => ({ icon: cleaning ? 'pause' : 'play_arrow', label: t(cleaning ? 'vacuum.label.pause' : 'vacuum.label.go', name), run: () => actions.setCapability(device.id, first!.capabilityId, first!.value), main: true, filled: true, disabled: !enabled }))}
      ${controlButtonIf(dock, () => ({ icon: 'home_pin', label: t('vacuum.label.dock', name), run: () => actions.setCapability(device.id, dock!.capabilityId, dock!.value), disabled: !enabled }))}
    </div>` : nothing}
    ${vacuum.job ? draw(vacuum.job) : nothing}`;
}

function applianceTop(host: TopHost, device: Device, enabled: boolean) {
  const appliance = applianceOf(device);
  if (!appliance) return nothing;
  const { progress } = applianceState(appliance);
  const command = applianceCommand(device, host.ctx.t);
  return html`${standsOf(host, device, 'appliance')}${barOf(progress === null ? null : progress / 100)}
    ${command ? html`<div class="line">${heldButton(host as unknown as HTMLElement, host.ctx, device, command, { large: true, enabled })}</div>` : nothing}`;
}

function chargerTop(host: TopHost, device: Device, enabled: boolean, draw: Draw) {
  const charger = chargerOf(device);
  if (!charger) return nothing;
  const { t } = host.ctx;
  const { session } = chargerState(charger);
  const command = chargerCommand(device, t);
  return html`${standsOf(host, device, 'charger', session === null ? nothing : html`<span class="since">${t('charger.session', { n: formatKwh(session, t) })}</span>`)}
    ${command ? html`<div class="line">${heldButton(host as unknown as HTMLElement, host.ctx, device, command, { large: true, enabled })}</div>` : nothing}
    ${charger.target ? draw(charger.target) : nothing}`;
}

function carTop(host: TopHost, device: Device, enabled: boolean) {
  const car = carOf(device);
  if (!car) return nothing;
  const { t } = host.ctx;
  const { battery, locked, plugged } = carState(car);
  const commands = guardCommands(device, t, carLock(device));
  const facts = [locked === null ? '' : t(locked ? 'guard.locked' : 'guard.unlocked'), plugged === null ? '' : t(plugged ? 'car.plugged' : 'car.unplugged')].filter(Boolean).join(' · ');
  const line = facts.charAt(0).toLocaleUpperCase(t.locale) + facts.slice(1);
  return html`${standsOf(host, device, 'car', line ? html`<span class="since">${line}</span>` : nothing)}${barOf(battery === null ? null : battery / 100)}
    ${commands.length ? html`<div class="line">${commands.map((command) => heldButton(host as unknown as HTMLElement, host.ctx, device, { ...command, main: !command.guarded }, { large: true, enabled }))}</div>` : nothing}`;
}

/** The top of the window of a device of a house; `draw` draws a control as it would stand below. */
export function deviceTop(host: TopHost, device: Device, kind: HouseKind, enabled: boolean, draw: Draw): TemplateResult {
  const top = kind === 'climate' ? climateTop(host, device, enabled, draw)
    : kind === 'cover' ? coverTop(host, device, enabled, draw)
      : kind === 'media' ? mediaTop(host, device, enabled)
        : kind === 'fan' ? fanTop(host, device, enabled, draw)
          : kind === 'vacuum' ? vacuumTop(host, device, enabled, draw)
            : kind === 'appliance' ? applianceTop(host, device, enabled)
              : kind === 'charger' ? chargerTop(host, device, enabled, draw)
                : kind === 'car' ? carTop(host, device, enabled)
                  : guardTop(host, device, enabled);
  return html`<div class="top-of ${kind}">${top}</div>`;
}

/** What is measured goes in through the CSSOM: the content security policy allows no style attribute. */
export function paintTop(root: ParentNode, device: Device | undefined): void {
  const cover = device ? coverOf(device) : null;
  const shut = cover ? shutOf(cover) : null;
  if (shut !== null) root.querySelector<HTMLElement>('.win')?.style.setProperty('--_shut', String(shut));
  const bar = root.querySelector<HTMLElement>('.bar');
  bar?.style.setProperty('--_part', bar.dataset['part'] ?? '0');
}
