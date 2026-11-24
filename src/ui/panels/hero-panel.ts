import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { netSources } from '../../dashboard/hero';
import type { CapRef, HeroSpec } from '../../dashboard/types';
import type { Capability, Device } from '../../homey/types';
import { formatValue, joinValue } from '../../i18n/format';
import type { BoardView } from '../../layout/board';
import { heroRefs, isNet } from '../../layout/refs';
import { LIMITS, type HeroChoice, type HeroValueRef } from '../../layout/types';
import type { UiContext } from '../app/context';
import type { IconName } from '../icons/icons';
import { deviceList } from '../model/device-list';
import { iconForCapability } from '../model/icon-for';
import { attachDrag, type DragHost } from '../parts/drag';
import { sharedStyles } from '../parts/shared-styles';
import { pixels } from '../pixels';
import { panelStyles } from './panel-styles';
import '../parts/button';
import '../parts/choice-group';
import '../parts/icon';
import '../parts/note';
import '../parts/sheet';
import '../parts/text-field';
import './device-list';

/** What a value is being chosen for. */
type Purpose = 'main' | 'line' | 'stat';

const PURPOSE_TEXT = { main: 'picker.main', line: 'picker.line', stat: 'picker.stat' } as const;

/** What the automatic hero shows now, as an own choice. */
export function choiceFromAutomatic(automatic: HeroSpec): HeroChoice {
  const stats = automatic.stats.map((stat): HeroValueRef => (stat.role === 'net' ? { net: true } : stat.ref));
  return { main: automatic.primary, line: automatic.timeToGo, stats: stats.slice(0, LIMITS.heroStats), name: null };
}

/**
 * "Blikvanger instellen": automatic, or an own big number, a line, up to four stats and a name. Every
 * choice is reported at once as `set-hero` { hero, typing }. "Wijzigen" and "toevoegen" show the devices per room as a
 * second stand of the panel, with "Netto laden" as a choice of its own while the hub has solar and consumption.
 */
export class MhHeroPanel extends LitElement {
  static override properties = {
    open: { type: Boolean },
    ctx: { attribute: false },
    choice: { attribute: false },
    automatic: { attribute: false },
    board: { attribute: false },
    boardName: { type: String },
    choosing: { state: true },
    query: { state: true },
  };

  declare open: boolean;
  declare ctx: UiContext;
  /** The own choice; null is "Automatisch". */
  declare choice: HeroChoice | null;
  /** What the app chooses itself now; null when this hub has nothing for it. */
  declare automatic: HeroSpec | null;
  declare board: BoardView | null;
  declare boardName: string;
  declare choosing: Purpose | null;
  declare query: string;
  private stopListening: (() => void)[] = [];
  private stopDrag: (() => void) | null = null;
  /** What is being dragged among the stats, and where it would land. */
  private dragList: HTMLElement | null = null;

  constructor() {
    super();
    this.open = false;
    this.choice = null;
    this.automatic = null;
    this.board = null;
    this.boardName = '';
    this.choosing = null;
    this.query = '';
  }

