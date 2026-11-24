import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { trapFocus } from './focus-trap';
import { sharedStyles } from './shared-styles';

/**
 * The dialog, to confirm something that is hard to undo, or with a form in it (`form`). Centred, an
 * alert dialog or a dialog; focus starts on the element marked data-autofocus (the cancel button), Escape and the scrim fire `cancel`.
 */
export class MhDialog extends LitElement {
  static override properties = {
    open: { type: Boolean, reflect: true },
    heading: { type: String },
    form: { type: Boolean },
  };

  declare open: boolean;
  declare heading: string;
  /** It holds a form instead of a question. */
  declare form: boolean;
  private releaseFocus: (() => void) | null = null;

  constructor() {
    super();
    this.open = false;
    this.heading = '';
    this.form = false;
    this.addEventListener('keydown', (event) => {
      if (this.open && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.cancel('key');
      }
    });
  }

  static override styles = [sharedStyles, css`
    :host { display: contents; }
    .scrim {
      position: fixed; inset: 0; z-index: var(--layer-dialog-scrim); background: var(--scrim); opacity: 0; pointer-events: none;
      transition: opacity var(--motion-effects);
    }
    :host([open]) .scrim { opacity: 1; pointer-events: auto; }
    .box {
      position: fixed; z-index: var(--layer-dialog); top: 50%; left: 50%; width: min(var(--dialog-width), calc(100vw - var(--space-32))); max-height: calc(100vh - var(--space-32)); overflow: auto; padding: var(--space-24);
      background: var(--dialog-bg); color: var(--c-on-surface); border-radius: var(--dialog-radius); box-shadow: var(--shadow-overlay);
      transform: translate(-50%, -46%) scale(var(--dialog-enter-scale)); opacity: 0; pointer-events: none; visibility: hidden;
      transition: transform var(--motion-spatial), opacity var(--motion-effects), visibility 0s linear var(--duration-spatial);
    }
    :host([open]) .box { transform: translate(-50%, -50%); opacity: 1; pointer-events: auto; visibility: visible; transition: transform var(--motion-spatial), opacity var(--motion-effects), visibility 0s; }
    h2 { margin: 0 0 var(--space-12); font-size: var(--type-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong); }
    .text { font-size: var(--type-label-m-size); line-height: var(--type-body-l-line); color: var(--c-on-surface-variant); }
    .actions { display: flex; justify-content: flex-end; gap: var(--space-8); margin-top: var(--space-24); }
  `];

  private cancel(by: 'key' | 'scrim'): void {
    this.dispatchEvent(new CustomEvent('cancel', { detail: { by }, bubbles: true, composed: true }));
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has('open')) return;
    if (this.open) {
      this.releaseFocus = trapFocus(this.shadowRoot!, this);
      this.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (this.releaseFocus) {
      this.releaseFocus();
      this.releaseFocus = null;
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.releaseFocus?.();
    this.releaseFocus = null;
  }

  override render() {
    return html`
      <div class="scrim" @click=${() => this.cancel('scrim')}></div>
      <div class="box" role=${this.form ? 'dialog' : 'alertdialog'} aria-modal="true" aria-labelledby="title" aria-describedby=${this.form ? nothing : 'text'} ?inert=${!this.open}>
        <h2 id="title">${this.heading}</h2>
        <div class="text" id="text"><slot></slot></div>
        <div class="actions"><slot name="actions"></slot></div>
      </div>`;
  }
}

if (!customElements.get('mh-dialog')) customElements.define('mh-dialog', MhDialog);

declare global {
  interface HTMLElementTagNameMap { 'mh-dialog': MhDialog }
}
