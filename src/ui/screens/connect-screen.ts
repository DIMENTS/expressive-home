import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { live } from 'lit/directives/live.js';
import { parseAddress } from '../../homey/address';
import type { Feature } from '../../homey/permissions';
import { t as dutch, type Translate } from '../../i18n';
import type { MessageKey } from '../../i18n/index';
import type { ConnectIssue } from '../app/controller';
import { richText } from '../parts/rich-text';
import { sharedStyles } from '../parts/shared-styles';
import { resultListStyles } from '../panels/panel-styles';
import { PHONE_MAX_PX } from '../breakpoints';
import { connectCardStyles } from './connect-card';
import '../parts/button';
import '../parts/icon';
import '../parts/note';
import '../parts/text-field';

const RIGHTS: Feature[] = ['readDevices', 'controlDevices', 'readZones', 'readFlows', 'startFlows', 'readInsights', 'readSystem'];

/**
 * The connect screen: one card, the explanation in three steps on the left and the form
 * on the right; below 880 wide one under the other. The key is only ever in the password field.
 */
export class MhConnectScreen extends LitElement {
  static override properties = {
    t: { attribute: false },
    issue: { type: String },
    busy: { type: Boolean },
    waitingForPermission: { type: Boolean },
    review: { attribute: false },
    address: { type: String },
    addressValue: { state: true },
    keyValue: { state: true },
    addressLeft: { state: true },
    dismissed: { state: true },
  };

  /** The texts, in the language of the app; Dutch until the app sets it. */

  declare t: Translate;

  declare issue: ConnectIssue;
  declare busy: boolean;
  declare waitingForPermission: boolean;
  declare review: Feature[] | null;
  /** The saved address, as a prefill. */
  declare address: string;
  declare addressValue: string;
  declare keyValue: string;
  /** The address field was left once, so nonsense in it may now be shown as an error. */
  declare addressLeft: boolean;
  /** Fields typed in since the problem was reported: the problem no longer shows there. */
  declare dismissed: { address: boolean; key: boolean };

  constructor() {
    super();
    this.t = dutch;
    this.issue = 'none';
    this.busy = false;
    this.waitingForPermission = false;
    this.review = null;
    this.address = '';
    this.addressValue = '';
    this.keyValue = '';
    this.addressLeft = false;
    this.dismissed = { address: false, key: false };
  }

