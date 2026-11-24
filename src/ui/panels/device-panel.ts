import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { live } from 'lit/directives/live.js';
import { isDangerous, isGuarded } from '../../controls/danger';
import type { CapabilityValue, Device } from '../../homey/types';
import { formatValue, joinValue } from '../../i18n/format';
import type { UiContext } from '../app/context';
import { coverWait } from '../model/cover-view';
import { controlFor, deviceView, parseNumberInput, type Control, type DeviceView } from '../model/device-view';
import { goesAlong, stepOf, valueAt } from '../model/slider-math';
import { askDanger } from '../parts/ask-danger';
import { richText } from '../parts/rich-text';
import { sharedStyles } from '../parts/shared-styles';
import { deviceTop, paintTop, topStyles } from './device-tops';
import { panelStyles } from './panel-styles';
import '../parts/button';
import '../parts/choice-group';
import '../parts/icon';
import '../parts/note';
import '../parts/radio-list';
import '../parts/sheet';
import '../parts/slider';
import '../parts/switch';
import '../parts/text-field';

/**
 * The device window: the floating panel with every settable capability as a
 * control, the readable values in two columns and the technical details folded away. It follows live
 * changes; without a route, without the right to control or for an unreachable device the controls are
 * switched off with a note and the last known values stay. It asks to close when its device disappears.
 */
export class MhDevicePanel extends LitElement {
  static override properties = {
    deviceId: { attribute: false },
    ctx: { attribute: false },
    drafts: { state: true },
    invalid: { state: true },
  };

