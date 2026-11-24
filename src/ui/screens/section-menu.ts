import { LitElement, css, html } from 'lit';
import { t as dutch, type Translate } from '../../i18n';
import { rustigExpressive } from '../../theme/rustig-expressive';
import type { MenuGroup } from '../parts/menu';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/icon';
import '../parts/menu';

/**
 * The menu of a section: an icon button with three dots in the section title, and the
 * menu under it, aligned to the right. The button opens and closes it; Escape or a tap outside closes it and the
 * focus goes back to the button. Choices are reported by the menu as `select`; this element reports `toggle` with
 * { open } so the section can lift itself above its neighbours while the menu floats over them.
 */
export class MhSectionMenu extends LitElement {
  static override properties = {
    label: { type: String },
    groups: { attribute: false },
    t: { attribute: false },
    open: { type: Boolean, reflect: true },
  };

  /** The title of the section; the button is called "Menu van ‹title›". */
  declare label: string;
  declare groups: MenuGroup[];
  /** The texts, in the language of the app; Dutch until the app sets it. */
  declare t: Translate;
  declare open: boolean;

  constructor() {
    super();
    this.label = '';
    this.groups = [];
    this.t = dutch;
    this.open = false;
  }

  static override styles = [sharedStyles, css`
    :host { position: relative; display: inline-flex; flex: none; }
    .trigger {
      all: unset; box-sizing: border-box; cursor: pointer; display: grid; place-items: center;
      width: var(--icon-button-size); height: var(--icon-button-size); margin: calc(var(--space-8) * -1) calc(var(--space-8) * -1) calc(var(--space-8) * -1) 0;
      border-radius: var(--shape-full); color: var(--section-menu-trigger-fg); --icon-size: var(--icon-m);
    }
    .trigger:hover { background: color-mix(in srgb, currentColor var(--state-hover), transparent); }
    .trigger[aria-expanded="true"] { background: color-mix(in srgb, currentColor var(--state-pressed), transparent); }
    .trigger:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .anchor { position: absolute; top: 100%; right: 0; z-index: var(--layer-menu); margin-top: var(--space-4); }
  `];

  /** Opens or closes the menu, as a tap on its button does. */
  toggle(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.dispatchEvent(new CustomEvent('toggle', { detail: { open }, bubbles: true, composed: true }));
  }

  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector<HTMLElement>('.trigger')?.focus(options);
  }

  private onClose(event: Event): void {
    event.stopPropagation();
    this.close();
  }

  /** A plain choice is an action: the menu closes. Other choices keep it open, so they can be compared. */
  private onSelect(event: CustomEvent<{ group: string; id: string }>): void {
    const group = this.groups.find((g) => g.id === event.detail.group);
    if (group?.kind === 'items' && group.items.some((item) => item.id === event.detail.id && item.checked === null)) this.close();
  }

  private close(): void {
    this.toggle(false);
    void this.updateComplete.then(() => this.shadowRoot?.querySelector<HTMLElement>('.trigger')?.focus());
  }

  override render() {
    const name = this.t('menu.section', { name: this.label });
    return html`<button class="trigger hit" aria-label=${name} aria-haspopup="menu" aria-expanded=${this.open ? 'true' : 'false'}
        @click=${() => this.toggle(!this.open)}><mh-icon name="more_vert"></mh-icon></button>
      <div class="anchor"><mh-menu .open=${this.open} .t=${this.t} label=${name} .groups=${this.groups} .anchor=${this}
        @close=${(e: Event) => this.onClose(e)} @select=${(e: CustomEvent<{ group: string; id: string }>) => this.onSelect(e)}></mh-menu></div>`;
  }
}

if (!customElements.get('mh-section-menu')) customElements.define('mh-section-menu', MhSectionMenu);

declare global {
  interface HTMLElementTagNameMap { 'mh-section-menu': MhSectionMenu }
}

/**
 * The colour groups of a section's menu: "Zoals het dashboard" with a dot in the dashboard's colour, and the own
 * colours (the presets of the theme and a free colour). `seed` is the section's own colour, or null.
 */
export function colourGroups(name: string, seed: string | null, baseSeed: string, t: Translate): MenuGroup[] {
  return [
    { kind: 'items', id: 'colour', title: t('menu.colourOf', { name }), items: [{ id: 'follow', label: t('menu.followDashboard'), checked: seed === null, dot: baseSeed }] },
    { kind: 'swatches', id: 'seed', title: t('menu.ownColour'), presets: rustigExpressive.color.presets, value: seed, customLabel: t('menu.pickColour') },
  ];
}

/** The own colour a choice in those groups stands for: null to follow the dashboard; undefined for another group. */
export function chosenSeed(choice: { group: string; id: string }): string | null | undefined {
  if (choice.group === 'colour' && choice.id === 'follow') return null;
  if (choice.group === 'seed') return choice.id;
  return undefined;
}
