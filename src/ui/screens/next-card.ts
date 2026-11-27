import { LitElement, css, html, nothing } from 'lit';
import { t as dutch, type MessageKey, type Translate } from '../../i18n';
import type { NextStep } from '../../onboarding/next-steps';
import type { IconName } from '../icons/icons';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/button';
import '../parts/icon';

const STEPS: Record<NextStep, { icon: IconName; name: MessageKey; text: MessageKey }> = {
  edit: { icon: 'edit', name: 'next.edit', text: 'next.editText' },
  widget: { icon: 'widgets', name: 'next.widget', text: 'next.widgetText' },
  wall: { icon: 'tablet', name: 'next.wall', text: 'next.wallText' },
  pair: { icon: 'devices', name: 'next.pair', text: 'next.pairText' },
  away: { icon: 'cell_tower', name: 'next.away', text: 'next.awayText' },
};

/**
 * The card "Verder inrichten" on the Overzicht after a first start: one button per step, each with a tick in a cookie
 * when it is done. Reports `next-step` { step } and `next-dismiss`.
 */
export class MhNextCard extends LitElement {
  static override properties = {
    t: { attribute: false },
    steps: { attribute: false },
    done: { attribute: false },
    phone: { type: Boolean },
  };

  declare t: Translate;
  declare steps: NextStep[];
  declare done: NextStep[];
  declare phone: boolean;

  constructor() {
    super();
    this.t = dutch;
    this.steps = [];
    this.done = [];
    this.phone = false;
  }

  static override styles = [sharedStyles, css`
    :host { display: block; }
    .card {
      position: relative; display: grid; gap: var(--space-12); margin: 0 0 var(--space-20); padding: var(--space-16);
      border-radius: var(--next-radius); background: var(--next-bg); color: var(--next-fg); box-shadow: inset 0 0 0 var(--section-outline-width) var(--section-outline);
      animation: arrive var(--motion-spatial) both;
    }
    @keyframes arrive { from { opacity: 0; transform: translateY(var(--onboarding-rise)); } }
    h2 { margin: 0; padding-right: var(--target-min); font-size: var(--type-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong); }
    p { margin: 0; font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); color: var(--c-on-surface-variant); }
    .close { position: absolute; top: var(--space-8); right: var(--space-8); }
    .steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--next-step-min)), 1fr)); gap: var(--space-8); margin: 0; padding: 0; list-style: none; }
    .step {
      all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; gap: var(--space-12); min-height: var(--next-row-height);
      padding: var(--space-8) var(--space-12) var(--space-8) var(--space-8); border-radius: var(--tile-radius); background: var(--tile-bg); color: var(--tile-fg);
      transition: background-color var(--motion-effects), transform var(--motion-spatial);
    }
    .step:hover { background: color-mix(in srgb, currentColor var(--state-hover), var(--tile-bg)); }
    .step:active { transform: scale(var(--press-scale)); }
    .step:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .icon {
      flex: none; width: var(--next-icon-box); height: var(--next-icon-box); display: grid; place-items: center; background: var(--next-icon-bg); color: var(--next-icon-fg);
      clip-path: var(--shape-circle); --icon-size: var(--icon-m); transition: clip-path var(--motion-spatial), background-color var(--motion-effects), color var(--motion-effects);
    }
    .step[data-done] .icon { background: var(--next-done-bg); color: var(--next-done-fg); clip-path: var(--shape-cookie); }
    .words { display: grid; min-width: 0; }
    .name { font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); }
    .text { font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
    .actions { display: flex; justify-content: flex-end; }
    @media (prefers-reduced-motion: reduce) { .step[data-done] .icon { clip-path: var(--shape-circle); } }
  `];

  private emit(type: 'next-step' | 'next-dismiss', detail?: { step: NextStep }): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  override render() {
    const { t } = this;
    const all = this.steps.every((step) => this.done.includes(step));
    return html`<section class="card" aria-labelledby="next-title">
      <h2 id="next-title">${t('next.title')}</h2>
      <mh-button class="close" variant="icon" label=${t('next.dismiss')} @click=${() => this.emit('next-dismiss')}><mh-icon name="close"></mh-icon></mh-button>
      <p>${t(all ? 'next.allDone' : 'next.text')}${this.phone ? html` ${t('next.textPhone')}` : nothing}</p>
      <ul class="steps">${this.steps.map((step) => {
        const { icon, name, text } = STEPS[step];
        const done = this.done.includes(step);
        const id = `next-${step}`;
        return html`<li><button class="step" data-step=${step} ?data-done=${done} aria-labelledby=${done ? `${id}-name ${id}-done` : `${id}-name`} aria-describedby=${`${id}-text`}
          @click=${() => this.emit('next-step', { step })}>
          <span class="icon" aria-hidden="true"><mh-icon name=${done ? 'check' : icon}></mh-icon></span>
          <span class="words"><span class="name" id=${`${id}-name`}>${t(name)}</span><span class="text" id=${`${id}-text`}>${t(text)}</span></span>
          ${done ? html`<span class="unseen" id=${`${id}-done`}>, ${t('next.done')}</span>` : nothing}</button></li>`;
      })}</ul>
      ${all ? html`<div class="actions"><mh-button @click=${() => this.emit('next-dismiss')}>${t('next.close')}</mh-button></div>` : nothing}
    </section>`;
  }
}

if (!customElements.get('mh-next-card')) customElements.define('mh-next-card', MhNextCard);

declare global {
  interface HTMLElementTagNameMap { 'mh-next-card': MhNextCard }
}