  declare deviceId: string | null;
  declare ctx: UiContext;
  /** What is being typed in a number or text field, by capability id, until it is sent. */
  declare drafts: Record<string, string>;
  /** The number fields whose last sent text was no number, by capability id. */
  declare invalid: Record<string, boolean>;
  private listening: (() => void)[] = [];
  /** The device that was shown, so the panel can keep its contents while it slides out. */
  private lastView: DeviceView | null = null;
  private lastDevice: Device | undefined;
  /** Where a slider is being dragged to that is only sent when it is let go. */
  preview: { capabilityId: string; value: number } | null = null;
  private arrives: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.deviceId = null;
    this.drafts = {};
    this.invalid = {};
  }

  static override styles = [sharedStyles, panelStyles, topStyles, css`
    :host { display: contents; }
    /* its parts stand as they would without it */
    .below { display: contents; }
    .held { display: flex; gap: var(--space-8); min-width: 0; }
    .held > * { flex: 1 1 0; }
    .row > .held { flex: 0 1 var(--control-held-width); }
    .held.list { flex-direction: column; }
    .number { display: flex; align-items: flex-end; gap: var(--space-8); }
    .number mh-text-field { flex: 1; }
    .number mh-button { margin-bottom: var(--space-24); }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    this.listen();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopListening();
    this.stopWaiting();
  }

  private stopWaiting(): void {
    if (this.arrives !== null) clearTimeout(this.arrives);
    this.arrives = null;
  }

  private stopListening(): void {
    for (const stop of this.listening) stop();
    this.listening = [];
  }

  private listen(): void {
    this.stopListening();
    if (!this.ctx || !this.deviceId || !this.isConnected) return;
    const redraw = () => this.requestUpdate();
    this.listening = [this.ctx.store.subscribeDevice(this.deviceId, redraw), this.ctx.store.subscribeStructure(redraw)];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('deviceId') || changed.has('ctx')) {
      this.listen();
      if (changed.has('deviceId')) { this.drafts = {}; this.invalid = {}; this.preview = null; }
    }
  }

  protected override updated(): void {
    if (this.ctx) paintTop(this.renderRoot, this.lastDevice);
    this.stopWaiting();
    const wait = this.deviceId && this.ctx ? coverWait(this.ctx.store.getDevice(this.deviceId)) : null;
    if (wait !== null) this.arrives = setTimeout(() => this.requestUpdate(), wait);
    // the device disappeared while its window was open: ask to close
    if (this.deviceId && this.ctx && !this.ctx.store.getDevice(this.deviceId)) this.close();
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  /** What can be dangerous is asked about first. */
  private tell(id: string, capabilityId: string, value: CapabilityValue): void {
    const device = this.ctx.store.getDevice(id);
    if (device && isGuarded(device, capabilityId)) askDanger(this, this.ctx, id, capabilityId, value);
    else this.ctx.actions.setCapability(id, capabilityId, value);
  }

  /** A button for one thing a lock or a garage door can be told: held, or asked about. */
  private renderHeld(device: Device, capabilityId: string, value: CapabilityValue, text: string, label: string, enabled: boolean, current?: boolean) {
    const { ctx } = this;
    const dangerous = isDangerous(device, capabilityId, value);
    return html`<mh-hold-button text=${text} label=${label} ?guarded=${dangerous} ?busy=${ctx.busy(device.id) !== null} ?disabled=${!enabled} ?main=${current ?? false} pressed=${current === undefined ? nothing : String(current)}
      @go=${() => { if (!current) ctx.actions.guard(device.id, capabilityId, value); }} @ask=${() => askDanger(this, ctx, device.id, capabilityId, value)}></mh-hold-button>`;
  }

  /** The control of something that can be dangerous. */
  private renderGuarded(device: Device, control: Control, enabled: boolean) {
    const { t } = this.ctx;
    const { capabilityId, label: title } = control;
    switch (control.kind) {
      case 'switch': return html`<div class="row"><span class="label">${title}<small>${t(control.checked ? 'tile.on' : 'tile.off')}</small></span>
        <div class="held">${this.renderHeld(device, capabilityId, !control.checked, t(control.checked ? 'panel.turnOff' : 'panel.turnOn'), t(control.checked ? 'panel.guard.off' : 'panel.guard.on', { title }), enabled)}</div></div>`;
      case 'action': return html`<div class="row"><span class="label">${title}</span>
        <div class="held">${this.renderHeld(device, capabilityId, true, t('panel.run'), t('panel.guard.run', { title }), enabled)}</div></div>`;
      case 'slider': {
        const cap = device.capabilities[capabilityId]!;
        const ends = [cap.min ?? 0, cap.max ?? 1].map((value) => ({ value, text: joinValue(formatValue({ ...cap, value }, 'full', t)) }));
        return html`<div class="row stack"><div class="top"><span class="label">${title}</span><span class="value">${control.valueText}</span></div>
          <div class="held">${ends.map(({ value, text }) => this.renderHeld(device, capabilityId, value, text, t('panel.guard.to', { title, value: text }), enabled))}</div></div>`;
      }
      case 'choice': return html`<div class="row stack"><span class="label">${title}</span><div class="held list">${control.options.map((option) =>
        this.renderHeld(device, capabilityId, option.id, option.label, t('panel.guard.to', { title, value: option.label }), enabled, control.value === option.id))}</div></div>`;
      default: return null;
    }
  }

  private send(control: Control, value: string): void {
    const id = this.deviceId;
    if (!id) return;
    if (control.kind === 'number') {
      const number = parseNumberInput(value, this.ctx.t.language);
      if (number === null) {
        this.invalid = { ...this.invalid, [control.capabilityId]: true };
        return;
      }
      this.tell(id, control.capabilityId, number);
    } else {
      this.tell(id, control.capabilityId, value);
    }
    // Sent: the field shows what the hub has again, also when the hub settles on another value.
    const { [control.capabilityId]: _sent, ...rest } = this.drafts;
    this.drafts = rest;
  }

  private renderControl(control: Control, enabled: boolean) {
    const id = this.deviceId!;
    const t = this.ctx.t;
    const device = this.ctx.store.getDevice(id);
    const guarded = device && isGuarded(device, control.capabilityId) ? this.renderGuarded(device, control, enabled) : null;
    if (guarded) return guarded;
    switch (control.kind) {
      case 'switch':
        return html`<div class="row"><span class="label">${control.label}</span>
          <mh-switch label=${control.label} .checked=${live(control.checked)} ?disabled=${!enabled}
            @change=${(e: CustomEvent<{ checked: boolean }>) => { this.ctx.actions.setCapability(id, control.capabilityId, e.detail.checked); this.requestUpdate(); }}></mh-switch></div>`;
      case 'action':
        return html`<div class="row"><span class="label">${control.label}</span>
          <mh-button variant="tonal" small ?disabled=${!enabled} @click=${() => this.ctx.actions.press(id, control.capabilityId)}>${t('panel.run')}</mh-button></div>`;
      case 'slider': {
        const cap = this.ctx.store.getDevice(id)?.capabilities[control.capabilityId];
        const along = cap === undefined || goesAlong(cap.baseId);
        const preview = this.preview?.capabilityId === control.capabilityId && cap ? controlFor({ ...cap, value: this.preview.value }, t) : null;
        const text = preview?.kind === 'slider' ? preview.valueText : control.valueText;
        const range = { min: cap?.min ?? 0, max: cap?.max ?? 1, step: cap?.step ?? null };
        const step = stepOf(range) / ((range.max - range.min) || 1);
        const slide = (fraction: number, final: boolean) => {
          const value = valueAt(fraction, range);
          this.preview = final || along ? null : { capabilityId: control.capabilityId, value };
          if (final || along) this.ctx.actions.slide(id, control.capabilityId, value, final);
          if (final || !along) this.requestUpdate();
        };
        return html`<div class="row stack"><div class="top"><span class="label">${control.label}</span><span class="value">${text}</span></div>
          <mh-slider .fraction=${live(control.fraction)} label=${control.label} valueText=${text} variant=${control.variant} .step=${step} ?disabled=${!enabled}
            @slide=${(e: CustomEvent<{ fraction: number }>) => slide(e.detail.fraction, false)}
            @commit=${(e: CustomEvent<{ fraction: number }>) => slide(e.detail.fraction, true)}></mh-slider></div>`;
      }
      case 'choice': {
        const change = (e: CustomEvent<{ value: string }>) => { this.send(control, e.detail.value); this.requestUpdate(); };
        return html`<div class="row stack"><span class="label">${control.label}</span>${control.layout === 'buttons'
          ? html`<mh-choice-group label=${control.label} .options=${control.options} .value=${live(control.value ?? '')} ?disabled=${!enabled} @change=${change}></mh-choice-group>`
          : html`<mh-radio-list label=${control.label} .options=${control.options} .value=${live(control.value ?? '')} ?disabled=${!enabled} @change=${change}></mh-radio-list>`}</div>`;
      }
      case 'number':
      case 'text': {
        // Dutch writes a decimal comma, English a point; both are accepted when sending.
        const written = (value: number) => (t.language === 'nl' ? String(value).replace('.', ',') : String(value));
        const current = control.kind === 'number' ? (control.value === null ? '' : written(control.value)) : control.value;
        const draft = this.drafts[control.capabilityId] ?? current;
        // read the draft when sending: a submit can follow the last keystroke before a redraw
        const submit = () => this.send(control, this.drafts[control.capabilityId] ?? current);
        return html`<div class="row stack"><div class="number">
          <mh-text-field label=${control.kind === 'number' && control.unit ? `${control.label} (${control.unit})` : control.label} .value=${draft} ?disabled=${!enabled}
            state=${this.invalid[control.capabilityId] ? 'error' : 'idle'} help=${this.invalid[control.capabilityId] ? t('panel.invalidNumber') : ''}
            @input=${(e: CustomEvent<{ value: string }>) => {
              this.drafts = { ...this.drafts, [control.capabilityId]: e.detail.value };
              if (this.invalid[control.capabilityId]) this.invalid = { ...this.invalid, [control.capabilityId]: false };
            }}
            @submit=${submit}></mh-text-field>
          <mh-button variant="tonal" small ?disabled=${!enabled} @click=${submit}>${t('panel.confirm')}</mh-button>
        </div></div>`;
      }
    }
  }

  private renderBody(view: DeviceView) {
    const t = this.ctx.t;
    const status = this.ctx.status();
    const note = view.unavailable ? html`<mh-note icon="link_off" tone="error">${richText(t('panel.unavailable', { reason: view.unavailable }))}</mh-note>`
      : status.route === null ? html`<mh-note icon="cloud_off">${t('panel.offline')}</mh-note>`
        : !status.canControl ? html`<mh-note icon="lock">${t('panel.readonly')}</mh-note>` : nothing;
    const enabled = !view.unavailable && status.route !== null && status.canControl;
    const device = this.lastDevice;
    const draw = (cap: Parameters<typeof controlFor>[0]) => {
      const control = controlFor(cap, t);
      return control ? this.renderControl(control, enabled) : nothing;
    };
    return html`${note}
      ${view.house && device ? deviceTop(this, device, view.house, enabled, draw) : nothing}
      <div class="below">${view.controls.length ? html`<section><h3>${t('panel.control')}</h3><div class="rows">${view.controls.map((c) => this.renderControl(c, enabled))}</div></section>` : nothing}
      ${view.values.length ? html`<section><h3>${t('panel.values')}</h3><div class="values">${view.values.map((v) => html`
        <div class="cell ${v.danger ? 'danger' : ''}"><span>${v.label}</span><b>${v.text}</b></div>`)}</div></section>` : nothing}
      ${view.technical.length ? html`<details><summary><mh-icon name="chevron_right"></mh-icon>${t('panel.technical')}</summary>
        <div class="values">${view.technical.map((v) => html`<div class="cell"><span>${v.label}</span><b>${v.text}</b></div>`)}</div></details>` : nothing}</div>`;
  }

  override render() {
    const device = this.deviceId && this.ctx ? this.ctx.store.getDevice(this.deviceId) : undefined;
    const view = device ? deviceView(device, this.ctx.store.getSnapshot()?.zones ?? {}, this.ctx.t, this.ctx.busy(device.id)) : null;
    if (view) this.lastView = view;
    if (device) this.lastDevice = device;
    const shown = view ?? this.lastView;
    const open = view !== null;
    return html`<mh-sheet .t=${this.ctx.t} ?open=${open} heading=${shown?.name ?? ''} subheading=${shown ? [shown.zoneName, shown.line].filter(Boolean).reduce((a, b) => (a ? this.ctx.t('tile.join', { a, b }) : b), '') : ''} icon=${shown?.icon ?? ''}
      ?iconOn=${!!shown && shown.on && !shown.unavailable} @close=${(e: Event) => { e.stopPropagation(); this.close(); }}>
      ${shown && this.ctx ? this.renderBody(shown) : nothing}
    </mh-sheet>`;
  }
}

if (!customElements.get('mh-device-panel')) customElements.define('mh-device-panel', MhDevicePanel);

declare global {
  interface HTMLElementTagNameMap { 'mh-device-panel': MhDevicePanel }
}
