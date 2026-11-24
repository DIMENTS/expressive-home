import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { t as dutch, type Translate } from '../../i18n';
import { LIMITS } from '../../layout/types';
import type { IconName } from '../icons/icons';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/button';
import '../parts/choice-group';
import '../parts/dialog';
import '../parts/icon-picker';
import '../parts/text-field';

/** What the dialog shows besides the fields themselves. */
interface Shown { heading: string; text: string; confirmLabel: string; namePlaceholder: string; autoIcon: IconName | null; kindChoice: 'none' | 'section'; heroTaken: boolean }

/**
 * A dialog that asks for a name and an icon: to add or rename a section, and
 * for a dashboard. With `kindChoice` "section" it first asks for an own section or the hero. Reports `confirm`
 * { kind, name, icon } (an empty name or the automatic icon is null) or `cancel`. While it fades out it keeps what it
 * showed, whatever its properties become.
 */
export class MhNameIconDialog extends LitElement {
  static override properties = {
    open: { type: Boolean },
    heading: { type: String },
    text: { type: String },
    confirmLabel: { type: String },
    name: { type: String },
    namePlaceholder: { type: String },
    icon: { attribute: false },
    autoIcon: { attribute: false },
    kindChoice: { type: String },
    heroTaken: { type: Boolean },
    t: { attribute: false },
    draft: { state: true },
  };

  declare open: boolean;
  declare heading: string;
  /** A line under the fields. */
  declare text: string;
  declare confirmLabel: string;
  declare name: string;
  declare namePlaceholder: string;
  declare icon: string | null;
  /** The icon the app chooses itself; null: there is no "Automatisch". */
  declare autoIcon: IconName | null;
  declare kindChoice: 'none' | 'section';
  /** There is already a hero on this dashboard. */
  declare heroTaken: boolean;
  /** The texts, in the language of the app; Dutch until the app sets it. */
  declare t: Translate;
  declare draft: { kind: 'own' | 'hero'; name: string; icon: string | null };
  /** As it was when it was last open. */
  private shown!: Shown;
  /** How often it opened: every time begins with a fresh library of icons. */
  private opened = 0;

  constructor() {
    super();
    this.open = false;
    this.heading = '';
    this.text = '';
    this.confirmLabel = '';
    this.name = '';
    this.namePlaceholder = '';
    this.icon = null;
    this.autoIcon = null;
    this.kindChoice = 'none';
    this.heroTaken = false;
    this.t = dutch;
    this.draft = { kind: 'own', name: '', icon: null };
  }

  static override styles = [sharedStyles, css`
    /* the dialog has the colour of a field: what is in it takes the surface instead */
    .form { display: grid; gap: var(--space-16); --field-bg: var(--c-surface); --choice-bg: var(--c-surface); --icon-pick-bg: var(--c-surface); --sheet-row-bg: var(--c-surface); }
    .icons { display: grid; gap: var(--space-6); }
    h3 { margin: 0 0 0 var(--space-4); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); font-weight: var(--weight-strong); color: var(--field-label-fg); }
    .scroll { height: var(--icon-scroll-height); overflow: auto; overscroll-behavior: contain; padding: var(--space-2); }
    .note { margin: calc(-1 * var(--space-10)) 0 0 var(--space-4); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); }
    p { margin: 0; }
  `];

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!this.open && this.opened > 0) return;
    const { heading, text, confirmLabel, namePlaceholder, autoIcon, kindChoice, heroTaken } = this;
    this.shown = { heading, text, confirmLabel, namePlaceholder, autoIcon, kindChoice, heroTaken };
    if (!this.open || !changed.has('open')) return;
    this.draft = { kind: 'own', name: this.name, icon: this.icon };
    this.opened += 1;
  }

  private confirm(): void {
    const { kind, name, icon } = this.draft;
    const detail = kind === 'hero' ? { kind, name: null, icon: null } : { kind, name: name.trim() === '' ? null : name.trim(), icon };
    this.dispatchEvent(new CustomEvent('confirm', { detail, bubbles: true, composed: true }));
  }

  private cancel(event: Event): void {
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
  }

  private renderKind(shown: Shown) {
    const { t } = this;
    if (shown.kindChoice === 'none') return nothing;
    return html`<mh-choice-group label=${t('section.dialog.kind')} .value=${this.draft.kind} .options=${[
      { id: 'own', label: t('section.dialog.own'), icon: 'view_agenda' }, { id: 'hero', label: t('section.dialog.hero'), icon: 'battery_5_bar', disabled: shown.heroTaken },
    ]} @change=${(e: CustomEvent<{ value: 'own' | 'hero' }>) => { e.stopPropagation(); this.draft = { ...this.draft, kind: e.detail.value }; }}></mh-choice-group>
      ${shown.heroTaken ? html`<p class="note">${t('section.dialog.heroTaken')}</p>` : nothing}`;
  }

  private renderForm(shown: Shown) {
    const { t, draft } = this;
    const own = draft.kind === 'own';
    return html`<div class="form">
      ${this.renderKind(shown)}
      <mh-text-field ?hidden=${!own} label=${t('section.dialog.name')} icon="edit" .value=${draft.name} placeholder=${shown.namePlaceholder} maxlength=${LIMITS.nameLength} data-autofocus
        @input=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.draft = { ...draft, name: e.detail.value }; }}
        @submit=${(e: Event) => { e.stopPropagation(); this.confirm(); }}></mh-text-field>
      ${own && this.opened > 0 ? html`<div class="icons"><h3>${t('section.dialog.icon')}</h3><div class="scroll">${keyed(this.opened, html`<mh-icon-picker .t=${t} .value=${draft.icon} .auto=${shown.autoIcon}
        @change=${(e: CustomEvent<{ icon: string | null }>) => { e.stopPropagation(); this.draft = { ...this.draft, icon: e.detail.icon }; }}></mh-icon-picker>`)}</div></div>` : nothing}
      ${shown.text ? html`<p>${shown.text}</p>` : nothing}
    </div>`;
  }

  override render() {
    const { t, shown } = this;
    return html`<mh-dialog form ?open=${this.open} heading=${shown.heading} @cancel=${(e: Event) => this.cancel(e)}>
      ${this.renderForm(shown)}
      <mh-button slot="actions" variant="text" @click=${(e: Event) => this.cancel(e)}>${t('section.dialog.cancel')}</mh-button>
      <mh-button slot="actions" @click=${() => this.confirm()}>${shown.confirmLabel}</mh-button>
    </mh-dialog>`;
  }
}

if (!customElements.get('mh-name-icon-dialog')) customElements.define('mh-name-icon-dialog', MhNameIconDialog);

declare global {
  interface HTMLElementTagNameMap { 'mh-name-icon-dialog': MhNameIconDialog }
}
