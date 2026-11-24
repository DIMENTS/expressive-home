import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { t as dutch, type MessageKey, type Translate } from '../../i18n';
import { rustigExpressive } from '../../theme/rustig-expressive';
import type { IconName } from '../icons/icons';
import { phoneMedia } from '../phone';
import { pixels } from '../pixels';
import { themePixels } from '../theme-pixels';
import { sharedStyles } from './shared-styles';
import './icon';

/** `checked` null is a plain choice; a disabled one is shown but cannot be chosen; `dot` is a seed shown before the label. */
export interface MenuItem { id: string; label: string; checked: boolean | null; icon?: IconName; disabled?: boolean; dot?: string }
export type MenuGroup =
  /** An empty title: no heading. */
  | { kind: 'items'; id: string; title: string; items: MenuItem[] }
  | { kind: 'swatches'; id: string; title: string; presets: { id: string; seed: string }[]; value: string | null; customLabel: string };

const SEED = /^#[0-9a-f]{6}$/i;

/** The room kept between a menu and the edge of the window. */
const EDGE = themePixels('space-8');
/** On a phone the bar at the bottom lies over the window. */
const BAR = themePixels('nav-bar-height');

/**
 * A floating menu: groups of choices under a small title, with a line between groups. A group of items
 * shows each choice as a row with a tick; a group of swatches shows the preset colours and a rainbow swatch for a
 * colour of one's own. A plain choice is an action, with an icon; a disabled one is skipped. Choosing reports `select` with { group, id } and keeps the menu open, so choices can be
 * compared; for a swatch the id is the seed. Escape, a tap outside it, or the button that opened it close it:
 * the menu reports `close`. The arrow keys move between all choices, Home and End jump to the ends. The menu stays
 * inside the window: when it does not fit under its anchor it opens above it, otherwise it scrolls.
 */
export class MhMenu extends LitElement {
  static override properties = {
    open: { type: Boolean, reflect: true },
    label: { type: String },
    groups: { attribute: false },
    t: { attribute: false },
    anchor: { attribute: false },
  };

  declare open: boolean;
  /** The element that opens the menu: a tap on it is no tap outside (it toggles the menu itself). */
  declare anchor: HTMLElement | null;
  declare label: string;
  declare groups: MenuGroup[];
  /** The texts, in the language of the app; Dutch until the app sets it. */
  declare t: Translate;

  /** The choice that holds the tab stop, by index over all choices. */
  private current = 0;
  private readonly onOutside = (event: Event): void => {
    const path = event.composedPath();
    if (!path.includes(this) && !(this.anchor && path.includes(this.anchor))) this.close();
  };

  constructor() {
    super();
    this.open = false;
    this.label = '';
    this.groups = [];
    this.t = dutch;
    this.anchor = null;
  }

  static override styles = [sharedStyles, css`
    :host { display: contents; }
    .menu {
      box-sizing: border-box; width: var(--section-menu-width); max-width: calc(100vw - var(--space-32)); padding: var(--space-8) 0;
      border-radius: var(--section-menu-radius); background: var(--section-menu-bg); color: var(--section-menu-fg); box-shadow: var(--shadow-overlay);
      font-size: var(--type-body-l-size); line-height: var(--type-body-l-line); font-weight: var(--weight-regular); text-align: start;
      transform: translate(var(--_dx, 0), var(--_dy, 0)); max-height: var(--_max, none); overflow: auto; overscroll-behavior: contain;
    }
    .title {
      margin: 0; padding: var(--space-8) var(--space-16) var(--space-4);
      font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); font-weight: var(--weight-strong); color: var(--c-on-surface-variant);
    }
    .item {
      all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: var(--space-12); width: 100%;
      min-height: var(--section-menu-item-height); padding: 0 var(--space-16);
      --icon-size: var(--icon-l);
    }
    .item:hover { background: color-mix(in srgb, currentColor var(--state-hover), transparent); }
    .item:focus-visible, .swatch:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: calc(-1 * var(--focus-width)); }
    .item[aria-disabled="true"] { cursor: default; opacity: var(--state-disabled-content); background: none; }
    .item .grow { flex: 1; }
    .item .lead { color: var(--c-on-surface-variant); }
    .item .tick { color: var(--c-primary); }
    .dot { flex: none; width: var(--section-dot-size); height: var(--section-dot-size); border-radius: 50%; background: var(--_dot); }
    .sep { height: var(--section-menu-divider); margin: var(--space-8) 0; background: var(--c-outline-variant); }
    .swatches { display: flex; flex-wrap: wrap; gap: var(--space-4); padding: var(--space-4) var(--space-12) var(--space-8); }
    .swatch {
      all: unset; box-sizing: border-box; position: relative; cursor: pointer; width: var(--target-min); height: var(--target-min);
      display: grid; place-items: center; border-radius: 50%;
    }
    i {
      width: var(--swatch-size); height: var(--swatch-size); display: grid; place-items: center; background: var(--_seed); clip-path: var(--shape-circle);
      transition: clip-path var(--motion-spatial), width var(--motion-spatial), height var(--motion-spatial);
      --icon-size: var(--icon-m);
    }
    .swatch mh-icon { color: var(--c-surface-container-lowest); opacity: 0; transition: opacity var(--motion-effects); }
    .swatch[aria-checked="true"] i, .custom.chosen i { width: var(--swatch-size-chosen); height: var(--swatch-size-chosen); clip-path: var(--shape-cookie); }
    .swatch[aria-checked="true"] mh-icon, .custom mh-icon { opacity: 1; }
    .custom i { background: var(--ramp-swatch); }
    input { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
    @media (prefers-reduced-motion: reduce) {
      .swatch[aria-checked="true"] i, .custom.chosen i { clip-path: var(--shape-circle); }
    }
  `];

