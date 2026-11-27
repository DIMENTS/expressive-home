import { LitElement, css, html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { t as dutch, type Translate } from '../../i18n';
import type { Mismatch } from '../../served/door-link';
import { sharedStyles } from '../parts/shared-styles';
import { panelStyles } from './panel-styles';
import '../parts/button';
import '../parts/dialog';
import '../parts/icon';
import '../parts/text-field';

/** Where a page with a key stands with the app on its hub. */
export interface AwayState { paired: boolean; role: 'use' | 'edit' | null; up: boolean; mismatch: Mismatch | null }
export type AwayPairIssue = 'missing' | 'code' | 'locked' | 'full' | 'busy' | 'unreachable';

const CODE = /^\d{8}$/;

/**
 * In the settings of a page with a key: whether its dashboards are the same as on the hub, pairing with a code for away from
 * home (which replaces the dashboards here by those of the hub), and unpairing. Reports `away-paired` when paired, after which
 * the page starts anew, and `away-unpair`.
 */
export class MhSyncSection extends LitElement {
  static override properties = {
    t: { attribute: false },
    away: { attribute: false },
    pairAway: { attribute: false },
    asking: { state: true },
    busy: { state: true },
    issue: { state: true },
    code: { state: true },
    name: { state: true },
  };

  declare t: Translate;
  declare away: AwayState | null;
  /** Pairs with the code and the name; what became of it. */
  declare pairAway: ((code: string, name: string) => Promise<string>) | null;
  declare asking: boolean;
  declare busy: boolean;
  declare issue: AwayPairIssue | null;
  declare code: string;
  declare name: string;

  constructor() {
    super();
    this.t = dutch;
    this.away = null;
    this.pairAway = null;
    this.asking = false;
    this.busy = false;
    this.issue = null;
    this.code = '';
    this.name = '';
  }

  static override styles = [sharedStyles, panelStyles, css`
    :host { display: block; }
    .why { margin: 0; font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
    /* fields stand out from the dialog, as in the dialog of a name */
    .form { display: grid; gap: var(--space-16); --field-bg: var(--c-surface); }
    .issue { margin: 0; color: var(--c-error); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); }
  `];

  private emit(type: 'away-paired' | 'away-unpair'): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
  }

  private async submit(): Promise<void> {
    const code = this.code.replace(/\s+/g, '');
    if (!CODE.test(code)) { this.issue = 'missing'; return; }
    if (!this.pairAway || this.busy) return;
    this.busy = true;
    const result = await this.pairAway(code, this.name.trim() || this.t('sync.dialog.defaultName'));
    this.busy = false;
    if (result === 'ok') {
      this.asking = false;
      this.emit('away-paired');
      return;
    }
    this.issue = result === 'code' || result === 'locked' || result === 'full' || result === 'busy' ? result : 'unreachable';
  }

  private renderState() {
    const { t, away } = this;
    if (!away) return nothing;
    if (!away.paired) {
      return html`<div class="row"><mh-icon name="link"></mh-icon><span class="label">${t('sync.off')}<small>${t('sync.offHelp')}</small></span></div>
        <mh-button block @click=${() => { this.asking = true; this.issue = null; }}>${t('sync.pair')}</mh-button>`;
    }
    const why = away.mismatch === 'update-app' ? t('sync.updateApp') : away.mismatch === 'reload' ? t('sync.reload') : !away.up ? t('sync.waiting') : null;
    return html`<div class="row"><mh-icon name=${away.up ? 'sync' : 'cloud_off'}></mh-icon>
        <span class="label">${t('sync.on')}<small>${t(away.role === 'edit' ? 'settings.servedEdit' : 'settings.servedUse')}</small></span>
        <mh-button variant="tonal" small @click=${() => this.emit('away-unpair')}>${t('sync.unpair')}</mh-button></div>
      ${why ? html`<p class="why" role="status">${why}</p>` : nothing}`;
  }

  override render() {
    const { t } = this;
    return html`<section><h3>${t('sync.title')}</h3><div class="rows">${this.renderState()}</div></section>
      <mh-dialog form ?open=${this.asking} heading=${t('sync.pair')} @cancel=${() => { this.asking = false; }}>
        <div class="form">
          <p class="why">${t('sync.dialog.text')}</p>
          <mh-text-field label=${t('sync.dialog.name')} placeholder=${t('sync.dialog.namePlaceholder')} .value=${live(this.name)} maxlength="60"
            @input=${(e: CustomEvent<{ value: string }>) => { this.name = e.detail.value; }}></mh-text-field>
          <mh-text-field label=${t('sync.dialog.code')} placeholder=${t('sync.dialog.codePlaceholder')} .value=${live(this.code)} digits maxlength="9"
            state=${this.issue ? 'error' : 'idle'}
            @input=${(e: CustomEvent<{ value: string }>) => { this.code = e.detail.value; this.issue = null; }} @submit=${() => { void this.submit(); }}></mh-text-field>
          ${this.issue ? html`<p class="issue" role="alert">${t(`sync.issue.${this.issue}`)}</p>` : nothing}
          <p class="why">${t('sync.dialog.replace')}</p>
        </div>
        <mh-button slot="actions" variant="text" @click=${() => { this.asking = false; }}>${t('sync.dialog.cancel')}</mh-button>
        <mh-button slot="actions" ?busy=${this.busy} @click=${() => { void this.submit(); }}>${t(this.busy ? 'sync.dialog.busy' : 'sync.dialog.submit')}</mh-button>
      </mh-dialog>`;
  }
}

if (!customElements.get('mh-sync-section')) customElements.define('mh-sync-section', MhSyncSection);

declare global {
  interface HTMLElementTagNameMap { 'mh-sync-section': MhSyncSection }
}
