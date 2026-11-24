import { LitElement, css, html, nothing } from 'lit';
import type { SectionKind } from '../../dashboard/types';
import { t as dutch, type Translate } from '../../i18n';
import type { GoneItem, NewItem } from '../../layout/reconcile';
import type { IconName } from '../icons/icons';
import type { MenuGroup } from '../parts/menu';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/button';
import '../parts/icon';
import '../parts/menu';

/** A section something new can be placed in. */
export interface PlaceOption { id: string; title: string; icon: IconName }

/** "Hal · Voorstel: in Beveiliging", for a notice or the list of what is new. */
export function suggestionText(item: NewItem, section: string, t: Translate): string {
  return item.zoneName ? t('news.suggest', { zone: item.zoneName, section }) : t('news.suggestNoZone', { section });
}

/**
 * The notices under the header of the Overzicht: devices that left the hub in one card with "OK", then
 * what is new: one device with "Toevoegen", "Andere plek" (a menu with the sections) and "Niet tonen", several with
 * "Bekijken". Reports `place` { ref, sectionId }, `new-section` { ref }, `skip` { ref }, `view-all` and `gone-ok`.
 */
export class MhNewsCard extends LitElement {
  static override properties = {
    news: { attribute: false },
    gone: { attribute: false },
    sections: { attribute: false },
    sectionName: { attribute: false },
    boardName: { attribute: false },
    t: { attribute: false },
    placing: { state: true },
  };

  declare news: NewItem[];
  declare gone: GoneItem[];
  /** The sections of the Overzicht, for "Andere plek". */
  declare sections: PlaceOption[];
  /** The name of the section a kind of device goes to. */
  declare sectionName: (kind: SectionKind) => string;
  declare boardName: (id: string) => string;
  /** The texts, in the language of the app; Dutch until the app sets it. */
  declare t: Translate;
  declare placing: boolean;

  constructor() {
    super();
    this.news = [];
    this.gone = [];
    this.sections = [];
    this.sectionName = () => '';
    this.boardName = () => '';
    this.t = dutch;
    this.placing = false;
  }

  static override styles = [sharedStyles, css`
    :host { display: block; }
    .card {
      display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-12) var(--space-16); margin: 0 0 var(--space-20);
      padding: var(--space-12) var(--space-12) var(--space-12) var(--space-16); border-radius: var(--news-radius); background: var(--news-bg); color: var(--news-fg);
    }
    .icon { flex: none; width: var(--news-icon-box); height: var(--news-icon-box); display: grid; place-items: center; background: var(--news-icon-bg); color: var(--news-icon-fg); clip-path: var(--shape-cookie); --icon-size: var(--icon-m); }
    .icon.gone { background: var(--c-surface-container-highest); color: var(--c-on-surface-variant); clip-path: var(--shape-circle); }
    .text { flex: 1 1 0; min-width: min(100%, var(--banner-text-min)); display: grid; gap: var(--space-8); font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); overflow-wrap: anywhere; }
    .text b { display: block; font-weight: var(--weight-strong); }
    .text span { font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); color: var(--c-on-surface-variant); }
    .actions { position: relative; display: flex; flex-wrap: wrap; gap: var(--space-4); }
    .menu { position: absolute; top: 100%; right: 0; z-index: var(--layer-menu); margin-top: var(--space-4); }
    @media (prefers-reduced-motion: reduce) { .icon { clip-path: var(--shape-circle); } }
  `];

  private emit(type: 'place' | 'new-section' | 'skip' | 'view-all' | 'gone-ok', detail?: { ref: string; sectionId?: string | null }): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  /** The names as "Luifel, Pomp en Lamp" in the language of the app. */
  private list(names: string[]): string {
    return new Intl.ListFormat(this.t.locale, { type: 'conjunction' }).format(names);
  }

  private renderGone() {
    const { t, gone } = this;
    if (gone.length === 0) return nothing;
    return html`<div class="card" role="status"><span class="icon gone"><mh-icon name="link_off"></mh-icon></span>
      <div class="text">${gone.map((item) => html`<div><b>${t('news.gone', { name: item.name })}</b><span>${t('news.goneWhere', { boards: this.list(item.boards.map((id) => this.boardName(id))) })}${item.heroFallback ? ` ${t('news.goneHero')}` : ''}</span></div>`)}</div>
      <div class="actions"><mh-button variant="tonal" small @click=${() => this.emit('gone-ok')}>${t('news.ok')}</mh-button></div></div>`;
  }

  private onPlace(item: NewItem, event: CustomEvent<{ group: string; id: string }>): void {
    event.stopPropagation();
    this.placing = false;
    if (event.detail.group === 'new') this.emit('new-section', { ref: item.ref });
    else this.emit('place', { ref: item.ref, sectionId: event.detail.id });
  }

  private closeMenu(): void {
    this.placing = false;
    void this.updateComplete.then(() => this.shadowRoot?.querySelector<HTMLElement>('.elsewhere')?.focus());
  }

  private renderOne(item: NewItem) {
    const { t } = this;
    const groups: MenuGroup[] = [
      { kind: 'items', id: 'section', title: t('news.placeTitle', { name: item.name }), items: this.sections.map((s) => ({ id: s.id, label: s.title, icon: s.icon, checked: null })) },
      { kind: 'items', id: 'new', title: '', items: [{ id: 'new', label: t('news.newSection'), icon: 'add', checked: null }] },
    ];
    return html`<div class="text"><div><b>${t('news.one', { name: item.name })}</b><span>${suggestionText(item, item.room?.name ?? this.sectionName(item.suggest), t)}</span></div></div>
      <div class="actions">
        <mh-button variant="tonal" small @click=${() => this.emit('place', { ref: item.ref, sectionId: null })}>${t('news.add')}</mh-button>
        <mh-button class="elsewhere" variant="text" small @click=${() => { this.placing = !this.placing; }}>${t('news.elsewhere')}</mh-button>
        <mh-button variant="text" small @click=${() => this.emit('skip', { ref: item.ref })}>${t('news.skip')}</mh-button>
        <div class="menu"><mh-menu .t=${t} .open=${this.placing} label=${t('news.placeTitle', { name: item.name })} .groups=${groups} .anchor=${this.shadowRoot?.querySelector<HTMLElement>('.elsewhere') ?? null}
          @select=${(e: CustomEvent<{ group: string; id: string }>) => this.onPlace(item, e)} @close=${(e: Event) => { e.stopPropagation(); this.closeMenu(); }}></mh-menu></div>
      </div>`;
  }

  private renderNews() {
    const { t, news } = this;
    const [first] = news;
    if (!first) return nothing;
    return html`<div class="card" role="status"><span class="icon"><mh-icon name="add" filled></mh-icon></span>${news.length === 1 ? this.renderOne(first) : html`
      <div class="text"><div><b>${t(news.every((item) => item.kind === 'device') ? 'news.many' : 'news.manyMixed', { count: news.length })}</b><span>${this.list(news.map((item) => item.name))}</span></div></div>
      <div class="actions"><mh-button variant="tonal" small @click=${() => this.emit('view-all')}>${t('news.view')}</mh-button></div>`}</div>`;
  }

  override render() {
    return html`${this.renderGone()}${this.renderNews()}`;
  }
}

if (!customElements.get('mh-news-card')) customElements.define('mh-news-card', MhNewsCard);

declare global {
  interface HTMLElementTagNameMap { 'mh-news-card': MhNewsCard }
}
