import { css, html, nothing, type TemplateResult } from 'lit';
import type { Formatted } from '../../i18n/format';

/** The large value of a sensor or tank tile, with its unit at half size. */
export const valueStyles = css`
  .head { gap: var(--space-8); }
  .value {
    --_size: var(--type-value-size);
    font-size: var(--_size); line-height: var(--type-value-line); font-weight: var(--weight-strong);
    letter-spacing: var(--tracking-display); white-space: nowrap;
  }
  .unit { font-size: calc(var(--_size) / 2); font-weight: var(--weight-medium); letter-spacing: 0; margin-left: var(--space-2); }
  :host([density="compact"]) .value { --_size: var(--tile-value-small); }
  :host([density="compact"]) .text { flex: 1; grid-template-columns: 1fr auto; align-items: center; column-gap: var(--space-8); }
  :host([density="compact"]) .value { grid-column: 2; grid-row: 1 / span 2; }
  /* a value that does not fit beside the icon goes under it, and its unit under the value */
  :host([density="phone"]) .value { --_size: var(--tile-value-small); white-space: normal; }
  :host([density="phone"]) .value .unit { display: inline-block; }
  :host([density="phone"]) .head { flex-wrap: wrap; gap: var(--space-4) var(--space-8); }
  :host([density="phone"]) .text { flex: 1 1 0; min-width: min-content; }
`;

/** A value with its unit apart, so the unit can be set smaller. */
export function valueTemplate(value: Formatted | null): TemplateResult | typeof nothing {
  if (!value) return nothing;
  return html`<span class="value">${value.text}${value.unit ? html`<span class="unit">${value.unit}</span>` : nothing}</span>`;
}
