import { LitElement, css, html, nothing } from 'lit';
import { dateLine, greetingKey } from '../../i18n/format';
import type { UiContext } from '../app/context';
import type { HeaderChip } from '../model/header-view';
import { PHONE_MAX_PX } from '../breakpoints';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/chip';

/**
 * The header: the date line, the greeting by the time of day, and the labels. An alarm
 * label opens its device; "Alleen bekijken" and "Voorbeeld" open the settings. The clock ticks each minute. On a
 * phone a connection that is there is only an icon beside the title; what there is to say is under it.
 */
export class MhHeader extends LitElement {
  static override properties = {
    chips: { attribute: false },
    now: { attribute: false },
    ctx: { attribute: false },
    phone: { type: Boolean },
  };

  declare chips: HeaderChip[];
  declare now: Date;
  declare ctx: UiContext;
  declare phone: boolean;
  private clock: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.chips = [];
    this.now = new Date();
    this.phone = false;
  }

  static override styles = [sharedStyles, css`
    :host { display: block; }
    header {
      display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-16);
      margin: var(--space-8) var(--space-4) var(--space-24);
    }
    p { margin: 0 0 var(--space-4); color: var(--header-eyebrow-fg); font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); font-weight: var(--weight-medium); }
    h1 { margin: 0; font-size: var(--header-title-size); line-height: var(--type-greeting-line); font-weight: var(--weight-strong); letter-spacing: var(--tracking-display); }
    .chips { display: flex; flex-wrap: wrap; gap: var(--space-8); }
    @media (width < ${PHONE_MAX_PX}px) {
      header { flex-wrap: nowrap; align-items: center; margin: var(--space-6) var(--space-4) var(--space-14); }
      header > div { min-width: 0; }
      h1 { overflow-wrap: anywhere; hyphens: auto; }
      .chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: calc(var(--space-6) * -1) 0 var(--space-6); padding: var(--space-6) var(--space-4); }
      .chips::-webkit-scrollbar { display: none; }
      .chips > mh-chip { flex: none; }
    }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    this.tick();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.clock !== null) clearTimeout(this.clock);
    this.clock = null;
  }

  /** Redraws on the next whole minute, then again each minute after. */
  private tick(): void {
    if (this.clock !== null) clearTimeout(this.clock);
    const wait = 60_000 - (Date.now() % 60_000);
    this.clock = setTimeout(() => {
      this.now = new Date();
      this.tick();
    }, wait);
  }

  private navigate(): void {
    this.dispatchEvent(new CustomEvent('navigate', { detail: { to: 'settings' }, bubbles: true, composed: true }));
  }

  private chip(chip: HeaderChip) {
    const t = this.ctx.t;
    switch (chip.kind) {
      case 'route':
        if (chip.connecting) return html`<mh-chip icon="progress_activity" spinning>${t('chip.connecting')}</mh-chip>`;
        if (chip.route === null) return html`<mh-chip icon="cloud_off" tone="alert">${t('chip.offline')}</mh-chip>`;
        return chip.route === 'local'
          ? html`<mh-chip icon="home">${t('chip.local')}</mh-chip>`
          : html`<mh-chip icon="cloud">${t('chip.cloud')}</mh-chip>`;
      case 'alarm':
        return html`<mh-chip icon="warning" tone="alert" interactive @click=${() => this.ctx.actions.openDevice(chip.deviceId)}>${chip.text}</mh-chip>`;
      case 'more':
        return html`<mh-chip tone="alert">${t('chip.more', { n: chip.count })}</mh-chip>`;
      case 'readonly':
        return html`<mh-chip icon="visibility" interactive @click=${() => this.navigate()}>${t('chip.readonly')}</mh-chip>`;
      case 'demo':
        return html`<mh-chip icon="science" interactive @click=${() => this.navigate()}>${t('chip.demo')}</mh-chip>`;
    }
  }

  /** A connection that is there, as an icon; null when there is something to say about it. */
  private routeIcon(): { icon: 'home' | 'cloud'; label: string } | null {
    const route = this.chips.find((chip) => chip.kind === 'route');
    if (!route || route.connecting || route.route === null) return null;
    return route.route === 'local' ? { icon: 'home', label: this.ctx.t('chip.local') } : { icon: 'cloud', label: this.ctx.t('chip.cloud') };
  }

  override render() {
    const title = html`<div><p>${dateLine(this.now, this.ctx.t)}</p><h1>${this.ctx.t(greetingKey(this.now))}</h1></div>`;
    if (!this.phone) return html`<header>${title}<div class="chips">${this.chips.map((chip) => this.chip(chip))}</div></header>`;
    const route = this.routeIcon();
    const rest = route ? this.chips.filter((chip) => chip.kind !== 'route') : this.chips;
    return html`<header>${title}${route ? html`<mh-chip .iconOnly=${true} icon=${route.icon} label=${route.label}></mh-chip>` : nothing}</header>
      ${rest.length > 0 ? html`<div class="chips">${rest.map((chip) => this.chip(chip))}</div>` : nothing}`;
  }
}

if (!customElements.get('mh-header')) customElements.define('mh-header', MhHeader);

declare global {
  interface HTMLElementTagNameMap { 'mh-header': MhHeader }
}
