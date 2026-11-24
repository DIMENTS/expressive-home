import { css } from 'lit';
import { PHONE_MAX_PX } from '../breakpoints';

/**
 * The inside of a panel: groups with a title, rows on the row colour, values in a grid of two
 * columns with cells, and a folded group. Shared by the device window, the theme panel and the settings.
 */
export const panelStyles = css`
  section { display: block; }
  h3 {
    margin: 0 0 var(--space-8) var(--space-4); font-size: var(--type-label-m-size); line-height: var(--type-label-m-line);
    font-weight: var(--weight-strong); color: var(--c-on-surface-variant);
  }
  .rows { display: grid; gap: var(--space-8); }
  .row {
    display: flex; align-items: center; gap: var(--space-12); min-height: var(--sheet-row-height); padding: var(--space-10) var(--space-16);
    border-radius: var(--sheet-row-radius); background: var(--sheet-row-bg);
  }
  .row.stack { flex-direction: column; align-items: stretch; gap: var(--space-12); padding: var(--space-14) var(--space-16) var(--space-16); }
  .top { display: flex; align-items: baseline; gap: var(--space-12); }
  .label { flex: 1; min-width: 0; font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); }
  .label small { display: block; font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); font-weight: var(--weight-regular); color: var(--c-on-surface-variant); }
  .value { font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); color: var(--c-on-surface-variant); white-space: nowrap; }
  .row mh-slider { --slider-height: var(--sheet-slider-height); }
  .values { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-8); }
  .cell { display: grid; gap: var(--space-2); min-width: 0; padding: var(--space-12) var(--space-14); border-radius: var(--sheet-cell-radius); background: var(--sheet-row-bg); }
  .cell span { font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cell b { font-size: var(--type-body-l-size); line-height: var(--type-body-l-line); font-weight: var(--weight-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* on a phone a long or large text takes more lines */
  @media (width < ${PHONE_MAX_PX}px) {
    .value, .cell span, .cell b { white-space: normal; overflow-wrap: anywhere; hyphens: auto; }
    .value { text-align: end; }
    .label { min-width: 0; overflow-wrap: anywhere; hyphens: auto; }
  }
  .cell.danger { background: var(--tile-alert-bg); color: var(--tile-alert-fg); }
  .cell.danger span { color: inherit; }
  details summary {
    position: relative; cursor: pointer; list-style: none; display: flex; align-items: center; gap: var(--space-4); min-height: var(--sheet-summary-height);
    margin: 0 0 var(--space-8) var(--space-4); font-size: var(--type-label-m-size); line-height: var(--type-label-m-line);
    font-weight: var(--weight-strong); color: var(--c-on-surface-variant); --icon-size: var(--icon-m);
  }
  details summary::-webkit-details-marker { display: none; }
  details summary::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: max(100%, var(--target-min)); transform: translateY(-50%); }
  details summary mh-icon { transition: transform var(--motion-spatial); }
  details[open] summary mh-icon { transform: rotate(90deg); }
  details summary:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); border-radius: var(--shape-sm); }
`;

/** The list of results, shared with the settings panel: a tick or a cross, a bold line and an explanation. */
export const resultListStyles = css`
  .results { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-8); }
  .results li {
    display: flex; gap: var(--space-12); align-items: flex-start; padding: var(--space-12) var(--space-16);
    border-radius: var(--sheet-cell-radius); background: var(--sheet-row-bg);
    font-size: var(--type-label-m-size); line-height: var(--type-body-l-line); --icon-size: var(--icon-m);
  }
  .results mh-icon { color: var(--c-primary); margin-top: var(--space-2); }
  .results li.missing mh-icon { color: var(--c-error); }
  .results b { display: block; font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); }
`;