  static override styles = [sharedStyles, panelStyles, css`
    .row > mh-icon, .stat > mh-icon { flex: none; color: var(--c-on-surface-variant); --icon-size: var(--icon-l); }
    .label { overflow-wrap: anywhere; }
    .stats { display: grid; gap: var(--space-4); }
    .stat { display: flex; align-items: center; gap: var(--space-8); min-height: var(--sheet-row-height); padding: var(--space-8) var(--space-8) var(--space-8) var(--space-4); border-radius: var(--sheet-row-radius); background: var(--sheet-row-bg); }
    .stat[data-dragged] { opacity: var(--state-disabled-content); }
    .stat[data-drop="before"] { box-shadow: inset 0 var(--edit-ring-width) 0 var(--drop-border); }
    .stat[data-drop="after"] { box-shadow: inset 0 calc(-1 * var(--edit-ring-width)) 0 var(--drop-border); }
    .grip {
      all: unset; box-sizing: border-box; position: relative; flex: none; display: grid; place-items: center; cursor: grab; touch-action: none;
      width: var(--icon-button-size); height: var(--icon-button-size); border-radius: var(--shape-full); color: var(--edit-handle-fg); --icon-size: var(--icon-m);
    }
    .grip:hover { background: color-mix(in srgb, currentColor var(--state-hover), transparent); }
    .grip:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .lifted {
      position: fixed; z-index: var(--layer-drag); left: var(--_left); top: var(--_top); width: var(--_width); height: var(--_height); pointer-events: none; opacity: 1;
      transform: translate(var(--_dx, 0), var(--_dy, 0)) scale(var(--drag-lift-scale)); box-shadow: var(--drag-shadow);
    }
    @media (prefers-reduced-motion: reduce) { .lifted { transform: translate(var(--_dx, 0), var(--_dy, 0)); } }
  `];

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('open')) {
      this.choosing = null;
      this.query = '';
    }
    if (changed.has('open') || changed.has('choice') || changed.has('ctx')) this.listen(null);
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('choice') && this.open) this.focusAfterRemoving();
    const list = this.open ? this.shadowRoot?.querySelector<HTMLElement>('.stats') ?? null : null;
    if (list === this.dragList) return;
    this.stopDrag?.();
    this.stopDrag = list ? attachDrag(list, this.dragHost(list), (result) => { if (result.kind === 'tile') this.moveStat(Number(result.tileId), result.index); }) : null;
    this.dragList = list;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const stop of this.stopListening.splice(0)) stop();
    this.stopDrag?.();
    this.stopDrag = null;
    this.dragList = null;
  }

  /** The values that are shown, and those of the opened row while choosing, are live. */
  private listen(opened: string | null): void {
    for (const stop of this.stopListening.splice(0)) stop();
    if (!this.open || !this.ctx) return;
    const redraw = () => this.requestUpdate();
    const ids = new Set([...(this.choice ? heroRefs(this.choice).map((ref) => ref.deviceId) : []), ...(opened === null ? [] : [opened])]);
    this.stopListening = [this.ctx.store.subscribeStructure(redraw), ...[...ids].map((id) => this.ctx.store.subscribeDevice(id, redraw))];
  }

  private set(hero: HeroChoice | null, typing = false): void {
    this.dispatchEvent(new CustomEvent('set-hero', { detail: typing ? { hero, typing } : { hero }, bubbles: true, composed: true }));
  }

  private emit(type: 'close' | 'remove'): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
  }

  private setMode(mode: 'auto' | 'own'): void {
    if (mode === 'auto') this.set(null);
    else if (this.automatic) this.set(choiceFromAutomatic(this.automatic));
    // nothing to begin with: the big number first
    else this.choosing = 'main';
  }

  private chosen(ref: HeroValueRef): void {
    const purpose = this.choosing;
    this.choosing = null;
    this.query = '';
    const { choice } = this;
    if (purpose === 'main' && !isNet(ref)) this.set(choice ? { ...choice, main: ref } : { main: ref, line: null, stats: [], name: null });
    else if (purpose === 'line' && choice && !isNet(ref)) this.set({ ...choice, line: ref });
    else if (purpose === 'stat' && choice) this.set({ ...choice, stats: [...choice.stats, ref].slice(0, LIMITS.heroStats) });
  }

  /** A stat to another place; \`to\` counts the other stats. */
  private moveStat(from: number, to: number): void {
    const { choice } = this;
    const stat = choice?.stats[from];
    if (!choice || !stat) return;
    const others = choice.stats.filter((_, i) => i !== from);
    const at = Math.max(0, Math.min(to, others.length));
    if (at !== from) this.set({ ...choice, stats: [...others.slice(0, at), stat, ...others.slice(at)] });
  }

  /** Dragging the stats: one list, one under the other. */
  private dragHost(list: HTMLElement): DragHost {
    const rows = () => [...list.querySelectorAll<HTMLElement>('.stat')];
    const slot = (id: string, element: Element) => {
      const { left, top, width, height } = element.getBoundingClientRect();
      return { id, left: left + window.scrollX, top: top + window.scrollY, width, height };
    };
    const clear = (): void => { for (const row of rows()) row.removeAttribute('data-drop'); };
    return {
      measure: () => ({ sections: [{ id: 'stats', rect: slot('stats', list), tiles: rows().map((row) => slot(row.dataset['tileId'] ?? '', row)), layout: 'column' }], columns: [] }),
      preview: (target) => {
        clear();
        if (target?.kind !== 'tile') {
          for (const row of rows()) row.removeAttribute('data-dragged');
          return;
        }
        const others = rows().filter((row) => row.dataset['tileId'] !== target.tileId);
        const before = others[target.index];
        if (before) before.dataset['drop'] = 'before';
        else if (others.length > 0) others.at(-1)!.dataset['drop'] = 'after';
      },
      lift: (_kind, id) => {
        const row = rows().find((r) => r.dataset['tileId'] === id);
        const copy = (row?.cloneNode(true) ?? document.createElement('div')) as HTMLElement;
        copy.classList.add('lifted');
        const rect = row?.getBoundingClientRect();
        if (rect) for (const [name, value] of [['--_left', rect.left], ['--_top', rect.top], ['--_width', rect.width], ['--_height', rect.height]] as const) copy.style.setProperty(name, pixels(value));
        row?.setAttribute('data-dragged', '');
        this.shadowRoot?.append(copy);
        return copy;
      },
    };
  }

  private valueOf(ref: CapRef): { device: Device | undefined; cap: Capability | undefined; name: string; icon: IconName; text: string; percent: boolean } {
    const { t, store } = this.ctx;
    const device = store.getDevice(ref.deviceId);
    const cap = device?.capabilities[ref.capabilityId];
    const formatted = formatValue(cap, 'tile', t);
    return {
      device, cap, icon: cap ? iconForCapability(cap, device) : 'link_off', text: joinValue(formatted), percent: formatted.unit === '%',
      name: device ? t('tile.join', { a: device.name.trim() || t('tile.unnamed'), b: cap?.title ?? t('value.none') }) : t('tile.gone'),
    };
  }

  private renderMain(choice: HeroChoice) {
    const { t } = this.ctx;
    const value = this.valueOf(choice.main);
    return html`<section><h3>${t('heroSettings.main')}</h3><div class="row"><mh-icon name=${value.icon}></mh-icon>
      <span class="label">${value.name}<small>${value.percent ? t('tile.join', { a: value.text, b: t('heroSettings.mainWave') }) : value.text}</small></span>
      <mh-button variant="tonal" small @click=${() => { this.choosing = 'main'; }}>${t('heroSettings.change')}</mh-button></div></section>`;
  }

  private renderLine(choice: HeroChoice) {
    const { t } = this.ctx;
    if (!choice.line) {
      return html`<section><h3>${t('heroSettings.line')}</h3><mh-button variant="text" @click=${() => { this.choosing = 'line'; }}><mh-icon name="add"></mh-icon>${t('heroSettings.addLine')}</mh-button></section>`;
    }
    const value = this.valueOf(choice.line);
    return html`<section><h3>${t('heroSettings.line')}</h3><div class="row"><mh-icon name=${value.icon}></mh-icon><span class="label">${value.name}<small>${value.text}</small></span>
      <mh-button variant="tonal" small @click=${() => { this.choosing = 'line'; }}>${t('heroSettings.change')}</mh-button>
      <mh-button variant="icon" label=${t('heroSettings.removeLine')} @click=${() => this.set({ ...choice, line: null })}><mh-icon name="close"></mh-icon></mh-button></div></section>`;
  }

  private onStatKey(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const to = event.key === 'ArrowUp' ? index - 1 : index + 1;
    if (to < 0 || to >= (this.choice?.stats.length ?? 0)) return;
    this.moveStat(index, to);
    void this.updateComplete.then(() => this.shadowRoot?.querySelectorAll<HTMLElement>('.stat .grip')[to]?.focus());
  }

  /** After a box is taken away the focus goes to the next one, or to what adds one. */
  private removed: number | null = null;

  private focusAfterRemoving(): void {
    const buttons = [...(this.shadowRoot?.querySelectorAll<HTMLElement>('.stat mh-button') ?? [])];
    const next = this.removed === null ? undefined : buttons[Math.min(this.removed, buttons.length - 1)];
    this.removed = null;
    next?.focus();
    this.shadowRoot?.querySelector('mh-sheet')?.keepFocus();
  }

  private renderStats(choice: HeroChoice) {
    const { t } = this.ctx;
    return html`<section><h3>${t('heroSettings.stats')}</h3>
      <div class="stats" data-section-id="stats">${choice.stats.map((stat, index) => {
        const value = isNet(stat) ? { name: t('picker.net'), icon: 'trending_up' as IconName, text: '' } : this.valueOf(stat);
        return html`<div class="stat" data-tile-id=${String(index)}>
          <button class="grip hit" data-grip aria-label=${t('edit.grip', { name: value.name })} aria-keyshortcuts="ArrowUp ArrowDown" @keydown=${(e: KeyboardEvent) => this.onStatKey(e, index)}><mh-icon name="drag_indicator"></mh-icon></button>
          <mh-icon name=${value.icon}></mh-icon><span class="label">${value.name}${value.text ? html`<small>${value.text}</small>` : nothing}</span>
          <mh-button variant="icon" label=${t('heroSettings.removeStat', { name: value.name })} @click=${() => { this.removed = index; this.set({ ...choice, stats: choice.stats.filter((_, i) => i !== index) }); }}><mh-icon name="close"></mh-icon></mh-button>
        </div>`;
      })}</div>
      ${choice.stats.length < LIMITS.heroStats ? html`<mh-button variant="text" @click=${() => { this.choosing = 'stat'; }}><mh-icon name="add"></mh-icon>${t('heroSettings.addStat')}</mh-button>` : nothing}</section>`;
  }

  private renderName(choice: HeroChoice) {
    const { t, store } = this.ctx;
    return html`<section><h3>${t('heroSettings.name')}</h3>
      <mh-text-field label=${t('heroSettings.name')} hideLabel icon="edit" .value=${choice.name ?? ''} placeholder=${store.getDevice(choice.main.deviceId)?.name ?? ''} help=${t('heroSettings.nameHelp')} maxlength=${LIMITS.nameLength}
        @input=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.set({ ...choice, name: e.detail.value === '' ? null : e.detail.value }, true); }}></mh-text-field></section>`;
  }

  private renderSettings() {
    const { t } = this.ctx;
    const { choice } = this;
    return html`<mh-choice-group label=${t('heroSettings.title')} .value=${choice ? 'own' : 'auto'} .options=${[
      { id: 'auto', label: t('heroSettings.auto'), icon: 'brightness_auto' }, { id: 'own', label: t('heroSettings.own'), icon: 'tune' },
    ]} @change=${(e: CustomEvent<{ value: 'auto' | 'own' }>) => { e.stopPropagation(); this.setMode(e.detail.value); }}></mh-choice-group>
    ${choice ? html`${this.renderMain(choice)}${this.renderLine(choice)}${this.renderStats(choice)}${this.renderName(choice)}`
      : html`<mh-note icon="info">${t('heroSettings.autoNote')}</mh-note>`}
    <section><mh-button variant="danger" @click=${() => this.emit('remove')}><mh-icon name="delete"></mh-icon>${t('heroSettings.remove')}</mh-button></section>`;
  }

  private renderChooser(purpose: Purpose) {
    const { t, store } = this.ctx;
    const snapshot = store.getSnapshot();
    if (!snapshot || !this.board) return nothing;
    const net = purpose === 'stat' && netSources(this.automatic) !== null && !(this.choice?.stats.some(isNet) ?? false);
    return html`<mh-text-field label=${t('add.search')} placeholder=${t('add.search')} icon="search" type="search" quiet .value=${this.query}
        @input=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.query = e.detail.value; }}></mh-text-field>
      ${net ? html`<div class="row" data-net><mh-icon name="trending_up"></mh-icon><span class="label">${t('picker.net')}</span>
        <mh-button variant="tonal" small @click=${() => this.chosen({ net: true })}>${t('picker.choose')}</mh-button></div>` : nothing}
      <mh-device-list mode="choose" ?numericOnly=${purpose === 'main'} .t=${t} .groups=${deviceList(snapshot, this.board, this.query, t)}
        @expand=${(e: CustomEvent<{ deviceId: string | null }>) => { e.stopPropagation(); this.listen(e.detail.deviceId); }}
        @choose=${(e: CustomEvent<CapRef>) => { e.stopPropagation(); this.chosen({ deviceId: e.detail.deviceId, capabilityId: e.detail.capabilityId }); }}></mh-device-list>`;
  }

  override render() {
    const { t } = this.ctx;
    const { choosing } = this;
    return html`<mh-sheet .t=${t} ?open=${this.open} .back=${choosing !== null} icon=${choosing ? 'category' : 'tune'}
        heading=${t(choosing ? 'picker.title' : 'heroSettings.title')} subheading=${choosing ? t(PURPOSE_TEXT[choosing]) : this.boardName}
        @back=${(e: Event) => { e.stopPropagation(); this.choosing = null; this.query = ''; }}
        @close=${(e: Event) => { e.stopPropagation(); this.emit('close'); }}>
      ${!this.open ? nothing : choosing ? this.renderChooser(choosing) : this.renderSettings()}
    </mh-sheet>`;
  }
}

if (!customElements.get('mh-hero-panel')) customElements.define('mh-hero-panel', MhHeroPanel);

declare global {
  interface HTMLElementTagNameMap { 'mh-hero-panel': MhHeroPanel }
}
