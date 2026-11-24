import { css } from 'lit';

/** A place to add something while editing: a dashed edge, as wide as what holds it. */
export const addSlotStyles = css`
  .add-slot {
    all: unset; box-sizing: border-box; cursor: pointer; grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: var(--space-8);
    min-height: var(--add-slot-height); border-radius: var(--tile-radius); border: var(--add-slot-border-width) dashed var(--add-slot-border); color: var(--add-slot-fg);
    font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); --icon-size: var(--icon-m);
  }
  .add-slot:hover { background: color-mix(in srgb, currentColor var(--state-hover), transparent); }
  /* where a dragged tile or section would land: an empty place in the colour of the focus, as high as what is dragged */
  .placeholder {
    min-height: var(--_height, var(--edit-bar-height)); border-radius: var(--tile-radius); background: var(--drop-bg);
    box-shadow: inset 0 0 0 var(--edit-ring-width) var(--drop-border);
  }
  /* what is dragged stays in the page, so a finger keeps reporting to it, but is not shown */
  [data-dragged] { display: none; }
  .add-slot:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
`;
