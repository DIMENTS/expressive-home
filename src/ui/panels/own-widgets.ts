import { LitElement, css, html, nothing, type TemplateResult } from 'lit';
import { t as dutch, type Translate } from '../../i18n';
import { chosenKinds } from '../../widgets/permissions';
import { MAX_WIDGETS } from '../../widgets/widget-library';
import { fromWidgetCode, toWidgetCode, toWidgetFileText, widgetText, WIDGET_FILE_LIMIT, type ParsedWidget, type WidgetFile } from '../../widgets/widget-file';
import { ICONS, type IconName } from '../icons/icons';
import { sharedStyles } from '../parts/shared-styles';
import { pickListStyles } from './device-list';
import '../parts/button';
import '../parts/icon';
import '../parts/note';
import '../parts/text-field';

/** What the part shows: the list, taking in a widget, or sharing one. */
export type OwnStand = { kind: 'list' } | { kind: 'import' } | { kind: 'share'; id: string };

const iconOf = (widget: WidgetFile): IconName => (widget.icon !== null && Object.hasOwn(ICONS, widget.icon) ? widget.icon as IconName : 'widgets');

/**
 * The own widgets of the house in "Toevoegen": a plus places one, "Delen" gives its code or file, and "Widget toevoegen"
 * takes one in from a code or a file, after it shows what the widget may do. Changes are reported as events:
 * `place-widget`, `install-widget`, `remove-widget`, `stand` (to show a back button) and `told` (a short notice).
 */
export class MhOwnWidgets extends LitElement {
  static override properties = {
    t: { attribute: false },
    widgets: { attribute: false },
    stand: { attribute: false },
    atHomeOnly: { type: Boolean },
    text: { state: true },
    parsed: { state: true },
  };

  declare t: Translate;
  declare widgets: WidgetFile[];
  declare stand: OwnStand;
  /** A page paired from outside: own widgets are placed and shared here, and only changed at home. */
  declare atHomeOnly: boolean;
  declare text: string;
  declare parsed: ParsedWidget | null;

  constructor() {
    super();
    this.t = dutch;
    this.widgets = [];
    this.stand = { kind: 'list' };
    this.atHomeOnly = false;
    this.text = '';
    this.parsed = null;
  }

  static override styles = [sharedStyles, pickListStyles, css`
    :host { display: grid; gap: var(--space-8); }
    .icon { --icon-size: var(--icon-m); }
    .group { margin: var(--space-16) 0 var(--space-4) var(--space-4); font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); font-weight: var(--weight-strong); color: var(--c-primary); }
    .actions { display: flex; flex-wrap: wrap; gap: var(--space-8); }
    .may { display: grid; gap: var(--space-8); margin: var(--space-8) 0; padding: 0; list-style: none; }
    .may li { display: flex; gap: var(--space-10); align-items: flex-start; font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); --icon-size: var(--icon-m); }
    .may .yes mh-icon { color: var(--c-primary); }
    .may .no mh-icon { color: var(--c-on-surface-variant); }
    .code { font-family: var(--share-code-font); font-size: var(--type-label-s-size); line-height: var(--type-label-s-line); overflow-wrap: anywhere; max-height: calc(var(--field-height) * 2); overflow: hidden;
      padding: var(--space-10) var(--space-12); border-radius: var(--shape-md); background: var(--sheet-row-bg); color: var(--c-on-surface-variant); user-select: all; }
    .help { margin: 0 var(--space-4); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
  `];

  private emit(type: string, detail: unknown = null): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private go(stand: OwnStand): void {
    this.text = '';
    this.parsed = null;
    this.emit('stand', stand);
  }

  private name(widget: WidgetFile): string {
    return widgetText(widget.name, this.t.language);
  }

  private renderRow(widget: WidgetFile): TemplateResult {
    const { t } = this;
    const name = this.name(widget);
    const about = widgetText(widget.description, t.language) || t('ownWidgets.version', { version: widget.widgetVersion || '–' });
    return html`<div data-own=${widget.id}><div class="row">
      <span class="row-main"><span class="icon"><mh-icon name=${iconOf(widget)}></mh-icon></span><span class="text">${name}<small>${about}</small></span></span>
      <mh-button variant="icon" label=${t('ownWidgets.shareOne', { name })} @click=${() => this.go({ kind: 'share', id: widget.id })}><mh-icon name="share"></mh-icon></mh-button>
      <mh-button class="add" variant="icon" label=${t('add.add', { name })} @click=${() => this.emit('place-widget', { widget })}><mh-icon name="add_circle" filled></mh-icon></mh-button>
    </div></div>`;
  }

  private renderList(): TemplateResult {
    const { t } = this;
    return html`<h3 class="group">${t('ownWidgets.title')}</h3>
      ${this.widgets.length === 0 ? html`<p class="help">${t('ownWidgets.none')}</p>` : html`<div class="list">${this.widgets.map((widget) => this.renderRow(widget))}</div>`}
      ${this.atHomeOnly ? html`<mh-note icon="home">${t('ownWidgets.atHome')}</mh-note>` : html`<div class="actions"><mh-button variant="tonal" @click=${() => this.go({ kind: 'import' })}><mh-icon name="download"></mh-icon>${t('ownWidgets.add')}</mh-button></div>
      <mh-note icon="code">${t('ownWidgets.make')}</mh-note>`}`;
  }

  // ----- taking one in -----

  private check(text: string): void {
    this.text = text;
    this.parsed = text.trim() === '' ? null : fromWidgetCode(text);
  }