  /** Closes it, as a tap beside it does. */
  dismiss(): void {
    if (this.open) this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this.onOutside, true);
  }

  protected override updated(changed: PropertyValues<this>): void {
    // dot and swatch colours go in through the CSSOM: the content security policy allows no style attribute
    for (const dot of this.shadowRoot?.querySelectorAll<HTMLElement>('[data-dot]') ?? []) dot.style.setProperty('--_dot', dot.dataset['dot'] ?? '');
    for (const swatch of this.shadowRoot?.querySelectorAll<HTMLElement>('[data-seed]') ?? []) swatch.style.setProperty('--_seed', swatch.dataset['seed'] ?? '');
    if (changed.has('open')) {
      document.removeEventListener('pointerdown', this.onOutside, true);
      if (this.open) {
        document.addEventListener('pointerdown', this.onOutside, true);
        this.place();
        this.moveToStart();
      }
    } else if (this.open && changed.has('groups') && this.replaced(changed.get('groups') as MenuGroup[] | undefined)) {
      this.place();
      this.moveToStart();
    }
  }

  /** True when the menu now shows other choices, not the same ones drawn again. */
  private replaced(before: MenuGroup[] | undefined): boolean {
    const ids = (groups: MenuGroup[] | undefined): string => JSON.stringify(groups?.map((g) => [g.id, g.kind === 'items' ? g.items.map((i) => i.id) : []]));
    return ids(before) !== ids(this.groups);
  }

  /** Puts the menu inside the window: under its anchor, otherwise above it, otherwise as tall as the window allows. */
  private place(): void {
    const menu = this.shadowRoot?.querySelector<HTMLElement>('.menu');
    if (!menu || !this.anchor) return;
    for (const name of ['--_dx', '--_dy', '--_max']) menu.style.removeProperty(name);
    const rect = menu.getBoundingClientRect();
    const anchor = this.anchor.getBoundingClientRect();
    const bottom = window.innerHeight - EDGE - (phoneMedia()?.matches ? BAR : 0);
    const room = bottom - EDGE;
    let top = rect.top;
    if (rect.bottom > bottom) {
      // above its anchor with the same gap as under it
      const above = anchor.top - Math.max(0, rect.top - anchor.bottom) - rect.height;
      top = above >= EDGE ? above : Math.max(EDGE, bottom - rect.height);
    }
    if (rect.height > room) menu.style.setProperty('--_max', pixels(room));
    const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - EDGE - rect.width));
    menu.style.setProperty('--_dx', pixels(left - rect.left));
    menu.style.setProperty('--_dy', pixels(top - rect.top));
  }

  /** The focus goes to the chosen one of a list of choices, otherwise to the first that can be chosen. */
  private moveToStart(): void {
    const choices = this.choices();
    const checked = choices.findIndex((choice) => choice.getAttribute('aria-checked') === 'true');
    this.move(choices[0]?.getAttribute('role') === 'menuitem' || checked === -1 ? 0 : checked);
  }

  /** Every choice in the menu that can be chosen, in order. */
  private choices(): HTMLElement[] {
    return [...(this.shadowRoot?.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]') ?? [])].filter((choice) => choice.getAttribute('aria-disabled') !== 'true');
  }

  /** Moves the tab stop and the focus to a choice. */
  private move(index: number): void {
    const choices = this.choices();
    if (choices.length === 0) return;
    this.current = (index + choices.length) % choices.length;
    choices.forEach((choice, i) => choice.setAttribute('tabindex', i === this.current ? '0' : '-1'));
    choices[this.current]?.focus();
  }

  private onKey(event: KeyboardEvent): void {
    const index = this.choices().indexOf(event.composedPath()[0] as HTMLElement);
    const at = index === -1 ? this.current : index;
    const moves: Record<string, () => number> = {
      ArrowDown: () => at + 1, ArrowRight: () => at + 1, ArrowUp: () => at - 1, ArrowLeft: () => at - 1,
      Home: () => 0, End: () => this.choices().length - 1,
    };
    // Tab leaves the menu: it closes, and the focus goes back to what opened it
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    this.move(move());
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private select(group: string, id: string): void {
    this.dispatchEvent(new CustomEvent('select', { detail: { group, id }, bubbles: true, composed: true }));
  }

  private openPicker(group: Extract<MenuGroup, { kind: 'swatches' }>): void {
    const input = this.shadowRoot?.querySelector<HTMLInputElement>(`input[data-group="${CSS.escape(group.id)}"]`);
    if (!input) return;
    input.value = group.value !== null && SEED.test(group.value) ? group.value : rustigExpressive.color.defaultSeed;
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); return; } catch { /* fall back to a click */ }
    }
    input.click();
  }

  private renderGroup(group: MenuGroup) {
    if (group.kind === 'items') {
      return html`<div role="group" aria-label=${group.title || nothing}>${group.title ? html`<p class="title" aria-hidden="true">${group.title}</p>` : nothing}${group.items.map((item) => html`
        <button class="item" role=${item.checked === null ? 'menuitem' : 'menuitemradio'} aria-checked=${item.checked === null ? nothing : item.checked ? 'true' : 'false'}
          aria-disabled=${item.disabled ? 'true' : nothing} tabindex="-1" @click=${() => { if (!item.disabled) this.select(group.id, item.id); }}>
          ${item.dot ? html`<span class="dot" data-dot=${item.dot}></span>` : nothing}${item.icon ? html`<mh-icon class="lead" name=${item.icon}></mh-icon>` : nothing}<span class="grow">${item.label}</span>
          ${item.checked ? html`<mh-icon class="tick" name="check"></mh-icon>` : nothing}
        </button>`)}</div>`;
    }
    const custom = group.value !== null && !group.presets.some((p) => p.seed.toLowerCase() === group.value?.toLowerCase());
    return html`<div role="group" aria-label=${group.title}><p class="title" aria-hidden="true">${group.title}</p>
      <div class="swatches">
        ${group.presets.map((preset) => {
          const checked = preset.seed.toLowerCase() === group.value?.toLowerCase();
          return html`<button class="swatch" role="menuitemradio" aria-checked=${checked ? 'true' : 'false'} tabindex="-1" data-seed=${preset.seed}
            aria-label=${this.t(`theme.seed.${preset.id}` as MessageKey)} @click=${() => this.select(group.id, preset.seed)}><i><mh-icon name="check" filled></mh-icon></i></button>`;
        })}
        <button class="swatch custom ${custom ? 'chosen' : ''}" role="menuitem" tabindex="-1" aria-label=${group.customLabel} @click=${() => this.openPicker(group)}>
          <i><mh-icon name=${custom ? 'check' : 'colorize'} filled></mh-icon></i>
        </button>
        <input type="color" tabindex="-1" aria-hidden="true" data-group=${group.id}
          @input=${(e: Event) => { const seed = (e.target as HTMLInputElement).value; if (SEED.test(seed)) this.select(group.id, seed.toLowerCase()); }}
          @change=${(e: Event) => e.stopPropagation()}>
      </div></div>`;
  }

  override render() {
    if (!this.open) return nothing;
    return html`<div class="menu" role="menu" aria-label=${this.label} @keydown=${(e: KeyboardEvent) => this.onKey(e)}>
      ${this.groups.map((group, index) => html`${index > 0 ? html`<div class="sep" role="separator"></div>` : nothing}${this.renderGroup(group)}`)}
    </div>`;
  }
}

if (!customElements.get('mh-menu')) customElements.define('mh-menu', MhMenu);

declare global {
  interface HTMLElementTagNameMap { 'mh-menu': MhMenu }
}
