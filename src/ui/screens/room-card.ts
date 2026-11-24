import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { live } from 'lit/directives/live.js';
import type { Device } from '../../homey/types';
import { roomCard, type Room, type RoomCard } from '../../rooms/rooms';
import type { UiContext } from '../app/context';
import { PHONE_MAX_PX } from '../breakpoints';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/button';
import '../parts/icon';
import '../parts/switch';

/** What the card of a room and its head have in common: what there is, and the switch for its lamps. */
abstract class RoomElement extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    room: { attribute: false },
    lit: { type: Boolean, reflect: true },
  };

  declare ctx: UiContext;
  declare room: Room;
  /** A lamp is on. */
  declare lit: boolean;
  protected card: RoomCard = { lit: false, lamps: null, facts: [] };
  private listening: (() => void)[] = [];

  static override styles = [sharedStyles, css`
    :host { display: block; min-width: 0; }
    .facts { display: flex; flex-wrap: wrap; gap: var(--space-6) var(--space-16); min-height: var(--icon-m); }
    .fact {
      display: inline-flex; align-items: center; gap: var(--space-6); min-width: 0; font-size: var(--type-label-m-size); line-height: var(--type-label-m-line);
      font-weight: var(--weight-medium); color: var(--_muted, var(--c-on-surface-variant)); --icon-size: var(--icon-s);
    }
    .fact.danger { color: var(--tile-alert-fg); background: var(--tile-alert-bg); border-radius: var(--shape-full); padding: var(--space-2) var(--space-10) var(--space-2) var(--space-6); margin: calc(var(--space-2) * -1) 0; }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    this.listen();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const stop of this.listening) stop();
    this.listening = [];
  }

  private listen(): void {
    for (const stop of this.listening) stop();
    this.listening = !this.ctx || !this.room || !this.isConnected ? []
      : [this.ctx.store.subscribeStructure(() => this.requestUpdate()), ...this.room.deviceIds.map((id) => this.ctx.store.subscribeDevice(id, () => this.requestUpdate()))];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('ctx') || changed.has('room')) this.listen();
    const snapshot = this.ctx?.store.getSnapshot();
    if (!snapshot || !this.room) return;
    const devices = Object.fromEntries(this.room.deviceIds.flatMap((id): [string, Device][] => { const device = this.ctx.store.getDevice(id); return device ? [[id, device]] : []; }));
    this.card = roomCard(this.room, { ...snapshot, devices }, this.ctx.t);
    this.lit = this.card.lit;
  }

  /** `said`: the name of what they stand in says them already. */
  protected renderFacts(said = false): TemplateResult {
    return html`<div class="facts" aria-hidden=${said ? 'true' : nothing}>${this.card.facts.map((fact) => html`<span class="fact ${fact.danger ? 'danger' : ''}"><mh-icon name=${fact.icon} ?filled=${fact.danger ?? false}></mh-icon>${fact.text}</span>`)}</div>`;
  }

  protected renderLamps(): TemplateResult | typeof nothing {
    const { lamps } = this.card;
    if (!lamps) return nothing;
    const stop = (event: Event): void => event.stopPropagation();
    return html`<mh-switch label=${this.ctx.t('rooms.lamps', { name: this.room.name })} .checked=${live(lamps.on > 0)} @click=${stop} @keydown=${stop}
      @change=${(event: CustomEvent<{ checked: boolean }>) => {
        event.stopPropagation();
        this.ctx.actions.lamps(lamps.ids, event.detail.checked);
        // draw again: when nothing came of it, live() puts the switch back
        this.requestUpdate();
      }}></mh-switch>`;
  }
}

/** A room on the screen with the rooms: its name, what there is, and a switch for its lamps. Reports `open-room`. */
export class MhRoomCard extends RoomElement {
  static override styles = [...RoomElement.styles, css`
    .card {
      --_bg: var(--section-bg); --_fg: var(--section-fg);
      display: grid; align-content: space-between; gap: var(--space-14); height: 100%; min-height: var(--room-card-height); padding: var(--space-16) var(--space-20); border-radius: var(--section-radius);
      background: var(--_bg); color: var(--_fg); cursor: pointer; user-select: none; -webkit-user-select: none;
      transition: background-color var(--motion-effects), color var(--motion-effects), transform var(--motion-spatial), border-radius var(--motion-spatial);
    }
    :host([lit]) .card { --_bg: var(--tile-on-bg); --_fg: var(--tile-on-fg); --_muted: var(--tile-on-fg); }
    .card:hover { background: color-mix(in srgb, var(--_fg) var(--state-hover), var(--_bg)); }
    .card:active:not(:has(mh-switch:active)) { transform: scale(var(--press-scale)); }
    .card:has(.face:focus-visible) { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .top { display: flex; align-items: center; gap: var(--space-12); min-width: 0; }
    .face { display: flex; align-items: center; gap: var(--space-12); flex: 1; min-width: 0; outline: none; }
    .icon {
      flex: none; width: var(--sheet-icon-box); height: var(--sheet-icon-box); display: grid; place-items: center; border-radius: var(--shape-full);
      background: var(--tile-bg); color: var(--tile-icon-fg); clip-path: var(--shape-circle); transition: background-color var(--motion-effects), color var(--motion-effects), clip-path var(--motion-spatial);
    }
    :host([lit]) .icon { background: var(--tile-icon-on-bg); color: var(--tile-icon-on-fg); clip-path: var(--shape-cookie); }
    b { min-width: 0; font-size: var(--type-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong); overflow-wrap: anywhere; hyphens: auto; }
    @media (width < ${PHONE_MAX_PX}px) {
      .card { padding: var(--space-14) var(--space-16); min-height: 0; gap: var(--space-10); }
      b { font-size: var(--type-body-l-size); }
    }
    @media (prefers-reduced-motion: reduce) { :host([lit]) .icon { clip-path: var(--shape-circle); } }
  `];

  private open(): void {
    this.dispatchEvent(new CustomEvent('open-room', { detail: { id: this.room.id }, bubbles: true, composed: true }));
  }

  /** Puts the focus on the card. */
  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector<HTMLElement>('.face')?.focus(options);
  }

  override render() {
    const { room, card } = this;
    const label = [room.name, ...card.facts.map((fact) => fact.text)].join(', ');
    return html`<div class="card" @click=${() => this.open()}>
      <div class="top">
        <div class="face" role="button" tabindex="0" aria-label=${label}
          @keydown=${(event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.open(); } }}>
          <span class="icon"><mh-icon name=${room.icon} ?filled=${this.lit}></mh-icon></span><b>${room.name}</b>
        </div>
        ${this.renderLamps()}
      </div>
      ${this.renderFacts(true)}
    </div>`;
  }
}

/** The head of an open room: the way back, its name, what there is, and the switch for its lamps. Reports `back`. */
export class MhRoomHead extends RoomElement {
  /** Puts the focus on the name of the room: where one is now. */
  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector('h2')?.focus(options);
  }

  static override styles = [...RoomElement.styles, css`
    .head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-8) var(--space-12); margin: 0 var(--space-4) var(--space-20); }
    .back { margin-left: calc(var(--space-8) * -1); }
    h2:focus { outline: none; }
    h2 { margin: 0; min-width: 0; font-size: var(--type-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong); overflow-wrap: anywhere; }
    .facts { flex: 1 1 auto; margin-left: var(--space-8); }
    .name { display: flex; align-items: center; gap: var(--space-10); min-width: 0; --icon-size: var(--icon-l); }
    @media (width < ${PHONE_MAX_PX}px) { .facts { flex: 1 0 100%; order: 3; margin: 0; } .name { flex: 1; } .head { margin-bottom: var(--space-14); } }
  `];

  override render() {
    const { t } = this.ctx;
    return html`<div class="head">
      <mh-button class="back" variant="icon" label=${t('rooms.back')} @click=${() => this.dispatchEvent(new CustomEvent('back', { bubbles: true, composed: true }))}><mh-icon name="arrow_back"></mh-icon></mh-button>
      <div class="name"><mh-icon name=${this.room.icon} filled></mh-icon><h2 tabindex="-1">${this.room.name}</h2></div>
      ${this.renderFacts()}${this.renderLamps()}
    </div>`;
  }
}

if (!customElements.get('mh-room-card')) customElements.define('mh-room-card', MhRoomCard);
if (!customElements.get('mh-room-head')) customElements.define('mh-room-head', MhRoomHead);

declare global {
  interface HTMLElementTagNameMap { 'mh-room-card': MhRoomCard; 'mh-room-head': MhRoomHead }
}