  private onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.[0];
    input.value = '';
    if (!chosen) return;
    if (chosen.size > WIDGET_FILE_LIMIT * 2) { this.parsed = { ok: false, reason: 'too-big' }; return; }
    const reader = new FileReader();
    reader.onload = () => { this.check(typeof reader.result === 'string' ? reader.result : ''); this.text = ''; };
    reader.onerror = () => { this.parsed = { ok: false, reason: 'damaged' }; };
    reader.readAsText(chosen);
  }

  /** What the widget may do, before it is taken in. */
  private renderMay(widget: WidgetFile): TemplateResult {
    const { t } = this;
    const kinds = chosenKinds(widget);
    return html`<h3 class="group">${t('ownWidgets.may')}</h3><ul class="may">
      ${kinds.devices > 0 ? html`<li class="yes"><mh-icon name="check_circle" filled></mh-icon><span>${t('ownWidgets.mayRead', { n: kinds.devices })}</span></li>
        <li class="yes"><mh-icon name="check_circle" filled></mh-icon><span>${t('ownWidgets.mayControl')}</span></li>` : html`<li class="yes"><mh-icon name="check_circle" filled></mh-icon><span>${t('ownWidgets.mayNothing')}</span></li>`}
      ${kinds.flows > 0 ? html`<li class="yes"><mh-icon name="check_circle" filled></mh-icon><span>${t('ownWidgets.mayFlows', { n: kinds.flows })}</span></li>` : nothing}
      <li class="no"><mh-icon name="block"></mh-icon><span>${t('ownWidgets.mayNot')}</span></li>
    </ul>`;
  }

  private renderChecked(widget: WidgetFile): TemplateResult {
    const { t } = this;
    const known = this.widgets.some((other) => other.id === widget.id);
    const full = !known && this.widgets.length >= MAX_WIDGETS;
    const size = Math.max(1, Math.round(JSON.stringify(widget).length / 1000));
    return html`<div class="list"><div class="row"><span class="row-main"><span class="icon"><mh-icon name=${iconOf(widget)}></mh-icon></span>
      <span class="text">${this.name(widget)}<small>${t('ownWidgets.about', { version: widget.widgetVersion || '–', size })}</small></span></span></div></div>
      ${this.renderMay(widget)}
      <mh-note icon="info">${t(known ? 'ownWidgets.replaces' : 'ownWidgets.trust')}</mh-note>
      ${full ? html`<mh-note icon="warning" tone="error">${t('ownWidgets.full')}</mh-note>`
        : html`<mh-button @click=${() => { this.emit('install-widget', { widget }); this.go({ kind: 'list' }); }}>${t(known ? 'ownWidgets.replace' : 'ownWidgets.install')}</mh-button>`}`;
  }

  private renderImport(): TemplateResult {
    const { t } = this;
    const result = this.parsed;
    const reasons = { 'not-a-widget': 'ownWidgets.notWidget', 'too-new': 'ownWidgets.tooNew', 'too-big': 'ownWidgets.tooBig', 'bad-field': 'ownWidgets.badField', 'damaged': 'ownWidgets.damaged' } as const;
    return html`<mh-text-field label=${t('ownWidgets.paste')} multiline .value=${this.text}
        @input=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.check(e.detail.value); }}></mh-text-field>
      <mh-button variant="tonal" @click=${() => this.shadowRoot?.querySelector<HTMLInputElement>('input[type="file"]')?.click()}><mh-icon name="upload"></mh-icon>${t('ownWidgets.file')}</mh-button>
      <input type="file" accept=".json,application/json" hidden tabindex="-1" aria-hidden="true" @change=${(e: Event) => { e.stopPropagation(); this.onFile(e); }}>
      ${result === null ? nothing : result.ok ? this.renderChecked(result.widget) : html`<mh-note icon="error" tone="error">${t(reasons[result.reason])}</mh-note>`}`;
  }

  // ----- sharing one -----

  private async copy(widget: WidgetFile): Promise<void> {
    try {
      await navigator.clipboard.writeText(toWidgetCode(widget));
      this.emit('told', this.t('ownWidgets.copied'));
    } catch {
      const text = this.shadowRoot?.querySelector('.code');
      if (!text) return;
      const range = document.createRange();
      range.selectNodeContents(text);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
  }

  private download(widget: WidgetFile): void {
    const fileName = `${widget.id}.widget.json`;
    const url = URL.createObjectURL(new Blob([toWidgetFileText(widget)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    this.emit('told', this.t('ownWidgets.saved', { file: fileName }));
  }

  private renderShare(id: string): TemplateResult {
    const { t } = this;
    const widget = this.widgets.find((item) => item.id === id);
    if (!widget) return this.renderList();
    return html`<div class="code">${toWidgetCode(widget)}</div>
      <div class="actions">
        <mh-button variant="tonal" @click=${() => { void this.copy(widget); }}><mh-icon name="content_copy"></mh-icon>${t('ownWidgets.copy')}</mh-button>
        <mh-button variant="tonal" @click=${() => this.download(widget)}><mh-icon name="download"></mh-icon>${t('ownWidgets.saveFile')}</mh-button>
      </div>
      ${this.renderMay(widget)}
      <mh-button variant="danger" @click=${() => { this.emit('remove-widget', { widget }); this.go({ kind: 'list' }); }}><mh-icon name="delete"></mh-icon>${t('ownWidgets.remove')}</mh-button>`;
  }

  override render() {
    switch (this.stand.kind) {
      case 'import': return this.renderImport();
      case 'share': return this.renderShare(this.stand.id);
      default: return this.renderList();
    }
  }
}

if (!customElements.get('mh-own-widgets')) customElements.define('mh-own-widgets', MhOwnWidgets);

declare global {
  interface HTMLElementTagNameMap { 'mh-own-widgets': MhOwnWidgets }
}
