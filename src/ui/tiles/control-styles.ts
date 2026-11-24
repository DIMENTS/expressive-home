import { css, html, nothing, type TemplateResult } from 'lit';
import { CONTROL_SLIDER_MIN_PX } from '../breakpoints';
import type { IconName } from '../icons/icons';
import '../parts/icon';

/** A row of buttons on a tile or at the top of a window, with or without a slider beside them. */
export const controlStyles = css`
  .line { display: flex; align-items: center; gap: var(--control-gap); min-width: 0; }
  .b {
    all: unset; box-sizing: border-box; position: relative; flex: none; width: var(--control-height); height: var(--control-height); display: grid; place-items: center; cursor: pointer;
    border-radius: var(--control-radius); background: var(--control-bg); touch-action: manipulation; user-select: none; -webkit-user-select: none;
    transition: background-color var(--motion-effects), border-radius var(--motion-spatial), opacity var(--motion-effects);
    --icon-size: var(--icon-m);
  }
  .b.main { background: var(--control-main-bg); color: var(--control-main-fg); border-radius: var(--control-radius-pressed); }
  .b:hover { background: color-mix(in srgb, currentColor var(--control-hover), transparent); }
  .b.main:hover { background: color-mix(in srgb, var(--control-main-fg) var(--state-hover), var(--control-main-bg)); }
  .b:active { border-radius: var(--control-radius-pressed); }
  .b:disabled { cursor: default; opacity: var(--state-disabled-content); }
  .b.dim:not(:hover) { opacity: var(--state-disabled-content); }
  .b:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
  .line > mh-slider, .line > mh-stepper, .line > mh-hold-button { flex: 1 1 0; min-width: 0; }
  /* nothing beside them: they share the row */
  .line:not(:has(mh-slider)) > .b { flex: 1 1 0; }
  .line.joined { gap: var(--space-4); }
  @container (width < ${CONTROL_SLIDER_MIN_PX}px) {
    .line > .b ~ mh-slider { display: none; }
    .line:has(> .b) > .b { flex: 1 1 0; }
  }
`;

export interface ControlButton { icon: IconName; label: string; run(): void; main?: boolean; filled?: boolean; dim?: boolean; /** In the middle of a row, larger. */ middle?: boolean; pressed?: boolean; disabled?: boolean }

export const controlButton = ({ icon, label, run, main = false, filled = false, dim = false, middle = false, pressed, disabled = false }: ControlButton): TemplateResult =>
  html`<button type="button" class="b hit${main ? ' main' : ''}${middle ? ' middle' : ''}${dim ? ' dim' : ''}" aria-label=${label} aria-pressed=${pressed === undefined ? nothing : String(pressed)} ?disabled=${disabled} @click=${run}><mh-icon name=${icon} ?filled=${filled}></mh-icon></button>`;

/** A button that is only there when the device can do it. */
export const controlButtonIf = (there: unknown, button: () => ControlButton): TemplateResult | typeof nothing => (there ? controlButton(button()) : nothing);
