import { css, html, type PropertyValues } from 'lit';
import { applyTokens } from '../../theme/engine';
import type { ThemeFile } from '../../theme/look';
import { computeLook, styleOf } from '../../theme/styles';
import type { Mode } from '../../theme/types';
import { ChoiceBase, type ChoiceOption } from './choice-group';
import { sharedStyles } from './shared-styles';

/** A theme to choose, shown as a little dashboard in its own colours, with its colour and light or dark. */
export interface LookOption extends ChoiceOption { note: string; file: ThemeFile; seed: string; mode: Mode }

/**
 * The cards to choose a theme: each a little dashboard drawn by the app with that theme's own values (no picture),
 * as a radio group with one tab stop. Reports `change` with { value: the theme's id }.
 */
export class MhLookPicker extends ChoiceBase {
  declare options: LookOption[];
  /** What each little dashboard was last drawn with. */
  private drawn = new WeakMap<HTMLElement, string>();

  static override styles = [sharedStyles, css`
    :host { display: block; }
    .group { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--look-picker-min), 1fr)); gap: var(--space-10); }
    .option {
      cursor: pointer; display: grid; align-content: start; gap: var(--space-6); padding: var(--look-card-pad); min-width: 0;
      border-radius: var(--look-card-radius); background: var(--look-card-bg); color: var(--look-card-fg);
      transition: box-shadow var(--motion-effects);
    }
    .option:hover { background: color-mix(in srgb, currentColor var(--state-hover), var(--look-card-bg)); }
    .option[aria-checked="true"] { box-shadow: inset 0 0 0 var(--look-card-ring) var(--c-primary); }
    .option:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .preview {
      height: var(--look-preview-height); border-radius: var(--look-preview-radius); overflow: hidden; padding: var(--space-6);
      display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); background: var(--page-bg); font-family: var(--font-family);
    }
    .hero {
      display: flex; align-items: flex-end; padding: var(--space-6); border-radius: var(--shape-md);
      background: var(--section-hero-bg); color: var(--section-hero-fg);
      font-size: var(--type-title-size); line-height: var(--type-hero-line); font-weight: var(--weight-strong);
    }
    .section {
      display: grid; gap: var(--space-4); padding: var(--space-4); border-radius: var(--shape-md);
      background: var(--section-bg); box-shadow: inset 0 0 0 var(--section-outline-width) var(--section-outline);
    }
    .tile {
      display: flex; align-items: center; gap: var(--space-4); padding: 0 var(--space-4); border-radius: var(--shape-sm);
      background: var(--tile-bg); box-shadow: inset 0 0 0 var(--tile-outline-width) var(--tile-outline);
    }
    .tile.on { background: var(--tile-on-bg); }
    .dot { flex: none; width: var(--icon-xs); height: var(--icon-xs); border-radius: var(--shape-full); background: var(--tile-icon-bg); }
    .on .dot { background: var(--tile-icon-on-bg); }
    .mark { flex: 1; height: var(--space-4); border-radius: var(--shape-full); background: color-mix(in srgb, var(--tile-fg) var(--look-preview-mark), transparent); }
    .on .mark { background: color-mix(in srgb, var(--tile-on-fg) var(--look-preview-mark), transparent); }
    .text { display: grid; gap: var(--space-2); min-width: 0; padding: 0 var(--space-4) var(--space-4); }
    .name { font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .note { font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--look-card-note-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `];

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    if (!changed.has('options')) return;
    const previews = this.shadowRoot?.querySelectorAll<HTMLElement>('.preview') ?? [];
    this.options.forEach((option, index) => {
      const preview = previews[index];
      // worked out again only when its theme, colour or light or dark changed
      const key = `${JSON.stringify(option.file)} ${option.seed} ${option.mode}`;
      if (!preview || this.drawn.get(preview) === key) return;
      applyTokens(preview, computeLook(styleOf(option.file), { seed: option.seed, mode: option.mode, density: 'comfortable' }, false));
      this.drawn.set(preview, key);
    });
  }

  override render() {
    return html`<div class="group" role="radiogroup" aria-label=${this.label}>${this.options.map((option, index) => this.renderOption(
      { ...option, label: option.note ? `${option.label}, ${option.note}` : option.label }, index,
      html`<div class="preview" aria-hidden="true"><div class="hero">76</div><div class="section">
          <div class="tile on"><span class="dot"></span><span class="mark"></span></div>
          <div class="tile"><span class="dot"></span><span class="mark"></span></div></div></div>
        <div class="text"><span class="name">${option.label}</span><span class="note">${option.note}</span></div>`,
    ))}</div>`;
  }
}

if (!customElements.get('mh-look-picker')) customElements.define('mh-look-picker', MhLookPicker);

declare global {
  interface HTMLElementTagNameMap { 'mh-look-picker': MhLookPicker }
}