  static override styles = [sharedStyles, connectCardStyles, resultListStyles, css`
    .rights {
      list-style: none; margin: var(--space-10) 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-6) var(--space-12); font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); --icon-size: var(--icon-s);
    }
    @media (width < ${PHONE_MAX_PX}px) { .rights { grid-template-columns: repeat(auto-fill, minmax(var(--connect-right-min), 1fr)); } }
    .rights li { display: flex; align-items: center; gap: var(--space-6); }
    .hint, .advice { margin: 0 0 0 var(--space-4); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--field-label-fg); }
  `];

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('address') && this.address && !this.addressValue) this.addressValue = this.address;
    if (changed.has('issue')) {
      this.dismissed = { address: false, key: false };
      if (this.issue === 'auth' || this.issue === 'revoked') this.keyValue = '';
    }
    if (changed.has('review') && this.review) this.keyValue = '';
  }

  private emit(type: 'connect' | 'continue' | 'other-key' | 'demo' | 'cancel', detail?: unknown): void {
    // The connect event carries the key: it stays at this element, for the app's own listener only.
    const local = type === 'connect';
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: !local, composed: !local }));
  }

  private submit(): void {
    if (this.busy) return;
    this.addressLeft = true;
    this.emit('connect', { address: this.addressValue, apiKey: this.keyValue });
  }

  /** What the address field shows: recognised as you type, nonsense only after leaving it, or the reported problem. */
  private addressField(): { state: 'idle' | 'ok' | 'error'; help: string } {
    const issue = this.dismissed.address ? 'none' : this.issue;
    if (issue === 'unreachable') return { state: 'error', help: this.t('connect.address.check') };
    if (issue === 'invalid-address') return { state: 'error', help: this.t('connect.address.invalid') };
    if (issue === 'ambiguous-address') return { state: 'error', help: this.t('connect.address.ambiguous') };
    const value = this.addressValue.trim();
    if (!value) return { state: 'idle', help: this.t('connect.address.help') };
    const parsed = parseAddress(value);
    if (parsed.kind === 'homeyId') return { state: 'ok', help: this.t('connect.address.id') };
    if (parsed.kind === 'ip') return { state: 'ok', help: this.t('connect.address.ip') };
    if (!this.addressLeft) return { state: 'idle', help: this.t('connect.address.help') };
    return { state: 'error', help: this.t(parsed.reason === 'ambiguous' ? 'connect.address.ambiguous' : 'connect.address.invalid') };
  }

  private keyField(): { state: 'idle' | 'error'; help: string } {
    const issue = this.dismissed.key ? 'none' : this.issue;
    if (issue === 'auth') return { state: 'error', help: this.t('connect.key.rejected') };
    if (issue === 'missing-key') return { state: 'error', help: this.t('connect.key.missing') };
    return { state: 'idle', help: this.t('connect.key.help') };
  }

  private renderIntro() {
    return html`<div class="intro">
      <div class="art" aria-hidden="true"></div>
      <h1>${this.t('connect.title')}</h1>
      <p class="lead">${this.t('connect.lead')}</p>
      <ol class="steps">
        <li><div>${richText(this.t('connect.step1'))}</div></li>
        <li><div>${richText(this.t('connect.step2'))}
          <ul class="rights">${RIGHTS.map((right) => html`<li><mh-icon name="check_circle" filled></mh-icon>${this.t(`rights.${right}` as MessageKey)}</li>`)}</ul>
        </div></li>
        <li><div>${richText(this.t('connect.step3'))}</div></li>
      </ol>
    </div>`;
  }

  private renderReview(missing: Feature[]) {
    const canUseDevices = !missing.includes('readDevices') && !missing.includes('controlDevices');
    return html`<div class="form">
      <h2>${this.t('connect.rights.title')}</h2>
      <ul class="results">
        ${canUseDevices ? html`<li><mh-icon name="check_circle" filled></mh-icon><div><b>${this.t('rights.ok')}</b>${this.t('rights.okText')}</div></li>` : nothing}
        ${missing.map((feature) => html`<li class="missing"><mh-icon name="cancel" filled></mh-icon><div>
          <b>${this.t('rights.missing', { right: this.t(`rights.${feature}` as MessageKey) })}</b>${this.t(`rights.lost.${feature}` as MessageKey)}</div></li>`)}
      </ul>
      <p class="advice">${this.t('connect.rights.advice')}</p>
      <div class="actions">
        <mh-button block @click=${() => this.emit('continue')}>${this.t('connect.rights.continue')}</mh-button>
        <mh-button block variant="text" @click=${() => this.emit('other-key')}>${this.t('connect.rights.other')}</mh-button>
      </div>
    </div>`;
  }

  private renderForm() {
    const address = this.addressField();
    const key = this.keyField();
    const top = this.issue === 'revoked' ? html`<mh-note icon="key_off" tone="error">${richText(this.t('connect.revoked'))}</mh-note>`
      : this.issue === 'unreachable' && !this.dismissed.address ? html`<mh-note icon="wifi_off" tone="error">${richText(this.t('connect.unreachable'))}</mh-note>` : nothing;
    return html`<div class="form">
      <h2>${this.t(this.issue === 'revoked' ? 'connect.headingAgain' : 'connect.heading')}</h2>
      ${top}
      <mh-text-field label=${this.t('connect.address.label')} icon="link" placeholder=${this.t('connect.address.placeholder')}
        .value=${live(this.addressValue)} state=${address.state} help=${address.help} ?disabled=${this.busy}
        @input=${(e: CustomEvent<{ value: string }>) => { this.addressValue = e.detail.value; this.dismissed = { ...this.dismissed, address: true }; }}
        @focusout=${() => { this.addressLeft = true; }}
        @submit=${() => this.submit()}></mh-text-field>
      <mh-text-field label=${this.t('connect.key.label')} icon="key" type="password" placeholder=${this.t('connect.key.placeholder')}
        .value=${live(this.keyValue)} state=${key.state} help=${key.help} helpIcon="lock" ?disabled=${this.busy}
        @input=${(e: CustomEvent<{ value: string }>) => { this.keyValue = e.detail.value; this.dismissed = { ...this.dismissed, key: true }; }}
        @submit=${() => this.submit()}></mh-text-field>
      <div class="actions">
        <mh-button block ?busy=${this.busy} @click=${() => this.submit()}>${this.t(this.busy ? 'connect.busy' : 'connect.submit')}</mh-button>
        ${this.busy && this.waitingForPermission ? html`<p class="hint" role="status">${this.t('connect.waitPermission')}</p>` : nothing}
        ${this.busy
          ? html`<mh-button block variant="text" @click=${() => this.emit('cancel')}>${this.t('connect.cancel')}</mh-button>`
          : html`<mh-button block variant="text" @click=${() => this.emit('demo', { which: 'house' })}>${this.t('connect.demo')}</mh-button>
            <mh-button block small variant="text" @click=${() => this.emit('demo', { which: 'camper' })}>${this.t('connect.demoCamper')}</mh-button>`}
      </div>
      <mh-note icon="lan">${richText(this.t('connect.lan'))}</mh-note>
    </div>`;
  }

  /** Puts the focus in the first field, or on the first button of the rights review. */
  override focus(options?: FocusOptions): void {
    const target = this.shadowRoot?.querySelector<HTMLElement>('mh-text-field, mh-button');
    target?.focus(options);
  }

  override render() {
    return html`<div class="card">${this.renderIntro()}${this.review ? this.renderReview(this.review) : this.renderForm()}</div>`;
  }
}

if (!customElements.get('mh-connect-screen')) customElements.define('mh-connect-screen', MhConnectScreen);

declare global {
  interface HTMLElementTagNameMap { 'mh-connect-screen': MhConnectScreen }
}
