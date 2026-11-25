import { css, html, type CSSResultGroup, type PropertyDeclarations, type PropertyValues } from 'lit';
import type { FlowTileSpec } from '../../dashboard/types';
import { isButton } from '../../homey/buttons';
import { flowView } from '../model/tile-view';
import { TileElement } from './tile-base';
import '../parts/icon';

/** How long the tick or the error mark stays on a flow button. */
export const FLOW_FEEDBACK_MS = 1400;

/**
 * A flow button: fully round, the play icon and the flow's name. A tap starts the flow; the icon
 * becomes a tick or an error mark for FLOW_FEEDBACK_MS. Without the right to start flows it is disabled; a button of
 * the app on the hub needs no right, and is disabled when its flows are off. While
 * editing it starts nothing and opens its menu.
 */
export class MhFlowTile extends TileElement<FlowTileSpec> {
  static override properties: PropertyDeclarations = {
    flowName: { type: String },
    feedback: { state: true },
    off: { state: true },
  };

  declare flowName: string;
  declare feedback: 'idle' | 'done' | 'failed';
  /** The flows of a button are all off. */
  declare off: boolean;
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.flowName = '';
    this.feedback = 'idle';
    this.off = false;
  }

  static override styles: CSSResultGroup = [TileElement.styles, css`
    button {
      all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; gap: var(--space-10); min-width: 0;
      min-height: var(--flow-height); padding: 0 var(--space-20); border-radius: var(--flow-radius);
      background: var(--flow-bg); color: var(--flow-fg); box-shadow: inset 0 0 0 var(--tile-outline-width) var(--tile-outline); font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong);
      transition: border-radius var(--motion-spatial), transform var(--motion-spatial), background-color var(--motion-effects), color var(--motion-effects), opacity var(--motion-effects);
      --icon-size: var(--icon-l);
    }
    button:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    button:not(:disabled):hover { background: color-mix(in srgb, currentColor var(--state-hover), var(--flow-bg)); }
    button:not(:disabled):active { border-radius: var(--flow-radius-pressed); transform: scale(var(--flow-press-scale)); }
    button:disabled { cursor: default; opacity: var(--state-disabled-content); }
    :host([stale]) button { opacity: var(--state-stale); cursor: default; }
    :host([editing]) button { box-shadow: inset 0 0 0 var(--edit-ring-width) var(--edit-tile-ring); cursor: grab; }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    :host([density="phone"]) button { padding: 0 var(--space-14); gap: var(--space-8); font-size: var(--type-label-m-size); --icon-size: var(--icon-m); }
    :host([density="phone"]) .name { white-space: normal; overflow-wrap: anywhere; hyphens: auto; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  `];

  protected deviceIds(): string[] {
    return [];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (this.spec && this.ctx) {
      const flow = this.ctx.store.getSnapshot()?.flows.find((f) => f.id === this.spec.flowId);
      this.flowName = flowView(this.spec, flow, this.ctx.t).name;
      this.off = isButton(this.spec.flowId) && flow?.startable === false;
    }
  }

  /** True while a start is on its way: a second tap meanwhile does nothing. */
  private starting = false;

  private get canStart(): boolean {
    return !this.off && (isButton(this.spec.flowId) || this.ctx.status().canStartFlows);
  }

  private async start(): Promise<void> {
    if (!this.canStart || this.starting) return;
    this.starting = true;
    let ok: boolean;
    try {
      ok = await this.ctx.actions.startFlow(this.spec.flowId, this.spec.flowKind);
    } finally {
      this.starting = false;
    }
    if (this.feedbackTimer !== null) clearTimeout(this.feedbackTimer);
    this.feedback = ok ? 'done' : 'failed';
    this.feedbackTimer = setTimeout(() => {
      this.feedbackTimer = null;
      this.feedback = 'idle';
    }, FLOW_FEEDBACK_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.feedbackTimer !== null) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = null;
    this.feedback = 'idle';
  }

  override render() {
    const icon = this.feedback === 'done' ? 'check_circle' : this.feedback === 'failed' ? 'error' : 'play_arrow';
    if (this.editing) {
      return html`<button aria-label=${this.ctx.t('edit.tile.open', { name: this.flowName })} @click=${() => this.openMenu()}>
        <mh-icon name="play_arrow"></mh-icon><span class="name">${this.flowName}</span>
      </button>`;
    }
    return html`<button ?disabled=${!this.canStart} @click=${() => { void this.start(); }}>
      <mh-icon name=${icon} ?filled=${this.feedback !== 'idle'}></mh-icon><span class="name">${this.flowName}</span>
    </button>`;
  }
}

if (!customElements.get('mh-flow-tile')) customElements.define('mh-flow-tile', MhFlowTile);
