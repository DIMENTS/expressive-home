import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import type { CapabilityValue } from '../../homey/types';
import type { Practice } from '../../onboarding/practice';
import { applyTokens } from '../../theme/engine';
import type { ThemeFile } from '../../theme/look';
import { computeLook, styleOf } from '../../theme/styles';
import type { Mode, ShownDensity } from '../../theme/types';
import { RUSTIG_STYLE } from '../apply-theme';
import { sharedStyles } from '../parts/shared-styles';
import { DIM_CLOSE_MS } from '../screens/dashboard-screen';
import type { DimDetail } from '../tiles/light-tile';
import { createTile } from '../tiles/registry';
import { dangerQuestion, type DangerQuestion } from '../model/guard-view';
import type { DangerDetail as AskDetail } from '../parts/ask-danger';
import '../parts/button';
import '../parts/dialog';
import '../parts/dimmer';
import '../tiles/index';

/** As on the dashboard: the tap after the one that asked neither answers the question nor waves it away. */
const SURE_MS = 600;

/**
 * The tiles of the practice: the real tiles of a lamp and a lock, with the hub of the practice and in the chosen look.
 * What they would tell the app stays here: the question for something dangerous is asked here, against the practice, and
 * reported as `practice-ask`; the hint of a slider becomes `practice-hint`, asking for the window of a device
 * `practice-open`; a tile menu goes nowhere. On a phone the lamp is dimmed in the dimmer, as on the dashboard.
 */
export class MhPracticeTiles extends LitElement {
  static override properties = {
    practice: { attribute: false },
    density: { type: String, reflect: true },
    file: { attribute: false },
    seed: { type: String },
    mode: { type: String },
    dim: { state: true },
    question: { state: true },
  };

  declare practice: Practice | null;
  declare density: ShownDensity;
  declare file: ThemeFile | null;
  declare seed: string;
  declare mode: Mode;
  declare dim: (DimDetail & { closing: boolean }) | null;
  /** The question for the lock, while it is asked. */
  declare question: (DangerQuestion & { at: number; run(): void }) | null;
  private tiles: HTMLElement[] = [];
  private made: Practice | null = null;
  private dimTimer: ReturnType<typeof setTimeout> | null = null;
  private drawn = '';

  constructor() {
    super();
    this.practice = null;
    this.density = 'comfortable';
    this.file = null;
    this.seed = '';
    this.mode = 'light';
    this.dim = null;
    this.question = null;
    this.addEventListener('confirm-danger', (event) => { event.stopPropagation(); this.ask((event as CustomEvent<AskDetail>).detail); });
    this.addEventListener('hold-hint', (event) => { event.stopPropagation(); this.tell('practice-hint'); });
    this.addEventListener('tile-menu', (event) => event.stopPropagation());
    this.addEventListener('dim', (event) => { event.stopPropagation(); this.onDim((event as CustomEvent<DimDetail>).detail); });
  }

  static override styles = [sharedStyles, css`
    :host { display: block; width: 100%; max-width: var(--onboarding-board-max); }
    .area {
      display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--tile-gap); padding: var(--space-12);
      border-radius: var(--mini-board-radius); background: var(--section-bg); color: var(--section-fg); font-family: var(--font-family);
      box-shadow: var(--shadow-overlay);
    }
  `];

  private ask({ deviceId, capabilityId, value }: { deviceId: string; capabilityId: string; value: CapabilityValue }): void {
    const practice = this.practice;
    const device = practice?.ctx.store.getDevice(deviceId);
    if (!practice || !device) return;
    this.question = { ...dangerQuestion(device, capabilityId, value, practice.ctx.t), at: Date.now(), run: () => practice.ctx.actions.guard(deviceId, capabilityId, value) };
    this.tell('practice-ask');
  }

  private answer(yes: boolean): void {
    const { question } = this;
    if (!question) return;
    const age = Date.now() - question.at;
    if (age >= 0 && age < SURE_MS) return;
    this.question = null;
    if (yes) question.run();
  }

  /**
   * On a phone a lock tile is narrow and is worked in the window of its device; here it keeps its button, so the
   * holding can be practised all the same.
   */
  private get lockDensity(): ShownDensity {
    return this.density === 'phone' ? 'comfortable' : this.density;
  }

  private tell(type: 'practice-ask' | 'practice-hint' | 'practice-open'): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
  }

  private onDim(detail: DimDetail): void {
    if (detail.phase !== 'start' && this.dim === null) return;
    if (this.dimTimer !== null) clearTimeout(this.dimTimer);
    this.dimTimer = null;
    const closing = detail.phase === 'end';
    this.dim = { ...detail, closing };
    if (closing) this.dimTimer = setTimeout(() => { this.dimTimer = null; this.dim = null; }, DIM_CLOSE_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.dimTimer !== null) clearTimeout(this.dimTimer);
    this.dimTimer = null;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if ((changed.has('practice') || changed.has('density')) && this.practice) {
      if (this.made !== this.practice) {
        this.tiles = [createTile(this.practice.lamp, this.practice.ctx, this.density), createTile(this.practice.lock, this.practice.ctx, this.lockDensity)];
        this.practice.onOpen(() => this.tell('practice-open'));
      }
      const [lamp, lock] = this.tiles as (HTMLElement & { density: ShownDensity })[];
      if (lamp) lamp.density = this.density;
      if (lock) lock.density = this.lockDensity;
      this.made = this.practice;
    }
  }

  protected override updated(): void {
    const area = this.shadowRoot?.querySelector<HTMLElement>('.area');
    const key = `${JSON.stringify(this.file)} ${this.seed} ${this.mode} ${this.density}`;
    if (!area || !this.file || key === this.drawn) return;
    applyTokens(area, computeLook(styleOf(this.file), { seed: this.seed, mode: this.mode, density: this.density }, false));
    this.drawn = key;
  }

  private renderQuestion() {
    const t = this.practice?.ctx.t;
    const { question } = this;
    if (!t) return nothing;
    return html`<mh-dialog ?open=${question !== null} heading=${question?.heading ?? ''} @cancel=${(e: CustomEvent<{ by?: string } | null>) => { if (e.detail?.by === 'key') this.question = null; else this.answer(false); }}>${question?.text ?? ''}
      <mh-button slot="actions" variant="text" data-autofocus @click=${() => this.answer(false)}>${t('section.dialog.cancel')}</mh-button>
      <mh-button slot="actions" @click=${() => this.answer(true)}>${question?.ok ?? ''}</mh-button>
    </mh-dialog>`;
  }

  override render() {
    const { dim } = this;
    return html`<div class="area">${this.tiles}</div>${this.renderQuestion()}${dim ? html`<mh-dimmer .box=${dim.box} .from=${dim.from} .level=${dim.level} .percent=${dim.percent} name=${dim.name} icon=${dim.icon}
      .seed=${null} mode=${this.mode} .look=${this.file ? styleOf(this.file) : RUSTIG_STYLE} ?closing=${dim.closing}></mh-dimmer>` : nothing}`;
  }
}

if (!customElements.get('mh-practice-tiles')) customElements.define('mh-practice-tiles', MhPracticeTiles);

declare global {
  interface HTMLElementTagNameMap { 'mh-practice-tiles': MhPracticeTiles }
}
