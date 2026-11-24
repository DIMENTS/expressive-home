import { LitElement, css, html, nothing } from 'lit';
import type { IconName } from '../icons/icons';
import { PHONE_MAX_PX } from '../breakpoints';
import { sharedStyles } from './shared-styles';
import './button';
import './icon';

export interface SnackbarMessage {
  text: string; icon?: IconName; tone?: 'info' | 'error'; action?: { label: string; run(): void };
  /** Stays its full time: a message that comes meanwhile waits until it is gone. */
  important?: boolean;
}

export const SNACKBAR_MS = 4000;
export const SNACKBAR_ERROR_MS = 6000;

/**
 * The short message at the bottom: for an action that failed or needs a word. One at a time,
 * the newest replaces the previous; 4 s, errors 6 s. An error is announced at once (role alert).
 * An important message is never replaced: the newest message that comes meanwhile follows it.
 */
export class MhSnackbar extends LitElement {
  static override properties = {
    open: { type: Boolean, reflect: true },
    message: { state: true },
  };

  declare open: boolean;
  declare message: SnackbarMessage | null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The newest message that came while an important one was on screen. */
  private waiting: SnackbarMessage | null = null;

  constructor() {
    super();
    this.open = false;
    this.message = null;
  }

  static override styles = [sharedStyles, css`
    :host { display: contents; }
    .bar {
      position: fixed; z-index: var(--layer-snackbar); left: 50%; bottom: var(--space-24); max-width: min(var(--snackbar-max-width), calc(100vw - var(--space-32)));
      min-height: var(--target-min); display: flex; align-items: center; gap: var(--space-12);
      padding: var(--space-6) var(--space-8) var(--space-6) var(--space-16); border-radius: var(--snackbar-radius);
      background: var(--snackbar-bg); color: var(--snackbar-fg); box-shadow: var(--shadow-overlay);
      font-size: var(--type-label-m-size); line-height: var(--type-label-m-line);
      transform: translate(-50%, calc(100% + var(--space-40))); visibility: hidden;
      transition: transform var(--motion-spatial), visibility 0s linear var(--duration-spatial);
      --icon-size: var(--icon-m);
    }
    :host([open]) .bar { transform: translate(-50%, 0); visibility: visible; transition: transform var(--motion-spatial), visibility 0s; }
    .bar > span { min-width: 0; overflow-wrap: anywhere; }
    mh-button { flex: none; --button-text-fg: var(--snackbar-action); }
    /* above the bar at the bottom of a phone */
    @media (width < ${PHONE_MAX_PX}px) {
      .bar { bottom: calc(var(--nav-bar-height) + env(safe-area-inset-bottom) + var(--space-12)); width: max-content; transform: translate(-50%, calc(100% + var(--nav-bar-height) + env(safe-area-inset-bottom) + var(--space-40))); }
    }
  `];

  /** Shows a message, replacing the one on screen. */
  show(message: SnackbarMessage): void {
    if (this.open && this.message?.important) {
      this.waiting = message;
      return;
    }
    if (this.timer !== null) clearTimeout(this.timer);
    this.message = message;
    this.open = true;
    this.timer = setTimeout(() => this.hide(), message.tone === 'error' ? SNACKBAR_ERROR_MS : SNACKBAR_MS);
  }

  hide(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.open = false;
    const next = this.waiting;
    this.waiting = null;
    if (next) this.show(next);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer !== null) clearTimeout(this.timer);
  }

  private runAction(): void {
    const action = this.message?.action;
    this.hide();
    action?.run();
  }

  override render() {
    const message = this.message;
    const icon = message?.icon ?? (message?.tone === 'error' ? 'error' : null);
    return html`<div class="bar" role=${message?.tone === 'error' ? 'alert' : 'status'}>${message ? html`
      ${icon ? html`<mh-icon name=${icon} filled></mh-icon>` : nothing}<span>${message.text}</span>
      ${message.action ? html`<mh-button variant="text" small @click=${() => this.runAction()}>${message.action.label}</mh-button>` : nothing}` : nothing}</div>`;
  }
}

if (!customElements.get('mh-snackbar')) customElements.define('mh-snackbar', MhSnackbar);

declare global {
  interface HTMLElementTagNameMap { 'mh-snackbar': MhSnackbar }
}
