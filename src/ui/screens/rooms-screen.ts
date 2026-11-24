import { LitElement, css, html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { Room } from '../../rooms/rooms';
import type { UiContext } from '../app/context';
import { PHONE_MAX_PX } from '../breakpoints';
import { sharedStyles } from '../parts/shared-styles';
import './room-card';

/** The screen with the rooms: a card for every room, in the order of the hub. A card reports `open-room` { id }. */
export class MhRooms extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    rooms: { attribute: false },
  };

  declare ctx: UiContext;
  declare rooms: Room[];

  constructor() {
    super();
    this.rooms = [];
  }

  static override styles = [sharedStyles, css`
    :host { display: block; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--room-card-min)), 1fr)); gap: var(--section-gap); }
    @media (width < ${PHONE_MAX_PX}px) { .grid { gap: var(--space-10); } }
  `];

  /** Puts the focus on the card of a room. */
  focusRoom(id: string): void {
    [...(this.shadowRoot?.querySelectorAll('mh-room-card') ?? [])].find((card) => card.room.id === id)?.focus();
  }

  override render() {
    return html`<div class="grid" role="list" aria-label=${this.ctx.t('nav.rooms')}>${repeat(this.rooms, (room) => room.id, (room) => html`<mh-room-card role="listitem" .ctx=${this.ctx} .room=${room}></mh-room-card>`)}</div>`;
  }
}

if (!customElements.get('mh-rooms')) customElements.define('mh-rooms', MhRooms);

declare global {
  interface HTMLElementTagNameMap { 'mh-rooms': MhRooms }
}
