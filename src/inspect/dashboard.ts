import type { HomeyClient } from '../homey/client';
import type { Feature } from '../homey/permissions';
import type { Capability, Device } from '../homey/types';
import { heroDeviceIds } from '../dashboard/hero';
import type { CapRef, Dashboard, HeroSpec, TileSpec } from '../dashboard/types';
import type { Store } from '../state/store';

export interface DashboardContext {
  store: Store;
  getClient(): HomeyClient | null;
  missing: Feature[];
}

export function formatCapability(cap: Capability): string {
  const unit = cap.units ? ` ${cap.units}` : '';
  const v = cap.value;
  if (v === null) return `${cap.title}: —`;
  if (typeof v === 'boolean') return `${cap.title}: ${v ? 'aan' : 'uit'}`;
  if (typeof v === 'number') return `${cap.title}: ${Number(v.toFixed(cap.decimals ?? 2))}${unit}`;
  return `${cap.title}: ${v}${unit}`;
}

/** The capability ids a tile refers to, in display order. */
export function tileCapabilityIds(tile: TileSpec): string[] {
  const ids: (string | null)[] = (() => {
    switch (tile.kind) {
      case 'light': return [tile.onoffCapabilityId, tile.dimCapabilityId];
      case 'switch': return [tile.onoffCapabilityId, tile.detailCapabilityId];
      case 'climate': case 'cover': case 'media': case 'guard': case 'widget': case 'flow': return [];
      case 'tank': return [tile.levelCapabilityId, tile.volumeCapabilityId, tile.capacityCapabilityId];
      case 'multi': return tile.capabilityIds;
      case 'button': case 'sensor': return [tile.capabilityId];
      case 'generic': return [tile.capabilityId];
      case 'flow': return [];
    }
  })();
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

function describe(device: Device | undefined, ids: string[]): string {
  if (!device) return '(apparaat verdwenen)';
  return ids
    .map((id) => device.capabilities[id])
    .filter((c): c is Capability => c !== undefined)
    .map(formatCapability)
    .join(' | ');
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
};

const errorText = (error: unknown): string => ` ${error instanceof Error ? error.message : String(error)}`;

function numberValue(ctx: DashboardContext, ref: CapRef): number | null {
  const v = ctx.store.getDevice(ref.deviceId)?.capabilities[ref.capabilityId]?.value;
  return typeof v === 'number' ? v : null;
}

function refText(ctx: DashboardContext, ref: CapRef): string {
  return describe(ctx.store.getDevice(ref.deviceId), [ref.capabilityId]);
}

function renderHero(ctx: DashboardContext, hero: HeroSpec, unsubs: (() => void)[]): HTMLElement {
  const box = el('div');
  box.append(el('h3', `Blikvanger: ${hero.kind}`));
  const lines = el('ul');
  box.append(lines);
  const update = (): void => {
    lines.replaceChildren();
    lines.append(el('li', `primair: ${refText(ctx, hero.primary)}`));
    if (hero.timeToGo) lines.append(el('li', `tijd te gaan: ${refText(ctx, hero.timeToGo)}`));
    const solar = hero.stats.find((s) => s.role === 'solar');
    const consumption = hero.stats.find((s) => s.role === 'consumption');
    for (const stat of hero.stats) {
      if (stat.role !== 'net') {
        lines.append(el('li', `${stat.role}: ${refText(ctx, stat.ref)}`));
        continue;
      }
      const s = solar && solar.role !== 'net' ? numberValue(ctx, solar.ref) : null;
      const c = consumption && consumption.role !== 'net' ? numberValue(ctx, consumption.ref) : null;
      lines.append(el('li', `net: ${s !== null && c !== null ? `${Number((s - c).toFixed(2))} W` : '—'}`));
    }
  };
  update();
  for (const id of heroDeviceIds(hero)) unsubs.push(ctx.store.subscribeDevice(id, update));
  return box;
}

function renderTile(ctx: DashboardContext, tile: TileSpec, flowName: string | null, unsubs: (() => void)[]): HTMLElement {
  const li = el('li');
  const text = el('span');
  const note = el('span');
  li.append(text);

  if (tile.kind === 'flow') {
    text.textContent = `[flow, ${tile.size}] ${flowName ?? tile.flowId} (${tile.flowKind})`;
    const button = el('button', 'Start');
    button.type = 'button';
    button.disabled = ctx.missing.includes('startFlows');
    button.addEventListener('click', () => {
      note.textContent = '';
      ctx.getClient()?.startFlow({ id: tile.flowId, kind: tile.flowKind }).then(
        () => { note.textContent = ' gestart'; },
        (error: unknown) => { note.textContent = errorText(error); },
      );
    });
    li.append(' ', button, note);
    return li;
  }
  if (tile.kind === 'widget') {
    text.textContent = `[widget, ${tile.size}] ${tile.widget}`;
    return li;
  }

  const ids = tileCapabilityIds(tile);
  const update = (): void => {
    const device = ctx.store.getDevice(tile.deviceId);
    text.textContent = `[${tile.kind}, ${tile.size}] ${device?.name ?? '?'}: ${describe(device, ids)}`;
  };
  update();
  unsubs.push(ctx.store.subscribeDevice(tile.deviceId, update));

  // A lamp that can only be dimmed names no capability to toggle and gets no button.
  const toggleId = tile.kind === 'switch' || tile.kind === 'light' ? tile.onoffCapabilityId : null;
  if (toggleId !== null) {
    const button = el('button', 'Omzetten');
    button.type = 'button';
    button.disabled = ctx.missing.includes('controlDevices');
    button.addEventListener('click', () => {
      const client = ctx.getClient();
      if (!client) return;
      const next = ctx.store.getDevice(tile.deviceId)?.capabilities[toggleId]?.value !== true;
      note.textContent = '';
      ctx.store.control(tile.deviceId, toggleId, next, () => client.setCapability(tile.deviceId, toggleId, next)).catch(
        (error: unknown) => { note.textContent = errorText(error); },
      );
    });
    li.append(' ', button, note);
  }
  return li;
}

/** Rebuilds the dashboard list; returns a function that drops its store subscriptions. */
export function renderDashboard(target: HTMLElement, ctx: DashboardContext, dashboard: Dashboard): () => void {
  const unsubs: (() => void)[] = [];
  const flowNames = new Map((ctx.store.getSnapshot()?.flows ?? []).map((f) => [f.id, f.name]));
  target.replaceChildren();
  if (dashboard.hero) target.append(renderHero(ctx, dashboard.hero, unsubs));
  for (const section of dashboard.sections) {
    target.append(el('h3', `${section.titleKey} (${section.tiles.length})`));
    const list = el('ul');
    for (const tile of section.tiles) {
      list.append(renderTile(ctx, tile, tile.kind === 'flow' ? flowNames.get(tile.flowId) ?? null : null, unsubs));
    }
    target.append(list);
  }
  return () => { for (const off of unsubs) off(); };
}
