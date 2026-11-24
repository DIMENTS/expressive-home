import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { live } from 'lit/directives/live.js';
import { t as dutch, type Translate } from '../../i18n';
import { LIMITS } from '../../layout/types';
import type { DeviceKind } from '../../served/pair-link';
import { richText } from '../parts/rich-text';
import { sharedStyles } from '../parts/shared-styles';
import { connectCardStyles } from './connect-card';
import '../parts/button';
import '../parts/note';
import '../parts/text-field';

/** Why pairing did not work. */
export type PairIssue = 'none' | 'code' | 'locked' | 'full' | 'unreachable';

const CODE = /^\d{6}$/;

/**
 * The pair screen: what a device sees that opens the dashboard on the hub for the first time. It takes the
 * place of the connect screen and looks like it; there is no key here. A code that was scanned asks for one tap, any
 * other is typed. Reports `pair` { code, name }.
 */
export class MhPairScreen extends LitElement {
  static override properties = {
    t: { attribute: false },
    issue: { type: String },
    busy: { type: Boolean },
    revoked: { type: Boolean },
    scanned: { type: String },
    kind: { type: String },
    typing: { state: true },
    name: { state: true },
    code: { state: true },
    incomplete: { state: true },
    dismissed: { state: true },
  };

  /** The texts, in the language of the app; Dutch until the app sets it. */
  declare t: Translate;
  declare issue: PairIssue;
  declare busy: boolean;
  /** The owner took this device away. */
  declare revoked: boolean;
  /** The code that was scanned; '' when there is none. */
  declare scanned: string;
  declare kind: DeviceKind;
  /** Another code than the scanned one is typed. */
  declare typing: boolean;
  declare name: string;
  declare code: string;
  /** A code was sent that cannot be one. */
  declare incomplete: boolean;
  /** The code was typed in since the problem was reported. */
  declare dismissed: boolean;

  constructor() {
    super();
    this.t = dutch;
    this.issue = 'none';
    this.busy = false;
    this.revoked = false;
    this.scanned = '';
    this.kind = 'laptop';
    this.typing = false;
    this.name = '';
    this.code = '';
    this.incomplete = false;
    this.dismissed = false;
  }

  static override styles = [sharedStyles, connectCardStyles, css`
    .text { margin: 0; font-size: var(--type-body-l-size); line-height: var(--type-body-l-line); }
  `];

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('issue') || changed.has('busy')) this.dismissed = false;
    if (changed.has('scanned') && this.scanned !== '') {
      this.typing = false;
      if (this.name === '') this.name = this.t(`pair.kind.${this.kind}`);
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    // the button that was pressed is gone
    if (changed.has('issue') && this.issue === 'code' && this.byScan) void this.shadowRoot?.querySelector('mh-button')?.updateComplete.then(() => this.focus({ preventScroll: true }));
  }

  /** Whether the code that was scanned is what this is about. */
  private get byScan(): boolean {
    return this.scanned !== '' && !this.typing;
  }

  private async type(): Promise<void> {
    this.typing = true;
    this.dismissed = true;
    await this.updateComplete;
    this.shadowRoot?.querySelector<HTMLElement>('[data-code]')?.focus();
  }

  private submit(): void {
    if (this.busy) return;
    const code = this.byScan ? this.scanned : this.code.replace(/\s/g, '');
    this.incomplete = !CODE.test(code);
    if (this.incomplete) return;
    this.dispatchEvent(new CustomEvent('pair', { detail: { code, name: this.name.trim() || this.t('pair.defaultName') } }));
  }

  private codeField(): { state: 'idle' | 'error'; help: string } {
    if (this.incomplete) return { state: 'error', help: this.t('pair.issue.missing') };
    if (this.issue !== 'none' && !this.dismissed) return { state: 'error', help: this.t(`pair.issue.${this.issue}`) };
    return { state: 'idle', help: this.t('pair.codeHelp') };
  }

  /** Puts the focus where one goes on: in the first field, or on the button when there is nothing to type. */
  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector<HTMLElement>(this.byScan ? 'mh-button' : 'mh-text-field')?.focus(options);
  }

  private renderName() {
    const { t } = this;
    return html`<mh-text-field label=${t('pair.name')} icon="devices_other" placeholder=${t('pair.namePlaceholder')} help=${t('pair.nameHelp')} maxlength=${LIMITS.nameLength}
      .value=${live(this.name)} @input=${(e: CustomEvent<{ value: string }>) => { this.name = e.detail.value; }} @submit=${() => this.submit()}></mh-text-field>`;
  }

  private renderScanned() {
    const { t, issue } = this;
    if (issue === 'code') {
      return html`<h2>${t('pair.expired')}</h2><p class="text" role="alert">${richText(t('pair.expiredText'))}</p>
        <div class="actions"><mh-button block @click=${() => { void this.type(); }}>${t('pair.typeNew')}</mh-button></div>`;
    }
    return html`<h2>${t('pair.scannedHeading')}</h2>
      <mh-note icon="check_circle" tone="ok">${t('pair.scanned')}</mh-note>
      ${this.renderName()}
      ${issue === 'none' ? nothing : html`<mh-note icon="error" tone="error" role="alert">${t(`pair.issue.${issue}`)}</mh-note>`}
      <div class="actions">
        <mh-button block ?busy=${this.busy} @click=${() => this.submit()}>${t(this.busy ? 'pair.busy' : issue === 'none' ? 'pair.submit' : 'pair.again')}</mh-button>
        <mh-button block variant="text" @click=${() => { void this.type(); }}>${t('pair.typeOther')}</mh-button>
      </div>`;
  }

  private renderForm() {
    const { t } = this;
    const code = this.codeField();
    return html`<h2>${t('pair.heading')}</h2>
      ${this.renderName()}
      <mh-text-field data-code label=${t('pair.code')} icon="key" placeholder=${t('pair.codePlaceholder')} state=${code.state} help=${code.help} maxlength="7" digits
        .value=${live(this.code)}
        @input=${(e: CustomEvent<{ value: string }>) => { this.code = e.detail.value; this.incomplete = false; this.dismissed = true; }} @submit=${() => this.submit()}></mh-text-field>
      <div class="actions"><mh-button block ?busy=${this.busy} @click=${() => this.submit()}>${t(this.busy ? 'pair.busy' : 'pair.submit')}</mh-button></div>`;
  }

  override render() {
    const { t, byScan } = this;
    return html`<div class="card">
      <div class="intro">
        <div class="art" aria-hidden="true"></div>
        <h1>${t('pair.title')}</h1>
        <p class="lead">${t(byScan && this.issue !== 'code' ? 'pair.scannedLead' : 'pair.lead')}</p>
        ${byScan ? nothing : html`<ol class="steps">
          <li><div>${richText(t('pair.step1'))}</div></li>
          <li><div>${richText(t('pair.step2'))}</div></li>
          <li><div>${richText(t('pair.step3'))}</div></li>
        </ol>`}
      </div>
      <div class="form">
        ${this.revoked ? html`<mh-note icon="key_off" tone="error" role="alert">${richText(t('pair.revoked'))}</mh-note>` : nothing}
        ${byScan ? this.renderScanned() : this.renderForm()}
        <mh-note icon="lan">${richText(t('pair.note'))}</mh-note>
      </div>
    </div>`;
  }
}

if (!customElements.get('mh-pair-screen')) customElements.define('mh-pair-screen', MhPairScreen);

declare global {
  interface HTMLElementTagNameMap { 'mh-pair-screen': MhPairScreen }
}
