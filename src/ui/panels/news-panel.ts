import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { tilesFor } from '../../dashboard/classify';
import type { SectionKind } from '../../dashboard/types';
import type { NewItem } from '../../layout/reconcile';
import type { UiContext } from '../app/context';
import type { IconName } from '../icons/icons';
import { iconFor } from '../model/icon-for';
import { sharedStyles } from '../parts/shared-styles';
import { suggestionText, type PlaceOption } from '../screens/news-card';
import { pickListStyles } from './device-list';
import '../parts/button';
import '../parts/icon';
import '../parts/sheet';

/**
 * "Nieuw op je Homey": per new device the suggestion and the same three choices as in the notice, and
 * everything at its suggested place at once. "Andere plek" shows the sections as a second stand of the panel. Reports
 * `place` { ref, sectionId }, `new-section` { ref }, `skip` { ref } and `place-all`.
 */
export class MhNewsPanel extends LitElement {
  static override properties = {
    open: { type: Boolean },
    ctx: { attribute: false },
    news: { attribute: false },
    sections: { attribute: false },
    sectionName: { attribute: false },
    placing: { state: true },
  };

  declare open: boolean;
  declare ctx: UiContext;
  declare news: NewItem[];
  /** The sections of the Overzicht, for "Andere plek". */
  declare sections: PlaceOption[];
  declare sectionName: (kind: SectionKind) => string;
  /** What is being given another place. */
  declare placing: string | null;

  constructor() {
    super();
    this.open = false;
    this.news = [];
    this.sections = [];
    this.sectionName = () => '';
    this.placing = null;
  }

  static override styles = [sharedStyles, pickListStyles, css`
    .row { flex-wrap: wrap; padding: var(--space-4) var(--space-8) var(--space-8) 0; }
    .row > .row-main { flex: 1 1 100%; }
    .actions { display: flex; flex-wrap: wrap; gap: var(--space-4); margin-left: auto; }
    .hint { margin: 0 0 0 var(--space-16); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
    button.row-main { width: 100%; border-radius: var(--sheet-row-radius); background: var(--sheet-row-bg); --icon-size: var(--icon-l); }
    button.row-main > mh-icon { color: var(--c-on-surface-variant); }
  `];

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('open') || !this.news.some((item) => item.ref === this.placing)) this.placing = null;
  }

  /** Which row was dealt with: the one that takes its place gets the focus. */
  private dealtWith: number | null = null;

  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has('news') || !this.open) return;
    const rows = [...this.shadowRoot!.querySelectorAll<HTMLElement>('.row[data-ref]')];
    const row = this.dealtWith === null ? undefined : rows[Math.min(this.dealtWith, rows.length - 1)];
    this.dealtWith = null;
    row?.querySelector('mh-button')?.focus();
    this.shadowRoot!.querySelector('mh-sheet')?.keepFocus();
  }

  private emit(type: 'place' | 'new-section' | 'skip' | 'place-all' | 'close', detail?: { ref: string; sectionId?: string | null }): void {
    if (detail && (type === 'place' || type === 'skip')) this.dealtWith = this.news.findIndex((item) => item.ref === detail.ref);
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private iconOf(item: NewItem): IconName {
    const device = item.kind === 'device' ? this.ctx.store.getDevice(item.ref) : undefined;
    return device ? iconFor(tilesFor(device)[0]!, device) : 'play_arrow';
  }

  private renderItem(item: NewItem) {
    const { t } = this.ctx;
    return html`<div class="row" data-ref=${item.ref}>
      <span class="row-main"><span class="icon"><mh-icon name=${this.iconOf(item)}></mh-icon></span><span class="text">${item.name}<small>${suggestionText(item, item.room?.name ?? this.sectionName(item.suggest), t)}</small></span></span>
      <div class="actions">
        <mh-button variant="tonal" small @click=${() => this.emit('place', { ref: item.ref, sectionId: null })}>${t('news.add')}</mh-button>
        <mh-button variant="text" small @click=${() => { this.placing = item.ref; }}>${t('news.elsewhere')}</mh-button>
        <mh-button variant="text" small @click=${() => this.emit('skip', { ref: item.ref })}>${t('news.skip')}</mh-button>
      </div>
    </div>`;
  }

  private renderPlaces(item: NewItem) {
    const { t } = this.ctx;
    const choose = (act: () => void) => () => { this.placing = null; act(); };
    return html`<div class="list">
      ${this.sections.map((section) => html`<button class="row-main" @click=${choose(() => this.emit('place', { ref: item.ref, sectionId: section.id }))}><mh-icon name=${section.icon}></mh-icon><span class="text">${section.title}</span></button>`)}
      <button class="row-main" @click=${choose(() => this.emit('new-section', { ref: item.ref }))}><mh-icon name="add"></mh-icon><span class="text">${t('news.newSection')}</span></button>
    </div>`;
  }

  private renderList() {
    const { t } = this.ctx;
    return html`<div class="list">${repeat(this.news, (item) => item.ref, (item) => this.renderItem(item))}</div>
      <section><mh-button block @click=${() => this.emit('place-all')}>${t('news.addAll')}</mh-button></section>
      <p class="hint">${t('news.skipHint')}</p>`;
  }

  override render() {
    const { t } = this.ctx;
    const item = this.news.find((n) => n.ref === this.placing);
    return html`<mh-sheet .t=${t} ?open=${this.open} .back=${item !== undefined} icon="add" heading=${item ? t('news.placeTitle', { name: item.name }) : t('news.panelTitle')}
        subheading=${item ? '' : t(this.news.every((i) => i.kind === 'device') ? 'news.panelCount' : 'news.panelCountMixed', { count: this.news.length })}
        @back=${(e: Event) => { e.stopPropagation(); this.placing = null; }}
        @close=${(e: Event) => { e.stopPropagation(); this.emit('close'); }}>
      ${!this.open ? nothing : item ? this.renderPlaces(item) : this.renderList()}
    </mh-sheet>`;
  }
}

if (!customElements.get('mh-news-panel')) customElements.define('mh-news-panel', MhNewsPanel);

declare global {
  interface HTMLElementTagNameMap { 'mh-news-panel': MhNewsPanel }
}
