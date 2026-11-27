import type { HeroChart } from '../../layout/types';
import { LitElement, css, html, nothing } from 'lit';
import { createHomeyApiClient, type HomeyApiLib } from '../../homey/api-client';
import type { HomeyClient } from '../../homey/client';
import { createSwitchableTranslate, createTranslate, resolveLanguage, type Language, type Translate } from '../../i18n';
import { createMockClient } from '../../mock/mock-client';
import { createStore, type Store } from '../../state/store';
import { createDefaultConfig, type ConfigStore } from '../../storage/config';
import { createLocalConfigStore, STORAGE_KEY } from '../../storage/local-store';
import { LOOKS_KEY, createLooksStore, type LooksStore } from '../../storage/looks-store';
import { darkMedia, watchSystemDark } from '../../theme/system-mode';
import { resolveMode } from '../../theme/engine';
import { rustigExpressive } from '../../theme/rustig-expressive';
import type { Density, Mode, ShownDensity, ThemeSettings } from '../../theme/types';
import type { FlowNight } from '../../wall/night';
import { wallHubOf, withWallHub, type WallHub, type WallSettings } from '../../wall/settings';
import { createScreen, fullyOf, screenWanted } from '../../wall/screen';
import { followsSun, keptSunOf, sunDark, withSun } from '../../theme/sun';
import { alarmKind, dangerAlarms } from '../../recognition/recognize';
import { BATTERY } from '../../recognition/table';
import { RUSTIG_STYLE, applyThemeTo } from '../apply-theme';
import { isSafeAddress, safeLook } from '../safe-look';
import { styleOf, type Style } from '../../theme/styles';
import { shownSeed, type ChosenLook, type DeviceLook } from '../../theme/choose';
import type { LookChoose } from '../panels/theme-panel';
import { lookChoice, lookTarget, poorPlaces, type LookTarget } from '../model/look-view';
import type { ThemeFile } from '../../theme/look';
import type { LookOp } from '../../theme/look-ops';
import type { LooksDoc } from '../../theme/looks-doc';
import { adoptPageStyles } from '../page-styles';
import { phoneMedia, watchPhone } from '../phone';
import type { IconName } from '../icons/icons';
import type { MhSettingsPanel } from '../panels/settings-panel';
import type { MhSnackbar, SnackbarMessage } from '../parts/snackbar';
import { sharedStyles } from '../parts/shared-styles';
import type { LayoutEdit } from '../../layout/edit';
import { readLayoutFile } from '../../layout/file';
import { heroSectionId, OVERVIEW_ID, roomBoardId, roomOfBoard, ROOMS_ID, type Column, type DashboardLayout, type HeroChoice, type SectionLayout, type TileLayout } from '../../layout/types';
import { isLibraryIcon } from '../icons/library';
import { pickHero } from '../../dashboard/hero';
import { isDeviceTile, sectionId, type Section, type SectionKind, type TileSpec } from '../../dashboard/types';
import { builtInWidget, widgetName } from '../../widgets/catalog';
import type { CapabilityValue } from '../../homey/types';
import { createLocalWidgets, type WidgetLibrary } from '../../widgets/library-source';
import { appWidgetCall, appWidgetList, appWidgetSearch, type AppWidgetRow } from '../../widgets/app-widget-link';
import { widgetText, type WidgetFile } from '../../widgets/widget-file';
import { appSettings, builtInSettings, ownSettings, wantsSettings, type SettingDef } from '../../widgets/settings';
import { ownWidgetId } from '../../widgets/widget-ref';
import type { PickOption, WidgetPicks } from '../panels/widget-panel';
import '../panels/widget-panel';
import type { NewItem } from '../../layout/reconcile';
import { isLeftKind, sectionIcon, sectionTitle, shownSectionIcon } from '../model/layout';
import { tanksOf, temperatureSources } from '../model/rest-view';
import { flowView, tileView } from '../model/tile-view';
import { boardMenuGroups, type BoardAction } from '../screens/edit-menus';
import type { MhDashboard } from '../screens/dashboard-screen';
import type { DeviceKind } from '../../served/pair-link';
import type { PairIssue } from '../screens/pair-screen';
import type { MhRestScreen } from '../screens/rest-screen';
import type { RailBoard, RailTarget } from '../screens/rail';
import type { UiContext } from './context';
import { createController, type AppState, type Controller, type ControllerDeps } from './controller';
import { houseLife, houseRaw } from '../../mock/house';
import { demoRaw, simulationRate, type Demo } from './demo';
import { safeStorage } from './safe-storage';
import { isGuarded } from '../../controls/danger';
import type { Grouping } from '../../dashboard/types';
import { roomsOf } from '../../rooms/rooms';
import { dangerQuestion } from '../model/guard-view';
import type { DangerDetail } from '../parts/ask-danger';
import { servedEnvironment } from './served';
import { awayPairing, createSynced, keepAwayPairing, pairAway, type AwayPairResult, type Synced } from './synced';
import type { AwayState } from '../panels/sync-section';
import { createWall, type Wall } from './wall';
import '../parts/button';
import '../parts/dialog';
import '../parts/snackbar';
import '../screens/connect-screen';
import '../screens/framed-screen';
import { isFramed } from './framed';
import '../screens/pair-screen';
import '../panels/board-look-panel';
import '../screens/dashboard-screen';
import '../screens/rest-screen';
import '../panels/add-panel';
import '../panels/device-panel';
import '../panels/hero-panel';
import '../panels/name-icon-dialog';
import '../panels/news-panel';
import '../panels/settings-panel';
import '../panels/theme-panel';
import '../panels/tile-panel';
import '../panels/wall-panel';
import '../tiles/index';
import { DASHBOARD_PARTS, REST_PARTS } from '../part-names';
import { ownCss, ownCssSheets, type OwnCss } from '../own-css';
import { allowedCss } from '../../storage/looks-store';
import type { CssFrom } from '../../theme/looks-doc';
import type { LiveHandle, LiveListener } from '../../widgets/app-live';
import { createReadSource, type ReadSource, type ReadState } from '../../widgets/live-reads';
import { readWeather, type Weather } from '../../widgets/weather';
import { energyPeriodClock, readEnergyReport, type EnergyPeriod, type EnergyReport } from '../../widgets/energy';
import { PROGRESS_KEY, defaultChoices, readProgress, stepsFor, writeProgress, type Choices, type Extra, type Progress, type StepId } from '../../onboarding/choices';
import { arrangeOverview } from '../../onboarding/arrange';
import { NEXT_KEY, hasWidget, nextSteps, readNext, startNext, withDone, writeNext, type NextState, type NextStep } from '../../onboarding/next-steps';
import { hasRooms } from '../../rooms/zones';
import { PAGES_TEXT, PAGES_URL } from '../../app/links';
import { richText } from '../parts/rich-text';
import '../onboarding/onboarding';

/** The rest screen waits this long for a theme that is being tried out. */
const TRY_OUT_REST_MS = 10 * 60_000;
/** How often a page asks the weather and a period of energy while something shows it. */
export const READ_EVERY_MS = { weather: 10 * 60_000, day: 5 * 60_000, week: 30 * 60_000, month: 30 * 60_000 } as const;

const homeyLib = (): HomeyApiLib | null =>
  (typeof (window as { HomeyAPIV3Local?: unknown }).HomeyAPIV3Local === 'function' ? (window as unknown as HomeyApiLib) : null);

/** The example hub: a house, or a camper with friendly names; values move a little until it is left, nothing goes to a hub. */
function createDemoClient(which: Demo, language: Language): HomeyClient {
  const mock = which === 'house' ? createMockClient(houseRaw(language), { life: houseLife() }) : createMockClient(demoRaw());
  const eventsPerSecond = simulationRate(window.location.search);
  mock.simulate(
    { setInterval: (fn, ms) => window.setInterval(fn, ms), clearInterval: (handle) => window.clearInterval(handle as number) },
    eventsPerSecond === undefined ? {} : { eventsPerSecond },
  );
  return mock;
}

/** Says to the page that is loaded anew that nobody is there. */
export const REST_KEY = 'dashboard.rest';
/** Where the last darkness of the sun is kept, with its time: a page that starts at night starts dark. */
const SUN_KEY = 'dashboard.sun';

function keepSun(dark: boolean, at: number): void {
  try { safeStorage(() => window.localStorage).setItem(SUN_KEY, JSON.stringify({ dark, at })); } catch { /* best effort */ }
}

/** The darkness of the sun as it was kept, when that was not long ago; null otherwise. */
function keptSun(now = Date.now()): boolean | null {
  try { return keptSunOf(safeStorage(() => window.localStorage).getItem(SUN_KEY), now); } catch { return null; }
}

/** Where the brightness of the screen of before is kept while the dashboard dims it. */
const SCREEN_KEY = 'dashboard.screen.before';
/** Set just before the page starts anew because the hub took this page's pairing away: said once when it is back. */
export const AWAY_GONE_KEY = 'dashboard.away.gone';

/** What the app needs from the outside world; the browser's by default, a fake one in tests. */
export interface AppEnvironment {
  configStore: ConfigStore;
  /** Where this device keeps its looks. */
  looksStore?: LooksStore;
  createRealClient: ControllerDeps['createRealClient'];
  createDemoClient(which: Demo, language: Language): HomeyClient;
  /** Runs a store flush; in the browser at the next frame, so the live state redraws at most once per frame. */
  schedule(flush: () => void): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** The browser's preferred languages, first the most preferred. */
  browserLanguages: readonly string[];
  /** Calls back when another tab saved the configuration; returns how to stop. */
  watchStored?(changed: () => void): () => void;
  /** Only when the app on the hub served this page: devices are paired, there is no key. */
  served?: {
    pair(code: string, name: string): Promise<'ok' | Exclude<PairIssue, 'none'>>;
    /** The code that the page was opened with. */
    scanned(): string | null;
    /** Hears of a code that is scanned while the page is open. */
    onScanned(listener: (code: string) => void): void;
    /** What this device is, as far as can be told. */
    kind(): DeviceKind;
    mayArrange(): boolean;
    /** What the hub says this device may; null until it said so. */
    knownRole(): 'edit' | 'use' | null;
    /** The own widgets of the house, on the hub. */
    widgets?: WidgetLibrary;
    /** The widgets of other apps the hub has, when the app on the hub has a key for them. */
    appWidgets?(): Promise<unknown>;
    appWidgetApi?(ref: string, method: string, route: string, body: unknown): Promise<unknown>;
    /** The live news of the app of a widget on this page. */
    appLive?(ref: string, listener: LiveListener): LiveHandle;
    /** The choices of a setting with a search list of such a widget. */
    appWidgetSearch?(ref: string, setting: string, query: string): Promise<unknown>;
    /** Changes of the house's looks to the hub. */
    sendLooks?(ops: LookOp[]): void;
    /** Calls back with what the hub has of looks, also with what came before; a rescue comes with it. */
    onLooks?(listener: (doc: LooksDoc) => void): void;
    /** Calls back when the hub refused a change of looks. */
    onLooksRefused?(listener: () => void): void;
    /** Calls back when the hub did not keep a theme: all themes together would be too big. */
    onLooksTooBig?(listener: () => void): void;
    /** Calls back when another device saved first. */
    onConflict(listener: () => void): void;
    /** Calls back when a change is not on the hub yet; it is tried again by itself. */
    onUnsaved(listener: () => void): void;
    /** Calls back when a flow on the hub began or ended the night of the wall tablets; null: no flow said anything. */
    onNight(listener: (flow: FlowNight | null) => void): void;
    /** Calls back when the hub has another version of the dashboard than this page. */
    onNewBuild(listener: () => void): void;
    /** Everything that was arranged here is on the hub. */
    settled(): boolean;
    reload(): void;
    /** This device paired on this page as the first of a hub that nobody arranged yet; absent is no. */
    fresh?(): boolean;
  };
  /** A page with a key that is paired with the app on its hub: its dashboards, looks and own widgets come from there. */
  synced?: Synced;
  /** A page with a key: pairing with the app on its hub, for dashboards that are the same at home and away. */
  away?: {
    pair(code: string, name: string): Promise<AwayPairResult>;
    /** Whether this page is paired with the app on the hub of its key. */
    paired(): boolean;
    /** Takes this page off the hub and forgets the pairing. */
    unpair(): Promise<void>;
  };
}

/** The hub of the key kept in this browser; null when there is none. */
function keptHomeyId(storage: Pick<Storage, 'getItem'>): string | null {
  try {
    const id: unknown = (JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null') as { connection?: { homeyId?: unknown } } | null)?.connection?.homeyId;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/** The browser: local storage (or a stand-in when refused), Athom's library, timers and animation frames. */
export function browserEnvironment(): AppEnvironment {
  if (__SERVED_BY_HOMEY__) return servedEnvironment(createDemoClient);
  const storage = safeStorage(() => window.localStorage);
  const homeyId = keptHomeyId(storage);
  // paired with the app on the hub of the key: the dashboards are the hub's
  const synced = homeyId !== null && awayPairing(storage, homeyId) !== null
    ? createSynced(storage, homeyId, { fetch: window.fetch.bind(window), setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (handle) => window.clearTimeout(handle as number), now: () => Date.now() })
    : undefined;
  if (synced) {
    // out of sight it does not look; looked at again, or back online, it looks at once; what waits goes when the page closes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        synced.flush();
        synced.link.sleep();
      } else {
        synced.link.wake();
      }
    });
    window.addEventListener('pagehide', () => synced.flush(true));
    for (const back of ['pageshow', 'online']) window.addEventListener(back, () => synced.link.wake());
  }
  return {
    ...(synced ? { synced } : {}),
    away: {
      pair: async (code, name) => {
        const id = keptHomeyId(storage);
        return id === null ? 'unreachable' : pairAway(storage, window.fetch.bind(window), id, code, name);
      },
      paired: () => awayPairing(storage, keptHomeyId(storage)) !== null,
      unpair: async () => {
        if (synced) await synced.unpair();
        const id = keptHomeyId(storage);
        if (id !== null) keepAwayPairing(storage, id, null);
      },
    },
    configStore: synced?.configStore ?? createLocalConfigStore(storage),
    looksStore: createLooksStore(safeStorage(() => window.localStorage)),
    createRealClient: (settings) => {
      const lib = homeyLib();
      if (!lib) return null;
      return createHomeyApiClient(lib, settings, {
        fetch: window.fetch.bind(window),
        setInterval: (fn, ms) => window.setInterval(fn, ms),
        clearInterval: (handle) => window.clearInterval(handle as number),
        addOnlineListener: (fn) => {
          window.addEventListener('online', fn);
          return () => window.removeEventListener('online', fn);
        },
        now: () => Date.now(),
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: (handle) => window.clearTimeout(handle as number),
      });
    },
    createDemoClient,
    schedule: (flush) => { requestAnimationFrame(flush); },
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    browserLanguages: navigator.languages?.length ? [...navigator.languages] : [navigator.language],
    watchStored: (changed) => {
      const onStorage = (event: StorageEvent): void => { if (event.key === STORAGE_KEY || event.key === LOOKS_KEY) changed(); };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
  };
}

/** A panel of the edit mode: adding to a section, the settings of a tile or the hero, or what is new on the hub. */
type EditPanel = { kind: 'news' } | { kind: 'add'; sectionId: string } | { kind: 'tile'; tileId: string } | { kind: 'hero'; sectionId: string };

/** A question with one answer that does something. */
interface Question { heading: string; text: string; ok: string; run(): void; /** Asked about something dangerous, at this moment. */ dangerAt?: number }

type TilePatch = Partial<Pick<TileLayout, 'spec' | 'size' | 'label' | 'icon'>>;

/** How long a new tile lights up; the animation itself takes motion-arrive. */
export const FRESH_MS = 2000;
/** A question about something dangerous is not answered by the tap after the one that asked it. */
export const SURE_MS = 600;
/** And it goes away when nobody answers. */
export const ASK_MS = 30_000;
/** How long it is not told again how a slider is held. */
const HOLD_HINT_EVERY_MS = 3_600_000;
/** How long the dashboard comes in after the first start. */
export const ARRIVE_MS = 2400;
/** The hubs this browser did the first start of, or skipped it: it never comes again for them here. */
export const ONBOARDED_KEY = 'dashboard.onboarded';

/**
 * The app: makes the live state, the controller and the theme on the document, and shows
 * per phase the connect screen or the dashboard, with the panels and the short notice. Set `environment`
 * before the element is attached to replace the browser's (tests do).
 */
export class MhApp extends LitElement {
  static override properties = { state: { state: true }, panel: { state: true }, editPanel: { state: true }, freshTiles: { state: true }, sectionDialog: { state: true }, boardDialog: { state: true }, pairIssue: { state: true }, pairing: { state: true }, scanned: { state: true }, phone: { state: true }, question: { state: true }, asking: { state: true }, draftLook: { state: true }, boardLook: { state: true }, onboarding: { state: true }, reads: { state: true }, arriving: { state: true }, pointing: { state: true }, next: { state: true }, nextDialog: { state: true } };
  declare state: AppState;
  /** The panel opened from the rail or a header label. */
  declare panel: 'none' | 'theme' | 'settings' | 'wall';
  /** The panel of the edit mode that is open. */
  declare editPanel: EditPanel | null;
  /** The dialog to add a section (id null) or rename one. */
  declare sectionDialog: { sectionId: string | null; column: Column; placeRef?: string } | null;
  /** The dialog for a new dashboard, or for the name and icon of the open one. */
  declare boardDialog: 'new' | 'edit' | null;
  /** Pairing this device, when the app on the hub served the page. */
  declare pairIssue: PairIssue;
  declare pairing: boolean;
  /** A code that was scanned and not used yet. */
  declare scanned: string;
  /**
   * The window is as narrow as a phone: there is nothing to arrange with. The edit mode and its panels are
   * hidden, not ended, with what was typed in them: a window can be narrow for a moment (an iPad that goes to the background).
   */
  declare phone: boolean;
  /** A question before something is taken away; it keeps its text while the dialog fades out. */
  declare question: Question;
  declare asking: boolean;
  /** A theme being adjusted in the theme panel: the page shows it until it is saved or thrown away. */
  declare draftLook: ThemeFile | null;
  /** The panel with the look of the open dashboard. */
  declare boardLook: boolean;
  /** The first start of the hub, while it goes on; null: the dashboard. */
  declare onboarding: Progress | null;
  /** What the first start knows of the hub: the widgets it can fill, and whether it is dark there. */
  declare reads: { extras: Extra[]; sunDark: boolean | null };
  /** The dashboard comes in after the first start. */
  declare arriving: boolean;
  /** The pointer beside "Bewerken", after the first start. */
  declare pointing: boolean;
  /** The card "Verder inrichten"; null: this device has none. */
  declare next: NextState | null;
  /** The window of a step of that card. */
  declare nextDialog: 'pair' | 'away' | null;
  /** Whether a first start under way was looked for, after the page was loaded. */
  private progressRead = false;
  /** Paired on this page: whether it is the first start is decided as soon as the hub is known. */
  private justPaired = false;
  private arriveTimer: ReturnType<typeof setTimeout> | null = null;
  /** The tiles that were just added. */
  declare freshTiles: readonly string[];
  private freshTimer: unknown = null;
  /** The notice with "Ongedaan maken" that is on screen, and the step it is about. */
  private undoNotice: { step: number | null; message: SnackbarMessage } | null = null;
  /** How often a panel opened: what is typed in one opening is one step to undo. */
  private openings = 0;
  environment: AppEnvironment | null = null;
  /** Whether the page is inside a frame of another website; null: the app looks itself. */
  inFrame: boolean | null = null;
  /** Inside a frame: the app shows only how to open it, and starts nothing. Decided once, when first attached. */
  private framed: boolean | null = null;
  private framedT: Translate | null = null;

  private media = darkMedia();
  private narrow = phoneMedia();
  private stopNarrow: (() => void) | null = null;
  private appliedTheme: { theme: ThemeSettings; dark: boolean; density: ShownDensity; night: boolean; style: Style } | null = null;
  /** `#veilig` after the address: this load shows Rustig, whatever was chosen. */
  private readonly safe = typeof location !== 'undefined' && isSafeAddress(location.hash);
  /** What each always-Rustig element last got, so it is only set again when that changes. */
  private safeApplied = new WeakMap<HTMLElement, string>();
  private store!: Store;
  private controller!: Controller;
  private wall!: Wall;
  /** What had the focus when the rest screen came; null: nothing, or something in a panel that closed. */
  private focusBefore: HTMLElement | null = null;
  private panelBefore = false;
  /** The hub has another version of the dashboard. */
  private outdated = false;
  private ctx!: UiContext;
  private started = false;
  private env!: AppEnvironment;
  private stopWatching: (() => void) | null = null;

  constructor() {
    super();
    adoptPageStyles();
    this.panel = 'none';
    this.editPanel = null;
    this.freshTiles = [];
    this.sectionDialog = null;
    this.boardDialog = null;
    this.pairIssue = 'none';
    this.pairing = false;
    this.scanned = '';
    this.phone = this.narrow?.matches ?? false;
    this.question = { heading: '', text: '', ok: '', run: () => {} };
    this.draftLook = null;
    this.boardLook = false;
    this.asking = false;
    this.onboarding = null;
    this.reads = { extras: [], sunDark: null };
    this.arriving = false;
    this.pointing = false;
    this.next = null;
    this.nextDialog = null;
    // The system turned light or dark: the document follows, and so do the sections with their own colour.
    if (this.media) watchSystemDark(this.media, () => { if (this.framed) { this.showFramed(); return; } this.appliedTheme = null; this.applyTheme(); this.requestUpdate(); });
  }

  /** What the hub said last of the widgets of other apps, by their reference. */
  /** The weather and the periods of energy of the hub, asked while something shows them. */
  private weatherSource!: ReadSource<Weather>;
  private energySources!: Record<EnergyPeriod, ReadSource<EnergyReport>>;
  private hadRoute = false;
  /** Fully Kiosk lets the page reach the light of the screen; null anywhere else. */
  private readonly fully = fullyOf(window);
  /** Made when the app starts: it reads the brightness of before at once. */
  private screen!: ReturnType<typeof createScreen>;
  /** How the screen hears of an alarm at night. */
  private screenHeard: (() => void)[] = [];
  /** Whether it is dark outside at the hub, while light and dark follow the sun; null when that is not known. */
  private sunDarkNow: boolean | null = null;
  /** How the page hears of the weather for it, while it does. */
  private sunHeard: (() => void) | null = null;
  /** The hub that what the weather and energy show is of. */
  private readsOf: string | null = null;
  private appRows = new Map<string, AppWidgetRow>();
  private appRowsRead: Promise<unknown> | null = null;

  private async readAppWidgets(read: () => Promise<unknown>) {
    const list = await appWidgetList(read);
    if (list.widgets.length > 0) this.appRows = new Map(list.widgets.map((row) => [row.ref, row]));
    return list;
  }

  /** The own widgets of the open house: on the hub when it served this page, otherwise in this browser. */
  private widgetLibrary: WidgetLibrary | null = null;

  /** Makes the store and the controller from the environment, once, when the app is first attached. */
  private setup(): void {
    this.screen = createScreen({
      fully: this.fully,
      kept: {
        get: () => safeStorage(() => window.localStorage).getItem(SCREEN_KEY),
        set: (value) => { const storage = safeStorage(() => window.localStorage); try { if (value === null) storage.removeItem(SCREEN_KEY); else storage.setItem(SCREEN_KEY, value); } catch { /* best effort */ } },
      },
    });
    this.sunDarkNow = keptSun();
    const env = this.environment ?? browserEnvironment();
    this.env = env;
    this.store = createStore(env.schedule);
    const translate = createSwitchableTranslate(resolveLanguage(null, env.browserLanguages));
    this.controller = createController({
      configStore: env.configStore,
      store: this.store,
      createRealClient: env.createRealClient,
      createDemoClient: env.createDemoClient,
      notify: (message) => this.notify(message),
      setTimeout: env.setTimeout,
      clearTimeout: env.clearTimeout,
      t: translate,
      browserLanguages: env.browserLanguages,
      mayArrange: () => env.served?.mayArrange() ?? env.synced?.mayArrange() ?? true,
      served: env.served !== undefined,
      ...(env.looksStore ? { looksStore: env.looksStore } : {}),
      ...(env.served ? { lookRole: () => env.served!.knownRole() } : env.synced ? { lookRole: () => env.synced!.knownRole() } : {}),
      ...(env.served?.sendLooks ? { sendLooks: (ops: LookOp[]) => env.served!.sendLooks!(ops) } : env.synced ? { sendLooks: (ops: LookOp[]) => env.synced!.sendLooks(ops) } : {}),
    });
    // what is shared with the app on the hub: on a page the hub served, or on a page with a key that is paired with it
    const shared = env.served ?? env.synced;
    shared?.onLooks?.((doc) => this.controller.adoptHubLooks(doc));
    shared?.onLooksRefused?.(() => this.notify({ text: this.ctx.t('notify.looksRefused'), icon: 'info' }));
    shared?.onLooksTooBig?.(() => this.notify({ text: this.ctx.t('notify.looksTooBig'), icon: 'warning' }));
    shared?.onConflict(() => this.notify({ text: this.ctx.t('notify.conflict'), icon: 'info' }));
    env.synced?.onUnsaved(() => this.notify({ text: this.ctx.t('notify.saveLater'), icon: 'cloud_off' }));
    // what the door says of the hub shows in the settings
    for (const type of ['open', 'lost', 'role'] as const) env.synced?.link.on(type, () => this.requestUpdate());
    env.synced?.onUnpaired((by) => {
      // the copy here is its own from now on; the page starts anew without the hub's dashboards, and says why when the hub did it
      if (by === 'hub') try { window.sessionStorage.setItem(AWAY_GONE_KEY, '1'); } catch { /* best effort */ }
      window.location.reload();
    });
    env.synced?.onRefused((why) => this.notify({ text: this.ctx.t(why === 'too-big' ? 'sync.tooBig' : why === 'format' ? 'sync.updateApp' : 'sync.refused'), icon: 'error' }));
    this.scanned = env.served?.scanned() ?? '';
    env.served?.onScanned((code) => {
      if (this.state?.phase === 'dashboard') return;
      this.scanned = code;
      this.pairIssue = 'none';
    });
    env.served?.onNight((flow) => this.wall.setFlow(flow));
    env.served?.onNewBuild(() => {
      this.outdated = true;
      this.requestUpdate();
    });
    env.served?.onUnsaved(() => this.notify({ text: this.ctx.t('notify.saveLater'), icon: 'cloud_off' }));
    this.state = this.controller.getState();
    this.wall = createWall({
      target: window, now: () => Date.now(), setTimeout: env.setTimeout, clearTimeout: env.clearTimeout,
      settings: () => this.state.wall, allowed: () => this.mayRest(),
      began: () => this.beginRest(), ended: (kind) => { void this.endRest(kind); }, update: () => this.requestUpdate(),
    });
    const sight = {
      visible: () => document.visibilityState !== 'hidden',
      onVisible: (fn: () => void) => {
        const seen = (): void => { if (document.visibilityState !== 'hidden') fn(); };
        document.addEventListener('visibilitychange', seen);
        return () => document.removeEventListener('visibilitychange', seen);
      },
      setTimeout: env.setTimeout, clearTimeout: env.clearTimeout, now: () => Date.now(),
    };
    this.weatherSource = createReadSource({ ...sight, read: () => this.controller.readWeather(), parse: readWeather, everyMs: READ_EVERY_MS.weather });
    const energySource = (period: EnergyPeriod) => createReadSource({
      ...sight, read: () => this.controller.readEnergy(period), parse: readEnergyReport, everyMs: READ_EVERY_MS[period], period: energyPeriodClock(period),
    });
    this.energySources = { day: energySource('day'), week: energySource('week'), month: energySource('month') };
    this.hearScreen();
    this.ctx = { store: this.store, t: createTranslate(this.state.language.active), actions: this.controller.actions, status: () => this.controller.status(), busy: (id) => this.controller.busy(id), history: this.controller.history,
      widgets: { boards: () => this.places().map(({ id, name, icon }) => ({ id, name, icon })), openBoard: (id) => this.navigate(`board:${id}`), own: () => this.widgetLibrary?.list() ?? [], safe: () => this.safe,
        // paired from outside: own widgets are only changed at home
        ownAtHomeOnly: () => env.synced !== undefined,
        ask: (deviceId, capabilityId, value, widgetName) => this.askForWidget(deviceId, capabilityId, value, widgetName),
        ...(env.served?.appWidgets ? {
          apps: () => this.readAppWidgets(env.served!.appWidgets!),
          appRow: (ref) => (this.appRowsRead ??= this.readAppWidgets(env.served!.appWidgets!)).then(() => this.appRows.get(ref)),
          appApi: (ref, method, path, body) => appWidgetCall(env.served!.appWidgetApi, ref, method, path, body),
        } : {}),
        ...(env.served?.appLive ? { live: (ref, listener) => env.served!.appLive!(ref, listener) } : {}),
        weather: this.weatherSource, energy: (period) => this.energySources[period] } };
    this.widgetLibrary = env.served?.widgets ?? env.synced?.widgets ?? createLocalWidgets(safeStorage(() => window.localStorage), () => this.controller.hubId(), window);
    this.widgetLibrary.subscribe(() => this.requestUpdate());
    if (env.served) this.next = readNext(this.kept(NEXT_KEY));
    document.documentElement.lang = this.state.language.active;
    this.sayAwayGone();
    this.controller.subscribe(() => {
      this.state = this.controller.getState();
      // the hub came back: what is shown of it is asked again
      const route = this.state.route !== null;
      const reads = [this.weatherSource, ...Object.values(this.energySources)];
      // what is known of one hub is never shown as of the next
      if (this.state.hubId !== this.readsOf) for (const source of reads) source.clear();
      else if (route && !this.hadRoute) for (const source of reads) source.refresh();
      this.readsOf = this.state.hubId;
      this.hadRoute = route;
      // a device that is paired has no use for it
      if (this.state.phase === 'dashboard') this.scanned = '';
      this.followOnboarding();
      this.followLanguage(this.state.language.active);
      // Leaving the dashboard (a rejected key, another key or hub) closes its panels too.
      if (this.state.phase === 'connect') {
        this.panel = 'none';
        this.editPanel = null;
        this.sectionDialog = null;
        this.boardDialog = null;
        this.asking = false;
      }
      this.closeStale();
    });
  }

  /** When it was told how a slider is held. */
  private hintedAt = Number.NEGATIVE_INFINITY;

  /** A finger tapped a slider or swiped along it: nothing happened, so it is told why. Not again and again. */
  private hintHold(): void {
    const age = Date.now() - this.hintedAt;
    if (age >= 0 && age < HOLD_HINT_EVERY_MS) return;
    // what is there to choose stays
    const bar = this.renderRoot.querySelector<MhSnackbar>('mh-snackbar');
    if (bar?.open && bar.message?.action) return;
    this.hintedAt = Date.now();
    this.notify({ text: this.ctx.t('notify.holdSlider'), icon: 'touch_app' });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.framed ??= this.inFrame ?? isFramed(window);
    if (this.framed) { this.showFramed(); return; }
    if (!this.started) {
      this.addEventListener('hold-hint', () => this.hintHold());
      this.addEventListener('confirm-danger', (event) => this.askDanger((event as CustomEvent<DangerDetail>).detail));
      this.started = true;
      this.setup();
      void this.controller.start();
    }
    if (this.narrow) {
      const { narrow } = this;
      const follow = (): void => { this.phone = narrow.matches; };
      follow();
      this.stopNarrow = watchPhone(narrow, follow);
    }
    this.stopWatching = this.env.watchStored?.(() => { void this.controller.reloadStored(); }) ?? null;
    this.wall.start();
    if (this.restedBefore()) this.wall.restNow();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.framed) return;
    if (this.draftTimer !== null) clearTimeout(this.draftTimer);
    this.draftTimer = null;
    if (this.arriveTimer !== null) clearTimeout(this.arriveTimer);
    this.arriveTimer = null;
    this.arriving = false;
    this.wall.stop();
    this.stopWatching?.();
    this.stopWatching = null;
    this.stopNarrow?.();
    this.stopNarrow = null;
  }

  /**
   * Another language: a new context, so every part draws its texts again, and the page's lang for screen readers.
   * The store, the actions and the connection stay as they are.
   */
  private followLanguage(active: Language): void {
    if (this.ctx.t.language === active) return;
    this.ctx = { ...this.ctx, t: createTranslate(active) };
    document.documentElement.lang = active;
  }

  /** The owner's choice, or the sizes of a phone in a narrow window. */
  private shownDensity(): ShownDensity {
    return this.phone ? 'phone' : this.state.theme.density;
  }

  protected override willUpdate(): void {
    // an adjustment that was not saved is shown only while the theme panel is open on a dashboard
    const phase = this.state?.phase;
    if (this.draftLook && (this.panel !== 'theme' || (phase !== 'dashboard' && phase !== 'demo'))) this.draftLook = null;
    // what may be at rest follows from everything that is shown
    if (!this.started) return;
    this.wall.changed();
    if (this.outdated) this.loadAnew();
  }

  // ----- the rest screen of a wall tablet -----

  /** A wall tablet is never reloaded by hand: it does that itself, by day, when nobody is there and everything is on the hub. */
  private loadAnew(): void {
    const { wall } = this;
    const served = this.env.served;
    if (!served || wall.shown !== 'rest' || wall.look !== 'day' || wall.leaving || this.controller.status().route === null || !served.settled()) return;
    this.outdated = false;
    try {
      window.sessionStorage.setItem(REST_KEY, '1');
    } catch {
      // then it begins with the dashboard
    }
    served.reload();
  }

  /** The page was loaded anew while nobody was there. */
  private restedBefore(): boolean {
    try {
      const rested = window.sessionStorage.getItem(REST_KEY) !== null;
      window.sessionStorage.removeItem(REST_KEY);
      return rested;
    } catch {
      return false;
    }
  }

  /** When the try-out of a theme last changed: the rest screen waits for it, but not for ever. */
  private draftSince = 0;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;

  /** A theme tried out on the dashboard, or none any more; the rest screen is asked again when its wait is over. */
  private preview(file: ThemeFile | null): void {
    if (this.draftTimer !== null) clearTimeout(this.draftTimer);
    this.draftTimer = null;
    // every change of the try-out: ten minutes again
    if (file !== null) {
      this.draftSince = Date.now();
      this.draftTimer = setTimeout(() => { this.draftTimer = null; this.wall.changed(); }, TRY_OUT_REST_MS);
    }
    this.draftLook = file;
  }

  /** Not while something is arranged or asked, and not without a dashboard or in a narrow window. */
  private mayRest(): boolean {
    const { state } = this;
    const trying = this.draftLook !== null && Date.now() - this.draftSince < TRY_OUT_REST_MS;
    return state.phase !== 'connect' && this.onboarding === null && !this.phone && !state.editing && !this.asking && !trying && this.sectionDialog === null && this.boardDialog === null
      && !this.renderRoot.querySelector<MhSettingsPanel>('mh-settings-panel')?.confirming;
  }

  /** Nobody is there: the dashboard this device starts with, from its beginning, without a panel. */
  private beginRest(): void {
    this.dashboardScreen?.closeMenus();
    const active = this.focused();
    this.panelBefore = this.panel !== 'none' || this.editPanel !== null || this.state.openDeviceId !== null;
    this.focusBefore = this.panelBefore ? null : active;
    if (this.state.openDeviceId !== null) this.controller.closeDevice();
    this.panel = 'none';
    this.editPanel = null;
    this.controller.openStart();
    window.scrollTo(0, 0);
    this.requestUpdate();
    void this.updateComplete.then(() => this.renderRoot.querySelector<MhRestScreen>('mh-rest-screen')?.focus({ preventScroll: true }));
  }

  /** Somebody is there again: the focus goes back to where it was, or to the dashboard when that went. */
  private async endRest(kind: 'rest' | 'preview'): Promise<void> {
    const before = this.focusBefore;
    this.focusBefore = null;
    this.requestUpdate();
    if (kind === 'preview') {
      // back to the panel that asked for a look
      if (this.state.phase !== 'connect' && !this.phone) this.panel = 'wall';
      return;
    }
    await this.updateComplete;
    if (before?.isConnected) before.focus({ preventScroll: true });
    if (this.panelBefore || (before && this.focused() !== before)) this.dashboardScreen?.focusContent();
  }

  /** What has the focus, through every shadow root; null when nothing has. */
  private focused(): HTMLElement | null {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active instanceof HTMLElement && active !== document.body ? active : null;
  }

  private renderRest() {
    const { state, wall } = this;
    if (wall.shown === 'none') return nothing;
    const block = state.board ? [...state.board.left, ...state.board.right].find((b) => b.type === 'hero') : undefined;
    const hero = block?.type === 'hero' ? block : undefined;
    const large = this.automaticHero();
    const connecting = state.phase === 'connecting' && !state.startUnreachable;
    return html`<mh-rest-screen exportparts=${REST_PARTS} .ctx=${this.ctx} .hero=${hero?.hero ?? null} .heroSeed=${hero ? state.sectionSeeds[hero.id] ?? null : null} mode=${this.shownMode()} .look=${this.shownStyle()}
      .battery=${large?.kind === 'battery' ? large.primary : null} .wall=${state.wall} .hub=${wallHubOf(state.wall, state.hubId)} .now=${wall.now} .night=${wall.look === 'night'}
      .away=${this.controller.status().route === null && !connecting} ?leaving=${wall.leaving}></mh-rest-screen>`;
  }

  private setWall(change: { wall?: WallSettings; hub?: WallHub }): void {
    const { wall, hubId } = this.state;
    if (change.wall) this.controller.setWall(change.wall);
    if (change.hub && hubId !== null) this.controller.setWall(withWallHub(wall, hubId, change.hub));
  }

  private renderWallPanel() {
    const { state } = this;
    const open = this.panel === 'wall';
    const { t } = this.ctx;
    const devices = open ? this.store.getDevices() : [];
    return html`<mh-wall-panel .t=${t} ?hidden=${this.phone} ?open=${open} .wall=${state.wall} .hub=${wallHubOf(state.wall, state.hubId)} .sources=${temperatureSources(devices, this.store.getSnapshot()?.zones ?? {}, t)}
      .canPreview=${!state.editing} .tanks=${tanksOf(devices, t).map((tank) => ({ id: tank.id, name: tank.name.trim() || t('tile.unnamed') }))} ?hasBattery=${this.automaticHero()?.kind === 'battery'} ?served=${this.controller.status().served ?? false} ?fully=${this.fully !== null}
      @change=${(e: CustomEvent<{ wall?: WallSettings; hub?: WallHub }>) => this.setWall(e.detail)} @preview=${(e: CustomEvent<{ look: 'day' | 'night' }>) => this.wall.preview(e.detail.look)}
      @close=${() => { this.panel = 'none'; }}></mh-wall-panel>`;
  }

  /** Whether the dashboard is dark because it is night. */
  private get nightNow(): boolean {
    return this.wall.night && !this.phone;
  }

  private shownMode(): Mode {
    return this.nightNow ? 'dark' : resolveMode(withSun(this.chosenLook().mode, this.sunDarkNow), this.media?.matches ?? false);
  }

  /** Light and dark with the sun: the weather of the hub is heard while this device, the house or this dashboard chose it. */
  private followSun(): void {
    const wanted = followsSun({ shown: this.chosenLook().mode, resting: this.controller.chosenLook(null).mode, house: this.state.look.house?.mode ?? null });
    if (wanted && !this.sunHeard) {
      // taken before listening: what is known already comes at once and applies the theme anew
      this.sunHeard = () => {};
      this.sunHeard = this.weatherSource.listen((state) => this.seeSun(state));
    } else if (!wanted && this.sunHeard) {
      this.sunHeard();
      this.sunHeard = null;
    }
  }

  private seeSun(state: ReadState<Weather>): void {
    const now = Date.now();
    const dark = sunDark(state, now);
    if (dark !== null) keepSun(dark, now);
    const next = dark ?? keptSun(now);
    if (next === this.sunDarkNow) return;
    this.sunDarkNow = next;
    this.applyTheme();
    this.requestUpdate();
  }

  /** The look of the dashboard that is open; the rooms and the rest screen follow this device and the house. */
  private chosenLook(): ChosenLook {
    const board = this.state.boardId;
    const resting = (this.wall?.shown ?? 'none') !== 'none';
    return this.controller.chosenLook(resting || board === ROOMS_ID || roomOfBoard(board) !== null ? null : board);
  }

  /** The base colour the page shows. */
  private shownSeed(): string {
    return this.chosenLook().seed ?? rustigExpressive.color.defaultSeed;
  }

  /** One style per theme, the same object as long as the theme is the same, so nothing is drawn again for nothing. */
  private styles = new Map<string, Style>();
  private styleFor(file: ThemeFile): Style {
    const key = JSON.stringify(file);
    let style = this.styles.get(key);
    if (!style) {
      style = styleOf(file);
      this.styles.set(key, style);
    }
    return style;
  }

  /**
   * The theme goes onto the document when it changed, when the system turned light or dark, or when the night came or
   * went; only while this app is on the page: one that was taken off it leaves the page to the one that is there.
   */
  private applyTheme(): void {
    if (!this.state || !this.isConnected) return;
    this.followSun();
    const dark = this.media?.matches ?? false;
    const chosen = this.chosenLook();
    const theme: ThemeSettings = { ...this.state.theme, seed: this.shownSeed(), mode: withSun(chosen.mode, this.sunDarkNow) };
    const density = this.shownDensity();
    const night = this.nightNow;
    const style = this.shownStyle();
    const { appliedTheme } = this;
    this.applyOwnCss();
    if (appliedTheme && appliedTheme.theme.seed === theme.seed && appliedTheme.theme.mode === theme.mode && appliedTheme.dark === dark && appliedTheme.density === density && appliedTheme.night === night && appliedTheme.style === style) return;
    this.appliedTheme = { theme, dark, density, night, style };
    applyThemeTo(document.documentElement, { ...theme, density, ...(night ? { mode: 'dark' } : {}) }, dark, style);
  }

  /** The two sheets of own CSS on the document; made when the app first shows a theme. */
  private putOwnCss: ((css: OwnCss) => void) | null = null;
  /** The dashboard has own CSS now. */
  private ownCssOn = false;
  /** Where the CSS of the theme that is tried out comes from: the house once its CSS was written here. */
  private draftCssFrom: CssFrom = 'house';

  /** Own CSS of the theme the dashboard shows and of the one the rest screen follows; none with `#veilig` or Helder. */
  private applyOwnCss(): void {
    if (!this.state || !this.isConnected) return;
    this.putOwnCss ??= ownCssSheets(document);
    const look = this.state.look;
    const chosen = this.chosenLook();
    const shown = this.draftLook ?? chosen.file;
    const resting = this.controller.chosenLook(null).file;
    const cssFrom = this.draftLook ? { ...look.cssFrom, [this.draftLook.id]: this.draftCssFrom } : look.cssFrom;
    const storage = safeStorage(() => window.localStorage);
    const css = ownCss({ shown, resting, cssFrom, role: look.role, off: this.safe || look.device.helder, allowed: (id, text) => allowedCss(storage, id, text) });
    this.ownCssOn = css.dashboard !== '';
    this.putOwnCss(css);
  }

  /** The style the page shows; with `#veilig` after the address always Rustig. */
  private shownStyle(): Style {
    if (this.safe) return RUSTIG_STYLE;
    return this.styleFor(this.draftLook ?? this.chosenLook().file);
  }

  /** A choice in the theme panel, for this device or the whole house; a theme that is hard to read is asked about first for the house. */
  private onLookChoose({ target, theme, seed, mode }: LookChoose): void {
    const { look } = this.state;
    const { device } = look;
    const house = look.house;
    if (target === 'house') {
      const change = { ...(theme === undefined ? {} : { theme }), ...(seed === undefined ? {} : { seed }), ...(mode === undefined ? {} : { mode }) };
      const file = theme === undefined ? undefined : look.themes.find((item) => item.id === theme);
      const poor = file ? poorPlaces(file, shownSeed(file, seed ?? house?.seed ?? null) ?? rustigExpressive.color.defaultSeed) : 0;
      if (poor > 0) this.askPoorHouse(poor, this.ctx.t('theme.useAnyway'), () => this.controller.setHouse(change));
      else this.controller.setHouse(change);
      return;
    }
    // a style of its own takes the colour along that it had from the house, and the other way round
    const fromHouse = look.role !== 'own' && device.followStyle && house !== null;
    if (theme !== undefined || seed !== undefined) {
      this.controller.setDeviceLook({ followStyle: false, theme: theme ?? (fromHouse ? house.theme : device.theme), seed: seed ?? (fromHouse ? house.seed : device.seed) });
    }
    if (mode !== undefined) this.controller.setDeviceLook({ followMode: false, mode });
  }

  /** "Voor wie": the whole house, or this device with what the house has now. */
  private onLookTarget(target: LookTarget): void {
    const house = this.state.look.house;
    if (target === 'house') { this.controller.followHouse(); return; }
    if (house) this.controller.setDeviceLook({ followStyle: false, followMode: false, theme: house.theme, seed: house.seed, mode: house.mode });
  }

  /** A theme made or taken in: kept, and used; for the whole house only after a question when it is hard to read. */
  private onLookSave(file: ThemeFile, poor: number, cssFrom?: CssFrom, takenIn = false): void {
    const { look } = this.state;
    if (!this.controller.saveTheme(file, cssFrom, takenIn)) return;
    const target = lookTarget(look.role, look.device);
    if (target === 'house') {
      const use = (): void => { this.controller.setHouse({ theme: file.id }); };
      if (poor > 0) this.askPoorHouse(poor, this.ctx.t('import.save'), use);
      else use();
      return;
    }
    this.onLookChoose({ target, theme: file.id });
  }

  /** Whether the whole house gets a theme that is hard to read in some places. */
  private askPoorHouse(poor: number, ok: string, run: () => void): void {
    const { t } = this.ctx;
    this.ask({ heading: t('theme.forWho.house'), text: t('import.poorHouse', { count: poor }), ok, run });
  }

  /** The danger question, the pairing screen and the theme panel always in Rustig, in the page's colour and light or dark. */
  private keepSafe(): void {
    if (!this.state) return;
    const settings = { ...this.state.theme, seed: this.shownSeed(), mode: this.shownMode(), density: this.shownDensity() };
    const key = `${settings.seed} ${settings.mode} ${settings.density}`;
    for (const element of this.renderRoot.querySelectorAll<HTMLElement>('mh-dialog.confirm, mh-pair-screen, mh-theme-panel')) {
      if (this.safeApplied.get(element) === key) continue;
      safeLook(element, settings, false);
      this.safeApplied.set(element, key);
    }
  }

  static override styles = [sharedStyles, css`
    :host { display: block; }
    /* the steps in the windows of the card "Verder inrichten", numbered in a cookie as on the pair screen */
    .next-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-14); counter-reset: step; color: var(--c-on-surface); }
    .next-steps > li { display: grid; grid-template-columns: var(--connect-step-size) minmax(0, 1fr); gap: var(--space-12); align-items: start; }
    .next-steps > li > div { padding-top: var(--space-6); overflow-wrap: break-word; }
    .next-steps > li::before {
      counter-increment: step; content: counter(step); width: var(--connect-step-size); height: var(--connect-step-size); display: grid; place-items: center;
      background: var(--c-primary); color: var(--c-on-primary); clip-path: var(--shape-cookie); font-weight: var(--weight-strong);
    }
    .next-steps b { font-weight: var(--weight-strong); }
    @media (prefers-reduced-motion: reduce) { .next-steps > li::before { clip-path: var(--shape-circle); } }
  `];

  /** The screen shown last: when it changes, the focus moves into the new screen so it never gets lost. */
  private shownScreen: 'connect' | 'onboarding' | 'dashboard' | null = null;
  /** The dashboard shown last: another one begins at the top of the page, as a page does. */
  private shownBoard: string | null = null;

  /** With Fully Kiosk: hears of the devices that can raise an alarm, which lights the screen at night. */
  private hearScreen(): void {
    for (const stop of this.screenHeard) stop();
    this.screenHeard = [];
    if (!this.fully) return;
    const { store } = this;
    const watched = store.getDevices().filter((device) => Object.values(device.capabilities).some((cap) => alarmKind(cap.baseId) === 'danger')).map((device) => device.id);
    this.screenHeard = [
      store.subscribeStructure(() => { this.hearScreen(); this.applyScreen(); }),
      ...watched.map((id) => store.subscribeDevice(id, () => this.applyScreen())),
    ];
  }

  /** The light of the screen as the rest screen, the night and an alarm at night want it. */
  private applyScreen(): void {
    if (!this.fully || !this.state) return;
    const { leaving } = this.wall;
    // the brightness comes back as soon as it begins to go
    const shown = leaving ? 'none' : this.wall.shown;
    // arranging, or a window as narrow as a phone, has no rest screen and is not dimmed at night either
    const look = shown === 'none' && (this.phone || this.state.editing) ? 'day' : this.wall.look;
    const danger = look === 'night' && this.store.getDevices().some((device) => dangerAlarms(device).some((alarm) => alarm.baseId !== BATTERY.alarm));
    this.screen.apply(screenWanted(shown, look, this.state.wall.screen, danger));
  }

  protected override updated(): void {
    this.applyScreen();
    // at rest, as on a wall tablet, a page paired from outside looks at the hub less often
    if (this.started) this.env.synced?.link.rest(this.wall.shown !== 'none');
    // a question of a widget that went without a yes
    if (this.widgetQuestion && (!this.asking || this.question !== this.widgetQuestion.question)) this.endWidgetQuestion(false);
    if (!this.state) return;
    this.keepSafe();
    const screen = this.state.phase === 'connect' ? 'connect' : this.onboarding ? 'onboarding' : 'dashboard';
    const board = screen === 'dashboard' ? this.state.boardId : null;
    if (board !== this.shownBoard) window.scrollTo(0, 0);
    this.shownBoard = board;
    const previous = this.shownScreen;
    this.shownScreen = screen;
    if (previous === null || previous === screen) return;
    const target = this.renderRoot.querySelector<HTMLElement & { updateComplete?: Promise<unknown>; focusContent?: () => void }>(screen === 'connect' ? 'mh-connect-screen, mh-pair-screen' : screen === 'onboarding' ? 'mh-onboarding' : 'mh-dashboard');
    void (target?.updateComplete ?? Promise.resolve()).then(() => {
      if (screen === 'dashboard') target?.focusContent?.();
      else target?.focus({ preventScroll: true });
    });
  }

  /** What the change makes meaningless goes for good: a panel or dialog without its subject, a notice whose step is not the next to undo. */
  private closeStale(): void {
    const { editPanel, state } = this;
    const blocks = state.board ? [...state.board.left, ...state.board.right] : [];
    const stale = editPanel === null ? false
      : editPanel.kind === 'news' ? state.editing || state.news.length === 0
        : !state.editing || (editPanel.kind === 'add' ? !this.sectionOf(editPanel.sectionId)
          : editPanel.kind === 'tile' ? this.findTile(editPanel.tileId) === null
            : !blocks.some((b) => b.type === 'hero' && b.id === editPanel.sectionId));
    if (stale) this.editPanel = null;
    const renamed = this.sectionDialog?.sectionId ?? null;
    if (this.sectionDialog && (!state.editing || (renamed !== null && !this.sectionOf(renamed)))) this.sectionDialog = null;
    if (!state.editing) this.boardDialog = null;
    const notice = this.undoNotice;
    if (!notice || notice.step === state.undoId) return;
    this.undoNotice = null;
    const bar = this.renderRoot.querySelector<MhSnackbar>('mh-snackbar');
    if (bar?.message === notice.message) bar.hide();
  }

  /** The rail and the header labels open a panel; a dashboard closes it. One floating panel at a time. */
  private navigate(to: RailTarget): void {
    if (to === 'theme' || to === 'settings') {
      this.controller.closeDevice();
      this.editPanel = null;
      this.panel = to;
      return;
    }
    this.panel = 'none';
    this.controller.openBoard(to.slice('board:'.length));
  }

  /** The name of a dashboard: the owner's own, otherwise "Overzicht" in the language of the app. */
  private boardName(board: DashboardLayout): string {
    return board.name ?? this.ctx.t(board.id === OVERVIEW_ID ? 'nav.overview' : 'board.defaultName');
  }

  /** The icon of a dashboard: the owner's own when the app has it. */
  private boardIcon(board: DashboardLayout): IconName {
    return board.icon !== null && isLibraryIcon(board.icon) ? board.icon : 'dashboard';
  }

  private openDashboard(): DashboardLayout | undefined {
    return this.state.layout.dashboards.find((d) => d.id === this.state.boardId);
  }

  /** A tile of the open dashboard as it is drawn, and its section. */
  private findTile(tileId: string): { spec: TileSpec; section: Section } | null {
    const blocks = this.state.board ? [...this.state.board.left, ...this.state.board.right] : [];
    for (const block of blocks) {
      const spec = block.type === 'section' ? block.section.tiles.find((tile) => tile.id === tileId) : undefined;
      if (spec && block.type === 'section') return { spec, section: block.section };
    }
    return null;
  }

  /** A tile as it is stored; on an automatic dashboard as freezing would store it. */
  private storedTile(tileId: string, spec: TileSpec): TileLayout {
    const board = this.state.layout.dashboards.find((d) => d.id === this.state.boardId);
    return board?.sections?.flatMap((section) => section.tiles).find((tile) => tile.id === tileId)
      ?? { id: tileId, spec, size: spec.size, label: null, icon: null, source: 'device' };
  }

  /** The name on a tile of the open dashboard. */
  private tileName(tileId: string): string {
    const spec = this.findTile(tileId)?.spec;
    if (!spec) return '';
    if (spec.kind === 'flow') return flowView(spec, this.store.getSnapshot()?.flows.find((f) => f.id === spec.flowId), this.ctx.t).name;
    if (spec.kind === 'widget') return widgetName(spec, this.ctx.t);
    return tileView(spec, this.store.getDevice(spec.deviceId), this.ctx.t).name;
  }

  private notify(message: SnackbarMessage): void {
    this.renderRoot.querySelector<MhSnackbar>('mh-snackbar')?.show(message);
  }

  /** A short notice with "Ongedaan maken". */
  private notifyUndo(text: string, icon: IconName): void {
    const step = this.state.undoId;
    const message: SnackbarMessage = { text, icon, action: { label: this.ctx.t('edit.undo'), run: () => { if (this.state.undoId === step) this.undo(); } } };
    this.undoNotice = { step, message };
    this.notify(message);
  }

  private get dashboardScreen(): MhDashboard | null {
    return this.renderRoot.querySelector('mh-dashboard');
  }

  private undo(): void {
    this.controller.undo();
    this.dashboardScreen?.announce(this.ctx.t('edit.undone'));
    this.keepFocus();
  }

  /** Puts the focus somewhere on the dashboard once the panels and dialogs that close have given it back. */
  private async focusThen(act: (screen: MhDashboard) => Promise<void>): Promise<void> {
    await this.updateComplete;
    await new Promise((done) => { this.env.setTimeout(() => done(null), 0); });
    const screen = this.dashboardScreen;
    if (screen) await act(screen);
  }

  /** When what had the focus was taken away, it goes to the start of the content instead of to nowhere. */
  private keepFocus(): void {
    void this.focusThen(async (screen) => {
      await screen.updateComplete;
      if (document.activeElement === null || document.activeElement === document.body) screen.focusContent();
    });
  }

  private notifyFull(): void {
    this.notify({ text: this.ctx.t('edit.full'), icon: 'info' });
  }

  private onEdit(edit: LayoutEdit): void {
    if (edit.type !== 'remove-tile') {
      this.controller.edit(edit);
      return;
    }
    const name = this.tileName(edit.tileId);
    const section = this.findTile(edit.tileId)?.section;
    const index = section?.tiles.findIndex((tile) => tile.id === edit.tileId) ?? 0;
    this.controller.edit(edit);
    this.notifyUndo(this.ctx.t('edit.tile.removed', { name }), 'delete');
    if (section) void this.focusThen((screen) => screen.focusTileAt(section.id, index));
  }

  /** A section of the open dashboard. */
  private sectionOf(sectionId: string): Section | undefined {
    const blocks = this.state.board ? [...this.state.board.left, ...this.state.board.right] : [];
    return blocks.flatMap((b) => (b.type === 'section' ? [b.section] : [])).find((section) => section.id === sectionId);
  }

  /** Where a section or hero of the open dashboard stands. */
  private placeOfBlock(id: string): { column: Column; index: number } | null {
    for (const column of ['left', 'right'] as const) {
      const index = this.state.board?.[column].findIndex((b) => (b.type === 'hero' ? b.id : b.section.id) === id) ?? -1;
      if (index !== -1) return { column, index };
    }
    return null;
  }

  /** One floating panel at a time. */
  private openEditPanel(panel: EditPanel): void {
    this.controller.closeDevice();
    this.panel = 'none';
    this.openings += 1;
    this.editPanel = panel;
  }

  private ask(question: Question): void {
    this.question = question;
    this.asking = true;
  }

  /** A short tap on something dangerous. */
  private askDanger({ deviceId, capabilityId, value }: DangerDetail): void {
    const device = this.store.getDevice(deviceId);
    if (!device || !isGuarded(device, capabilityId)) return;
    const question: Question = { ...dangerQuestion(device, capabilityId, value, this.ctx.t), dangerAt: Date.now(), run: () => this.ctx.actions.guard(deviceId, capabilityId, value) };
    this.ask(question);
    this.env.setTimeout(() => { if (this.question === question) this.asking = false; }, ASK_MS);
  }

  /** An own widget into the house, from the code or file somebody gave. */
  private async installWidget(widget: WidgetFile): Promise<void> {
    const { t } = this.ctx;
    const done = await this.widgetLibrary?.change([{ add: widget }]) ?? 'refused';
    const name = widgetText(widget.name, t.language);
    // a full list takes nothing in, and says so
    if (done === 'ok' && !this.widgetLibrary?.list().some((kept) => kept.id === widget.id)) { this.notify({ text: t('ownWidgets.full'), icon: 'error' }); return; }
    this.notify(done === 'ok' ? { text: t('ownWidgets.installed', { name }), icon: 'check_circle' }
      : { text: t(done === 'refused' ? 'ownWidgets.refused' : 'ownWidgets.unreachable'), icon: 'error' });
  }

  /** An own widget out of the house, after a question that says where it is placed. */
  private askRemoveWidget(widget: WidgetFile): void {
    const { t } = this.ctx;
    // paired from outside: own widgets are only changed at home
    if (this.env.synced) { this.notify({ text: t('ownWidgets.atHome'), icon: 'home' }); return; }
    const name = widgetText(widget.name, t.language);
    const ref = `own:${widget.id}`;
    const places = this.state.layout.dashboards.flatMap((d) => d.sections ?? []).flatMap((s) => s.tiles).filter((tile) => tile.spec.kind === 'widget' && tile.spec.widget === ref).length;
    this.ask({
      heading: t('ownWidgets.removeTitle', { name }), text: t('ownWidgets.removeText', { n: places }), ok: t('ownWidgets.remove'),
      run: () => {
        void this.widgetLibrary?.change([{ remove: widget.id }]).then((done) => {
          this.notify(done === 'ok' ? { text: t('ownWidgets.removed', { name }), icon: 'delete' } : { text: t(done === 'refused' ? 'ownWidgets.refused' : 'ownWidgets.unreachable'), icon: 'error' });
        });
      },
    });
  }

  /** A question a widget brought up, and how it ends: yes, or anything else. */
  private widgetQuestion: { question: Question; done(yes: boolean): void } | null = null;

  /** Something dangerous a widget wants: the same question as a tap on a tile, which says which widget asks. */
  private askForWidget(deviceId: string, capabilityId: string, value: CapabilityValue, widgetName: string): Promise<boolean> {
    const device = this.store.getDevice(deviceId);
    if (!device || !isGuarded(device, capabilityId) || this.asking) return Promise.resolve(false);
    return new Promise((done) => {
      const asked = dangerQuestion(device, capabilityId, value, this.ctx.t);
      const question: Question = { ...asked, text: this.ctx.t('widget.asks', { name: widgetName, text: asked.text }), dangerAt: Date.now(), run: () => { this.endWidgetQuestion(true); } };
      this.widgetQuestion = { question, done };
      this.ask(question);
      this.env.setTimeout(() => { if (this.question === question) this.asking = false; }, ASK_MS);
    });
  }

  private endWidgetQuestion(yes: boolean): void {
    const pending = this.widgetQuestion;
    this.widgetQuestion = null;
    pending?.done(yes);
  }

  private renderQuestion() {
    // the second tap of a double one neither answers it nor waves it away; below zero: the clock was set back
    const justAsked = (): boolean => {
      const { dangerAt } = this.question;
      const age = dangerAt === undefined ? SURE_MS : Date.now() - dangerAt;
      return age >= 0 && age < SURE_MS;
    };
    const close = () => { if (!justAsked()) this.asking = false; };
    const answer = () => {
      if (justAsked()) return;
      this.asking = false;
      this.question.run();
    };
    return html`<mh-dialog class="confirm" ?open=${this.asking} heading=${this.question.heading} @cancel=${(e: CustomEvent<{ by?: string } | null>) => { if (e.detail?.by === 'key') this.asking = false; else close(); }}>${this.question.text}
      <mh-button slot="actions" variant="text" data-autofocus @click=${close}>${this.ctx.t('section.dialog.cancel')}</mh-button>
      <mh-button slot="actions" @click=${answer}>${this.question.ok || this.ctx.t('section.remove.confirm')}</mh-button>
    </mh-dialog>`;
  }

  /** A section or the hero of the open dashboard goes; one with tiles in it is asked about first (5.3). */
  private onRemoveSection(sectionId: string): void {
    const { t } = this.ctx;
    const section = this.sectionOf(sectionId);
    const name = section ? sectionTitle(section, t) : t('hero.title');
    // the tiles that are stored, also those of a device that is away for a moment (6.2)
    const count = this.openDashboard()?.sections?.find((other) => other.id === sectionId)?.tiles.length ?? section?.tiles.length ?? 0;
    const remove = (): void => {
      this.editPanel = null;
      const place = this.placeOfBlock(sectionId);
      this.controller.edit({ type: 'remove-section', dashboardId: this.state.boardId, sectionId });
      this.notifyUndo(t('section.removed', { name }), 'delete');
      if (place) void this.focusThen((screen) => screen.focusSectionAt(place.column, place.index));
    };
    if (count === 0) remove();
    else this.ask({ heading: t('section.remove.title', { name }), text: count === 1 ? t('section.remove.textOne') : t('section.remove.textMany', { count }), ok: t('section.remove.confirm'), run: remove });
  }

  /** Adds a section at the end of its column, or gives one its name and icon. */
  private onSectionDialog(detail: { kind: 'own' | 'hero'; name: string | null; icon: string | null }): void {
    const dialog = this.sectionDialog;
    this.sectionDialog = null;
    if (!dialog) return;
    const dashboardId = this.state.boardId;
    const { name, icon } = detail;
    if (dialog.sectionId !== null) {
      this.controller.edit({ type: 'set-section', dashboardId, sectionId: dialog.sectionId, name, icon });
      return;
    }
    const section: SectionLayout = detail.kind === 'hero'
      ? { id: heroSectionId(dashboardId), kind: 'hero', column: dialog.column, name: null, icon: null, tiles: [], hero: null }
      : { id: `own:${this.controller.newId('s')}`, kind: 'own', column: dialog.column, name, icon, tiles: [], hero: null };
    const before = this.state.layout;
    const group = dialog.placeRef === undefined ? undefined : `place:${dialog.placeRef}`;
    this.controller.edit({ type: 'add-section', dashboardId, section, index: Infinity }, group);
    if (this.state.layout === before) { this.notifyFull(); return; }
    void this.focusThen((screen) => screen.focusSection(section.id));
    if (dialog.placeRef !== undefined && detail.kind === 'own') this.controller.placeNew(dialog.placeRef, section.id, group);
  }

  /** The dialog was left without adding; when it was opened from a notice the edit mode ends with it. */
  private cancelSectionDialog(): void {
    const fromNotice = this.sectionDialog?.placeRef !== undefined;
    this.sectionDialog = null;
    if (fromNotice) this.controller.setEditing(false);
  }

  private renderSectionDialog() {
    const { t } = this.ctx;
    const dialog = this.sectionDialog;
    const section = dialog?.sectionId ? this.sectionOf(dialog.sectionId) : undefined;
    const ofApp = section !== undefined && section.kind !== 'own';
    const hero = this.state.board ? [...this.state.board.left, ...this.state.board.right].some((b) => b.type === 'hero') : false;
    return html`<mh-name-icon-dialog .t=${t} ?hidden=${this.phone} ?open=${dialog !== null && (dialog.sectionId === null || section !== undefined)} heading=${t(section ? 'section.dialog.edit' : 'section.dialog.add')}
      confirmLabel=${t(section ? 'section.dialog.confirmSave' : 'section.dialog.confirmAdd')} .name=${section?.name ?? ''}
      namePlaceholder=${ofApp ? sectionTitle({ ...section, name: null }, t) : t('section.dialog.namePlaceholder')}
      .icon=${ofApp ? section.icon ?? null : section ? shownSectionIcon(section) : sectionIcon('own')} .autoIcon=${ofApp ? sectionIcon(section.kind) : null}
      kindChoice=${section || dialog?.placeRef !== undefined ? 'none' : 'section'} ?heroTaken=${hero}
      @confirm=${(e: CustomEvent<{ kind: 'own' | 'hero'; name: string | null; icon: string | null }>) => this.onSectionDialog(e.detail)}
      @cancel=${() => this.cancelSectionDialog()}></mh-name-icon-dialog>`;
  }

  /** A hero on the open dashboard, from its empty state. */
  private addHero(): void {
    this.sectionDialog = { sectionId: null, column: 'left' };
    this.onSectionDialog({ kind: 'hero', name: null, icon: null });
  }

  /** A new dashboard opens empty in the edit mode; the open one gets its name and icon. */
  private onBoardDialog({ name, icon }: { name: string | null; icon: string | null }): void {
    const dialog = this.boardDialog;
    this.boardDialog = null;
    if (dialog === 'edit') this.controller.edit({ type: 'set-dashboard', dashboardId: this.state.boardId, name, icon });
    if (dialog !== 'new') return;
    const id = this.controller.newId('d');
    this.editPanel = null;
    this.controller.edit({ type: 'add-dashboard', dashboard: { id, name, icon, sections: [] } });
    this.controller.openBoard(id);
    this.controller.setEditing(true);
  }

  private renderBoardDialog() {
    const { t } = this.ctx;
    const dialog = this.boardDialog;
    const board = dialog === 'edit' ? this.openDashboard() : undefined;
    const overview = board?.id === OVERVIEW_ID;
    return html`<mh-name-icon-dialog class="board" .t=${t} ?hidden=${this.phone} ?open=${dialog !== null} heading=${t(board ? 'board.edit.title' : 'board.new.title')} text=${board ? '' : t('board.new.text')}
      confirmLabel=${t(board ? 'section.dialog.confirmSave' : 'board.create')} .name=${board?.name ?? ''} namePlaceholder=${overview ? t('nav.overview') : t('board.namePlaceholder')}
      .icon=${overview ? board.icon : board ? this.boardIcon(board) : 'dashboard'} .autoIcon=${overview ? 'dashboard' : null} kindChoice="none"
      @confirm=${(e: CustomEvent<{ name: string | null; icon: string | null }>) => this.onBoardDialog(e.detail)} @cancel=${() => { this.boardDialog = null; }}></mh-name-icon-dialog>`;
  }

  private renderBoardLook() {
    const board = this.openDashboard();
    const { look } = this.state;
    // the colour of this device or the house: a theme with a colour of its own shows that one itself
    const seed = lookChoice(look.role, look.device, look.house).seed;
    return html`<mh-board-look-panel .t=${this.ctx.t} ?open=${this.boardLook && board !== undefined} name=${board ? this.boardName(board) : ''}
      .theme=${board ? look.boards[board.id] ?? null : null} .themes=${look.themes} role=${look.role} seed=${seed} mode=${this.shownMode()}
      @board-theme=${(e: CustomEvent<{ theme: string | null }>) => { if (board) this.controller.setBoardTheme(board.id, e.detail.theme); }}
      @close=${() => { this.boardLook = false; }}></mh-board-look-panel>`;
  }

  private boardMenu(board: DashboardLayout | undefined) {
    if (!board) return [];
    const { dashboards } = this.state.layout;
    const overview = board.id === OVERVIEW_ID ? { automatic: board.sections === null } : null;
    return boardMenuGroups(this.boardName(board), { index: dashboards.indexOf(board), count: dashboards.length }, overview, this.ctx.t);
  }

  private onBoardAction(action: BoardAction): void {
    const { dashboards } = this.state.layout;
    const dashboardId = this.state.boardId;
    const index = dashboards.findIndex((d) => d.id === dashboardId);
    switch (action) {
      case 'rename': this.boardDialog = 'edit'; return;
      case 'look': this.boardLook = true; return;
      case 'up': this.moveBoard(index - 1); return;
      case 'down': this.moveBoard(index + 1); return;
      case 'reset': this.askReset(); return;
      case 'remove': this.askRemoveBoard(); return;
    }
  }

  private moveBoard(index: number): void {
    this.controller.edit({ type: 'move-dashboard', dashboardId: this.state.boardId, index });
    const { dashboards } = this.state.layout;
    const board = this.openDashboard();
    if (board) this.dashboardScreen?.announce(this.ctx.t('board.moved', { name: this.boardName(board), index: dashboards.indexOf(board) + 1, count: dashboards.length }));
  }

  /** The open dashboard goes, after a question; then the first one opens. */
  private askRemoveBoard(): void {
    const { t } = this.ctx;
    const board = this.openDashboard();
    if (!board) return;
    const name = this.boardName(board);
    this.ask({
      heading: t('board.remove.title', { name }), text: t('board.remove.text'), ok: t('board.remove.confirm'),
      run: () => {
        this.editPanel = null;
        this.controller.edit({ type: 'remove-dashboard', dashboardId: board.id });
        this.notifyUndo(t('board.removed', { name }), 'delete');
      },
    });
  }

  /** New tiles at the end of a section: they light up, and a notice says where they are. */
  private onAddTiles(sectionId: string, tiles: TileLayout[], name: string): void {
    const section = this.sectionOf(sectionId);
    if (!section) return;
    const before = this.state.layout;
    this.controller.edit({ type: 'add-tiles', dashboardId: this.state.boardId, sectionId, tiles });
    if (this.state.layout === before) { this.notifyFull(); return; }
    this.showFresh(tiles.map((tile) => tile.id));
    // a widget that is no use before it is set up opens its settings at once
    const [first] = tiles;
    const appRow = first?.spec.kind === 'widget' ? this.appRows.get(first.spec.widget) : undefined;
    const settable = first?.spec.kind === 'widget' && (wantsSettings(first.spec.widget) || (appRow !== undefined && appSettings(appRow, this.ctx.t.language, '').length > 0));
    if (tiles.length === 1 && first && settable) this.openEditPanel({ kind: 'tile', tileId: first.id });
    this.notifyUndo(this.ctx.t('add.added', { name, section: sectionTitle(section, this.ctx.t) }), 'check_circle');
  }

  /** The layout as a file in the downloads: a Blob and a link that is clicked and taken away again. */
  private saveLayout(): void {
    const file = this.controller.exportLayout(new Date());
    if (!file) { this.notify({ text: this.ctx.t('settings.offline'), icon: 'cloud_off' }); return; }
    const { fileName, text } = file;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    // the browser needs the address until the download has begun
    this.env.setTimeout(() => URL.revokeObjectURL(url), FRESH_MS);
    this.notify({ text: this.ctx.t('settings.exported', { file: fileName }), icon: 'download' });
  }

  /** A chosen file replaces the dashboards, colours and theme, after a question; one that is no layout changes nothing. */
  private loadLayout(file: { name: string; text: string }): void {
    const { t } = this.ctx;
    const refuse = (): void => this.notify({ text: t('settings.importBad'), icon: 'error', tone: 'error' });
    if (!readLayoutFile(file.text)) { refuse(); return; }
    if (!this.store.getSnapshot()) { this.notify({ text: t('settings.offline'), icon: 'cloud_off' }); return; }
    this.ask({
      heading: t('settings.importConfirm.title'), text: t('settings.importConfirm.text', { file: file.name }), ok: t('settings.importConfirm.ok'),
      run: () => {
        const result = this.controller.importLayout(file.text);
        if (!result.ok) { refuse(); return; }
        this.panel = 'none';
        const text = result.dropped === 0 ? t('settings.imported') : result.dropped === 1 ? t('settings.importedDroppedOne') : t('settings.importedDropped', { count: result.dropped });
        this.notifyUndo(text, 'upload');
      },
    });
  }

  /** "Overzicht terug naar automatisch", from the settings or the menu of the Overzicht; asked about first. */
  private askReset(): void {
    const { t } = this.ctx;
    this.ask({
      heading: t('settings.resetConfirm.title'), text: t('settings.resetConfirm.text'), ok: t('settings.resetAction'),
      run: () => {
        this.controller.resetOverview();
        this.notifyUndo(t('settings.resetDone'), 'restart_alt');
      },
    });
  }

  /** Something new goes to a section, or (null) to the suggested one: it lights up, and a notice says where it is. */
  private onPlace(ref: string, target: string | null): void {
    const item = this.state.news.find((n) => n.ref === ref);
    if (!item) return;
    const { added } = this.placing(() => this.controller.placeNew(ref, target));
    this.keepFocus();
    if (added.length === 0) { this.notifyFull(); return; }
    const section = this.findTile(added[0]!)?.section;
    this.notifyUndo(this.ctx.t('news.placed', { name: item.name, section: section ? sectionTitle(section, this.ctx.t) : '' }), 'check_circle');
  }

  /** Everything new goes to its suggested place, in one step to undo. */
  private onPlaceAll(news: NewItem[]): void {
    this.editPanel = null;
    this.openings += 1;
    const group = `place-all:${this.openings}`;
    const { added } = this.placing(() => { for (const item of news) this.controller.placeNew(item.ref, null, group); });
    this.keepFocus();
    const left = news.some((item) => this.state.news.some((other) => other.ref === item.ref));
    if (left) this.notifyFull();
    else if (added.length > 0) this.notifyUndo(this.ctx.t('news.allPlaced'), 'check_circle');
  }

  /** The tiles that came onto the open dashboard by doing something; they light up. */
  private placing(act: () => void): { added: string[] } {
    const ids = (): string[] => (this.state.board ? [...this.state.board.left, ...this.state.board.right] : []).flatMap((b) => (b.type === 'section' ? b.section.tiles.map((tile) => tile.id) : []));
    const before = new Set(ids());
    act();
    const added = ids().filter((id) => !before.has(id));
    if (added.length > 0) this.showFresh(added);
    return { added };
  }

  private onSkip(ref: string): void {
    this.controller.dismissNew(ref);
    this.notifyUndo(this.ctx.t('news.skipped'), 'info');
    this.keepFocus();
  }

  /** A new section for something new: the edit mode with the dialog; confirming puts it in there. */
  private onNewSection(ref: string): void {
    const item = this.state.news.find((n) => n.ref === ref);
    if (!item) return;
    this.editPanel = null;
    this.controller.setEditing(true);
    this.sectionDialog = { sectionId: null, column: isLeftKind(item.suggest) ? 'left' : 'right', placeRef: ref };
  }

  private showFresh(ids: string[]): void {
    if (this.freshTimer !== null) this.env.clearTimeout(this.freshTimer);
    this.freshTiles = ids;
    this.freshTimer = this.env.setTimeout(() => { this.freshTiles = []; this.freshTimer = null; }, FRESH_MS);
  }

  private railBoards(): RailBoard[] {
    return this.state.layout.dashboards.map((board) => ({
      id: board.id, name: this.boardName(board), icon: this.boardIcon(board), badge: board.id === OVERVIEW_ID && this.state.news.length > 0 && this.controller.status().canArrange !== false,
    }));
  }

  /** The dashboards and, when there are rooms to speak of, the screen with those. */
  private places(): RailBoard[] {
    const { hasRooms, roomsShown } = this.state;
    return [...this.railBoards(), ...(hasRooms && roomsShown ? [{ id: ROOMS_ID, name: this.ctx.t('nav.rooms'), icon: 'meeting_room' as const, badge: false }] : [])];
  }

  /** The panels of the edit mode; one whose section or tile is gone is closed. */
  private renderEditPanels(boardName: string) {
    const s = this.state;
    const open = s.editing ? this.editPanel : null;
    const newsOpen = !s.editing && this.editPanel?.kind === 'news' && s.news.length > 0;
    const addTo = open?.kind === 'add' ? this.sectionOf(open.sectionId) : undefined;
    const tile = open?.kind === 'tile' ? this.findTile(open.tileId) : null;
    const hero = open?.kind === 'hero' && s.board ? [...s.board.left, ...s.board.right].find((b) => b.type === 'hero' && b.id === open.sectionId) : undefined;
    const heroId = hero?.type === 'hero' ? hero.id : null;
    const setTile = (patch: TilePatch, typing = false): void => {
      if (tile) this.controller.edit({ type: 'set-tile', dashboardId: s.boardId, tileId: tile.spec.id, patch }, typing ? `label:${tile.spec.id}:${this.openings}` : undefined);
    };
    return html`<mh-add-panel .ctx=${this.ctx} ?hidden=${this.phone} ?open=${addTo !== undefined} sectionName=${addTo ? sectionTitle(addTo, this.ctx.t) : ''} boardName=${boardName} .board=${s.board}
        .newId=${this.newTileId} @close=${() => { this.editPanel = null; }}
        @add-tiles=${(e: CustomEvent<{ tiles: TileLayout[]; name: string }>) => { if (addTo) this.onAddTiles(addTo.id, e.detail.tiles, e.detail.name); }}
        @install-widget=${(e: CustomEvent<{ widget: WidgetFile }>) => { void this.installWidget(e.detail.widget); }}
        @remove-widget=${(e: CustomEvent<{ widget: WidgetFile }>) => this.askRemoveWidget(e.detail.widget)}
        @told=${(e: CustomEvent<string>) => this.notify({ text: e.detail, icon: 'check_circle' })}></mh-add-panel>
      <mh-widget-panel .t=${this.ctx.t} ?hidden=${this.phone} ?open=${tile?.spec.kind === 'widget'} .tile=${tile?.spec.kind === 'widget' ? this.storedTile(tile.spec.id, tile.spec) : null}
        .settings=${tile?.spec.kind === 'widget' ? this.widgetSettings(tile.spec.widget) : []} .picks=${this.widgetPicks(tile?.spec.kind === 'widget' ? tile.spec.widget : null)}
        widgetTitle=${tile?.spec.kind === 'widget' ? widgetText(this.ownWidgetOf(tile.spec.widget)?.name ?? {}, this.ctx.t.language) : ''}
        .sizes=${tile?.spec.kind === 'widget' ? builtInWidget(tile.spec.widget)?.sizes ?? this.ownWidgetOf(tile.spec.widget)?.sizes ?? ['single', 'wide'] : []} sectionName=${tile ? sectionTitle(tile.section, this.ctx.t) : ''}
        @close=${() => { this.editPanel = null; }} @set-tile=${(e: CustomEvent<{ patch: TilePatch; typing?: boolean }>) => setTile(e.detail.patch, e.detail.typing)}
        @remove=${() => { this.editPanel = null; if (tile) this.onEdit({ type: 'remove-tile', dashboardId: s.boardId, tileId: tile.spec.id }); }}></mh-widget-panel>
      <mh-tile-panel .t=${this.ctx.t} ?hidden=${this.phone} ?open=${tile !== null && tile.spec.kind !== 'widget'} .tile=${tile ? this.storedTile(tile.spec.id, tile.spec) : null} sectionName=${tile ? sectionTitle(tile.section, this.ctx.t) : ''}
        .device=${tile && isDeviceTile(tile.spec) ? this.store.getDevice(tile.spec.deviceId) : undefined} @close=${() => { this.editPanel = null; }}
        @set-tile=${(e: CustomEvent<{ patch: TilePatch; typing?: boolean }>) => setTile(e.detail.patch, e.detail.typing)}
        @remove=${() => { this.editPanel = null; if (tile) this.onEdit({ type: 'remove-tile', dashboardId: s.boardId, tileId: tile.spec.id }); }}></mh-tile-panel>
      <mh-hero-panel .ctx=${this.ctx} ?hidden=${this.phone} ?open=${heroId !== null} .choice=${this.heroChoice(heroId)} .automatic=${heroId !== null ? this.automaticHero() : null} .board=${s.board} boardName=${boardName}
        @close=${() => { this.editPanel = null; }} @remove=${() => { if (heroId !== null) this.onRemoveSection(heroId); }}
        @set-hero=${(e: CustomEvent<{ hero: HeroChoice | null; typing?: boolean }>) => this.controller.edit({ type: 'set-hero', dashboardId: s.boardId, hero: e.detail.hero }, e.detail.typing ? `hero-name:${this.openings}` : undefined)}></mh-hero-panel>
      <mh-news-panel .ctx=${this.ctx} ?hidden=${this.phone} ?open=${newsOpen} .news=${s.news} .sections=${this.placeOptions()} .sectionName=${this.sectionNameOf}
        @close=${() => { this.editPanel = null; }} @place-all=${() => this.onPlaceAll(s.news)} @place=${(e: CustomEvent<{ ref: string; sectionId: string | null }>) => this.onPlace(e.detail.ref, e.detail.sectionId)}
        @skip=${(e: CustomEvent<{ ref: string }>) => this.onSkip(e.detail.ref)} @new-section=${(e: CustomEvent<{ ref: string }>) => this.onNewSection(e.detail.ref)}></mh-news-panel>`;
  }

  private ownWidgetOf(ref: string): WidgetFile | undefined {
    const id = ownWidgetId(ref);
    return id === null ? undefined : this.widgetLibrary?.list().find((widget) => widget.id === id);
  }

  /** What a widget lets the owner set: one of the app, or what an own widget's file describes. */
  private widgetSettings(ref: string): SettingDef[] {
    const row = this.appRows.get(ref);
    if (row) return appSettings(row, this.ctx.t.language, this.ctx.t('widget.setting.devices'));
    const own = this.ownWidgetOf(ref);
    return own ? ownSettings(own, this.ctx.t.language) : builtInSettings(ref, this.ctx.t);
  }

  /** What the settings of a widget can choose from: the dashboards, the devices and their values, the flows. */
  private widgetPicks(ref: string | null = null): WidgetPicks {
    const snapshot = this.store.getSnapshot();
    const byName = (a: PickOption, b: PickOption): number => a.title.localeCompare(b.title, this.ctx.t.locale);
    const devices = Object.values(snapshot?.devices ?? {}).map((device) => ({ id: device.id, title: device.name.trim() || this.ctx.t('tile.unnamed') })).sort(byName);
    const switchable = Object.values(snapshot?.devices ?? {})
      .filter((device) => Object.values(device.capabilities).some((cap) => cap.setable && (cap.baseId === 'onoff' || cap.baseId === 'dim')) && !Object.keys(device.capabilities).some((id) => isGuarded(device, id)))
      .map((device) => ({ id: device.id, title: device.name.trim() || this.ctx.t('tile.unnamed') })).sort(byName);
    return {
      boards: this.ctx.widgets?.boards().filter((board) => board.id !== this.state.boardId) ?? [],
      ...(ref !== null && this.env.served?.appWidgetSearch ? { search: (setting: string, query: string) => appWidgetSearch(this.env.served!.appWidgetSearch!, ref, setting, query) } : {}),
      devices,
      switchable,
      capabilities: (deviceId) => Object.values(this.store.getDevice(deviceId)?.capabilities ?? {}).map((cap) => ({ id: cap.id, title: cap.title })),
      flows: (snapshot?.flows ?? []).map((flow) => ({ id: flow.id, title: flow.name.trim() || this.ctx.t('flows.unnamed') })).sort(byName),
    };
  }

  /** The stored choice of the hero of the open dashboard; null is automatic. */
  private heroChoice(sectionId: string | null): HeroChoice | null {
    const board = this.state.layout.dashboards.find((d) => d.id === this.state.boardId);
    return board?.sections?.find((section) => section.id === sectionId)?.hero ?? null;
  }

  private automaticHero() {
    const snapshot = this.store.getSnapshot();
    return snapshot ? pickHero(snapshot, this.ctx.t.locale) : null;
  }

  /** The sections of the open dashboard, to put something new in. */
  private placeOptions() {
    const blocks = this.state.board ? [...this.state.board.left, ...this.state.board.right] : [];
    return blocks.flatMap((b) => (b.type === 'section' ? [{ id: b.section.id, title: sectionTitle(b.section, this.ctx.t), icon: shownSectionIcon(b.section) }] : []));
  }

  private readonly sectionNameOf = (kind: SectionKind): string => {
    const section = this.sectionOf(sectionId('type', kind));
    return section ? sectionTitle(section, this.ctx.t) : this.ctx.t(`section.${kind}`);
  };

  private readonly nameOfBoard = (id: string): string => {
    const board = this.state.layout.dashboards.find((d) => d.id === id);
    return board ? this.boardName(board) : '';
  };

  private readonly newTileId = (): string => this.controller.newId('t');

  private renderDashboard() {
    const s = this.state;
    const status = this.controller.status();
    const chosen = this.chosenLook();
    const connecting = s.phase === 'connecting';
    const phase = connecting ? (s.startUnreachable ? 'unreachable' : 'loading') : 'ready';
    const empty = s.missing.includes('readDevices') ? 'no-right'
      : s.dashboard && (s.dashboard.hero || s.dashboard.sections.length > 0) ? 'none' : 'no-devices';
    const open = this.openDashboard();
    const inRooms = s.boardId === ROOMS_ID || roomOfBoard(s.boardId) !== null;
    const snapshot = inRooms ? this.store.getSnapshot() : null;
    const rooms = snapshot ? roomsOf(snapshot, this.ctx.t) : [];
    const banner = !connecting && status.route === null ? 'offline' : s.restored ? 'restored' : this.outdated && !s.editing ? 'update' : 'none';
    return html`<mh-dashboard exportparts=${DASHBOARD_PARTS} .ownCss=${this.ownCssOn} .ctx=${this.ctx} .board=${s.board} .boards=${this.places()} .rooms=${rooms} .room=${rooms.find((room) => roomBoardId(room.id) === s.boardId) ?? null} boardName=${open ? this.boardName(open) : ''} boardIcon=${open ? this.boardIcon(open) : 'dashboard'} .boardMenu=${this.boardMenu(open)}
      ?editing=${s.editing && !this.phone} ?canUndo=${s.canUndo} ?firstTime=${open?.sections === null} phase=${phase} emptyReason=${empty} banner=${banner}
      ?inert=${this.wall.shown !== 'none'} ?resting=${this.wall.covered} density=${this.shownDensity()} ?connecting=${connecting && !s.startUnreachable} activePanel=${this.panel === 'wall' ? 'settings' : this.panel}
      .sectionSeeds=${s.sectionSeeds} .heroChart=${open?.chart ?? null} mode=${this.shownMode()} .look=${this.shownStyle()} .baseSeed=${this.shownSeed()}
      @section-seed=${(e: CustomEvent<{ sectionId: string; seed: string | null }>) => this.controller.setSectionSeed(e.detail.sectionId, e.detail.seed)}
      @hero-chart=${(e: CustomEvent<{ chart: HeroChart | null }>) => this.controller.edit({ type: 'set-chart', dashboardId: s.boardId, chart: e.detail.chart })}
      @navigate=${(e: CustomEvent<{ to: RailTarget }>) => this.navigate(e.detail.to)}
      .freshTiles=${this.freshTiles} .news=${s.news} .gone=${s.gone} .nameOfBoard=${this.nameOfBoard}
      @place=${(e: CustomEvent<{ ref: string; sectionId: string | null }>) => this.onPlace(e.detail.ref, e.detail.sectionId)} @skip=${(e: CustomEvent<{ ref: string }>) => this.onSkip(e.detail.ref)}
      @new-section=${(e: CustomEvent<{ ref: string }>) => this.onNewSection(e.detail.ref)} @view-all=${() => this.openEditPanel({ kind: 'news' })} @gone-ok=${() => { this.controller.acknowledgeGone(); this.keepFocus(); }}
      @open-add=${(e: CustomEvent<{ sectionId: string }>) => this.openEditPanel({ kind: 'add', sectionId: e.detail.sectionId })}
      @new-board=${() => { this.boardDialog = 'new'; }} @add-hero=${() => this.addHero()} @board-action=${(e: CustomEvent<{ id: BoardAction }>) => this.onBoardAction(e.detail.id)}
      @open-section-dialog=${(e: CustomEvent<{ sectionId: string | null; column: Column }>) => { this.sectionDialog = e.detail; }}
      @remove-section=${(e: CustomEvent<{ sectionId: string }>) => this.onRemoveSection(e.detail.sectionId)}
      @open-hero=${(e: CustomEvent<{ sectionId: string }>) => this.openEditPanel({ kind: 'hero', sectionId: e.detail.sectionId })}
      @open-tile=${(e: CustomEvent<{ tileId: string }>) => this.openEditPanel({ kind: 'tile', tileId: e.detail.tileId })}
      @layout-edit=${(e: CustomEvent<{ edit: LayoutEdit }>) => this.onEdit(e.detail.edit)}
      @toggle-edit=${() => { if (this.phone) return; if (!this.state.editing) { this.pointing = false; this.markNext('edit'); } this.controller.setEditing(!this.state.editing); }} @done=${() => this.controller.setEditing(false)} @undo=${() => this.undo()}
      .next=${this.nextView()} ?arriving=${this.arriving} ?pointEdit=${this.pointing} @pointer-ok=${() => { this.pointing = false; }}
      @next-step=${(e: CustomEvent<{ step: NextStep }>) => this.onNextStep(e.detail.step)} @next-dismiss=${() => this.dismissNext()}
      @retry=${() => this.controller.retry()} @reload=${() => this.env.served?.reload()} @change-connection=${() => this.controller.changeConnection()}></mh-dashboard>
      ${this.renderEditPanels(open ? this.boardName(open) : '')}
      ${this.renderSectionDialog()}${this.renderBoardDialog()}${this.renderBoardLook()}${this.renderQuestion()}
      <mh-device-panel .ctx=${this.ctx} .deviceId=${connecting ? null : s.openDeviceId} @close=${() => this.controller.closeDevice()}></mh-device-panel>
      <mh-theme-panel .t=${this.ctx.t} .sunDark=${this.sunDarkNow} ?open=${this.panel === 'theme'} ?phone=${this.phone} .look=${s.look} density=${s.theme.density} .presets=${rustigExpressive.color.presets}
        ?safe=${this.safe} ?systemDark=${this.media?.matches ?? false} .boardTheme=${chosen.why === 'board' ? chosen.file.id : null}
        @look-choose=${(e: CustomEvent<LookChoose>) => this.onLookChoose(e.detail)} @look-target=${(e: CustomEvent<{ target: LookTarget }>) => this.onLookTarget(e.detail.target)}
        @density=${(e: CustomEvent<{ density: Density }>) => this.controller.setTheme({ ...this.state.theme, density: e.detail.density })}
        @follow-house=${() => this.controller.followHouse()} @device-look=${(e: CustomEvent<Partial<DeviceLook>>) => this.controller.setDeviceLook(e.detail)}
        @look-preview=${(e: CustomEvent<{ file: ThemeFile | null; cssFrom?: CssFrom }>) => { this.draftCssFrom = e.detail.cssFrom ?? 'other'; this.preview(e.detail.file); }}
        @look-save=${(e: CustomEvent<{ file: ThemeFile; poor?: number; cssFrom?: CssFrom; takenIn?: boolean }>) => this.onLookSave(e.detail.file, e.detail.poor ?? 0, e.detail.cssFrom, e.detail.takenIn === true)}
        @look-remove=${(e: CustomEvent<{ id: string }>) => this.controller.removeTheme(e.detail.id)}
        @close=${() => { this.panel = 'none'; }}></mh-theme-panel>
      <mh-settings-panel .t=${this.ctx.t} .language=${s.language.choice} ?open=${this.panel === 'settings'} .status=${status} .missing=${s.missing} .softwareVersion=${s.softwareVersion} appVersion=${__APP_VERSION__}
        .away=${this.awayState()} .pairAway=${this.env.away ? (code: string, name: string) => this.env.away!.pair(code, name) : null}
        @away-paired=${() => window.location.reload()} @away-unpair=${() => { void this.unpairAway(); }}
        ?overviewAutomatic=${s.layout.dashboards.find((d) => d.id === OVERVIEW_ID)?.sections == null} @export=${() => this.saveLayout()} @reset=${() => this.askReset()}
        @import=${(e: CustomEvent<{ name: string; text: string }>) => this.loadLayout(e.detail)}
        @close=${() => { this.panel = 'none'; }} @disconnect=${() => { this.panel = 'none'; void this.controller.disconnect(); }}
        @leave-demo=${() => { this.panel = 'none'; this.controller.leaveDemo(); }}
        ?hasRooms=${s.hasRooms} grouping=${s.layout.grouping ?? 'type'} .roomsShown=${s.roomsShown}
        @grouping=${(e: CustomEvent<{ grouping: Grouping }>) => this.controller.setGrouping(e.detail.grouping)} @rooms-shown=${(e: CustomEvent<{ shown: boolean }>) => this.controller.setRooms(e.detail.shown)}
        .boards=${this.places()} .startBoard=${s.startBoard} @start-board=${(e: CustomEvent<{ id: string }>) => this.controller.setStartBoard(e.detail.id)}
        .wall=${s.wall} ?phone=${this.phone} @open-wall=${() => { this.panel = 'wall'; this.markNext('wall'); }}
        @language=${(e: CustomEvent<{ choice: Language | null }>) => this.controller.setLanguage(e.detail.choice)}></mh-settings-panel>
      ${this.renderWallPanel()}${this.renderNextDialog()}`;
  }

  /** Pairs this device with the code; then the app starts as it does with a saved connection. */
  private async pair(code: string, name: string): Promise<void> {
    if (!this.env.served || this.pairing) return;
    this.pairing = true;
    const result = await this.env.served.pair(code, name);
    this.pairing = false;
    this.pairIssue = result === 'ok' ? 'none' : result;
    if (result !== 'ok') return;
    // a first start that was left under way is not this one's
    if (!this.env.served.fresh?.()) this.keep(PROGRESS_KEY, null);
    this.justPaired = true;
    await this.controller.start();
    this.followOnboarding();
  }

  // ----- the first start of a hub -----

  private kept(key: string): string | null {
    try { return safeStorage(() => window.localStorage).getItem(key); } catch { return null; }
  }

  private keep(key: string, value: string | null): void {
    const storage = safeStorage(() => window.localStorage);
    try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* best effort: it lasts as long as the page */ }
  }

  /** The hubs this browser did or skipped the first start of. */
  private onboarded(): string[] {
    try {
      const list: unknown = JSON.parse(this.kept(ONBOARDED_KEY) ?? '[]');
      return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
    } catch { return []; }
  }

  /** May this device arrange the hub, as far as is known now. */
  private mayArrangeHub(): boolean {
    return this.env.served?.knownRole() === 'edit' && this.env.served.mayArrange();
  }

  /**
   * The first start follows the app: it begins or goes on as soon as the hub is known, before the dashboard is drawn;
   * it ends quietly when this device is taken away or may only use.
   */
  private followOnboarding(): void {
    if (!this.env.served || this.safe) return;
    if (this.state.phase === 'connect') {
      if (this.onboarding) this.keep(PROGRESS_KEY, null);
      this.onboarding = null;
      return;
    }
    if (this.onboarding && this.env.served.knownRole() === 'use') {
      this.keep(PROGRESS_KEY, null);
      this.onboarding = null;
      return;
    }
    if (this.justPaired && this.beginOnboarding()) this.justPaired = false;
    this.resumeOnboarding();
  }

  /** Just paired here: the first device of a hub that nobody arranged gets the first start. False until the hub is known. */
  private beginOnboarding(): boolean {
    const hub = this.controller.hubId();
    if (hub === null) return false;
    // what the page kept from before is not looked for again
    this.progressRead = true;
    if (!this.env.served?.fresh?.() || this.env.served.knownRole() !== 'edit' || this.onboarded().includes(hub)) return true;
    this.onboarding = { hub, step: 'welcome', choices: defaultChoices(this.state.look.house?.seed ?? rustigExpressive.color.defaultSeed), since: Date.now() };
    this.keep(PROGRESS_KEY, writeProgress(this.onboarding));
    void this.readForOnboarding();
    return true;
  }

  /** Loaded anew halfway: it goes on where it was, with the choices of then. What is of another hub, or too old, goes. */
  private resumeOnboarding(): void {
    if (this.progressRead || !this.env.served) return;
    const hub = this.controller.hubId();
    if (hub === null) return;
    this.progressRead = true;
    const text = this.kept(PROGRESS_KEY);
    if (text === null) return;
    const progress = readProgress(text, hub, Date.now());
    if (!progress || this.env.served.knownRole() !== 'edit') { this.keep(PROGRESS_KEY, null); return; }
    this.onboarding = progress;
    void this.readForOnboarding();
    // the choices were being applied when the page went: once more, which changes nothing that is there already
    if (progress.step === 'build' || progress.step === 'practice') this.applyOnboarding(progress.choices);
  }

  /** Whether the hub has weather and energy to fill their widgets, and whether it is dark there. */
  private async readForOnboarding(): Promise<void> {
    const [weatherRaw, energyRaw] = await Promise.all([this.controller.readWeather().catch(() => null), this.controller.readEnergy('day').catch(() => null)]);
    const weather = readWeather(weatherRaw);
    const energy = readEnergyReport(energyRaw);
    this.reads = { extras: [...(weather ? ['weather' as const] : []), ...(energy ? ['energy' as const] : [])], sunDark: weather?.daylight == null ? null : !weather.daylight };
  }

  private onOnboardingChange({ step, choices }: { step: StepId; choices: Choices }): void {
    if (!this.onboarding) return;
    const before = this.onboarding.step;
    // the choices are applied when the dashboard is made: not without the right to arrange, or before the hub answered
    if (step === 'build' && before !== 'build' && (!this.mayArrangeHub() || this.store.getSnapshot() === null)) return;
    this.onboarding = { ...this.onboarding, step, choices };
    this.keep(PROGRESS_KEY, writeProgress(this.onboarding));
    if (step === 'build' && before !== 'build') this.applyOnboarding(choices);
  }

  /** The choices, through the ways the theme panel and the settings use; the Overzicht only while it is automatic. */
  private applyOnboarding(choices: Choices): void {
    const { controller } = this;
    controller.setHouse({ theme: choices.theme, seed: choices.seed, mode: choices.mode });
    controller.followHouse();
    if (!this.phone && choices.density !== this.state.theme.density) controller.setTheme({ ...this.state.theme, density: choices.density });
    controller.setGrouping(choices.grouping);
    controller.setRooms(choices.rooms);
    const snapshot = this.store.getSnapshot();
    const automatic = this.state.layout.dashboards.find((d) => d.id === OVERVIEW_ID)?.sections == null;
    if (!snapshot || !automatic) return;
    const arranged = arrangeOverview(snapshot, choices, { locale: this.ctx.t.locale, today: this.ctx.t('onboarding.today'), newId: (prefix) => controller.newId(prefix) });
    if (arranged) controller.arrangeOverview(arranged);
  }

  /** Done or skipped: never again on this device for this hub; the dashboard comes in, with the pointer and the card. */
  private endOnboarding(): void {
    const progress = this.onboarding;
    if (!progress) return;
    this.keep(PROGRESS_KEY, null);
    this.keep(ONBOARDED_KEY, JSON.stringify([...new Set([...this.onboarded(), progress.hub])]));
    this.next ??= startNext();
    this.keep(NEXT_KEY, writeNext(this.next));
    this.onboarding = null;
    this.pointing = !this.phone && this.controller.status().canArrange !== false;
    this.arriving = true;
    if (this.arriveTimer !== null) clearTimeout(this.arriveTimer);
    this.arriveTimer = setTimeout(() => { this.arriveTimer = null; this.arriving = false; }, ARRIVE_MS);
  }

  private renderOnboarding(progress: Progress) {
    const snapshot = this.store.getSnapshot();
    const steps = stepsFor({ hasRooms: snapshot !== null && hasRooms(snapshot) });
    // a step this house has not, such as the rooms, is passed over
    const step = steps.includes(progress.step) ? progress.step : 'first';
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    return html`<mh-onboarding .t=${this.ctx.t} .snapshot=${snapshot} .steps=${steps} step=${step} .choices=${progress.choices} .presets=${rustigExpressive.color.presets}
      .extras=${this.reads.extras} .sunDark=${this.reads.sunDark} ?phone=${this.phone} ?systemDark=${this.media?.matches ?? false} ?touch=${touch} ?ready=${snapshot !== null && this.mayArrangeHub()}
      @onboarding-change=${(e: CustomEvent<{ step: StepId; choices: Choices }>) => this.onOnboardingChange(e.detail)}
      @onboarding-skip=${() => this.endOnboarding()} @onboarding-finish=${() => this.endOnboarding()}></mh-onboarding>`;
  }

  // ----- the card "Verder inrichten" -----

  /** What the card shows on this device now; null without one. */
  private nextView(): { steps: NextStep[]; done: NextStep[] } | null {
    const { next } = this;
    if (!next || next.dismissed) return null;
    const steps = nextSteps({ phone: this.phone, mayArrange: this.controller.status().canArrange !== false });
    const done = [...next.done, ...(hasWidget(this.state.layout) ? ['widget' as const] : [])];
    return { steps, done: steps.filter((step) => done.includes(step)) };
  }

  private markNext(step: NextStep): void {
    if (!this.next || this.next.dismissed) return;
    const next = withDone(this.next, step);
    if (next === this.next) return;
    this.next = next;
    this.keep(NEXT_KEY, writeNext(next));
  }

  private dismissNext(): void {
    if (!this.next) return;
    this.next = { ...this.next, dismissed: true };
    this.keep(NEXT_KEY, writeNext(this.next));
  }

  private onNextStep(step: NextStep): void {
    if (step === 'pair' || step === 'away') { this.nextDialog = step; return; }
    if (step === 'wall') { this.panel = 'wall'; this.markNext('wall'); return; }
    this.pointing = false;
    this.controller.setEditing(true);
    this.markNext('edit');
    if (step !== 'widget') return;
    const blocks = this.state.board ? [...this.state.board.left, ...this.state.board.right] : [];
    const first = blocks.find((block) => block.type === 'section');
    if (first?.type === 'section') this.openEditPanel({ kind: 'add', sectionId: first.section.id });
  }

  private renderNextDialog() {
    const { t } = this.ctx;
    const which = this.nextDialog;
    const close = (done: boolean) => { if (done && which) this.markNext(which); this.nextDialog = null; };
    const lines = which === 'away'
      ? [t('next.awayDialog.step1'), t('next.awayDialog.step2', { address: PAGES_TEXT }), t('next.awayDialog.step3')]
      : [t('next.pairDialog.step1', { address: location.host }), t('next.pairDialog.step2'), t('next.pairDialog.step3')];
    return html`<mh-dialog class="next" form ?open=${which !== null} heading=${which === null ? '' : t(which === 'away' ? 'next.awayDialog.title' : 'next.pairDialog.title')}
      @cancel=${() => close(false)}><ol class="next-steps">${lines.map((line) => html`<li><div>${richText(line)}</div></li>`)}</ol>
      ${which === 'away' ? html`<mh-button slot="actions" variant="text" @click=${() => { window.open(PAGES_URL, '_blank', 'noopener'); }}>${t('next.awayDialog.open')}</mh-button>` : nothing}
      <mh-button slot="actions" data-autofocus @click=${() => close(true)}>${t('next.ok')}</mh-button>
    </mh-dialog>`;
  }

  private renderPairing() {
    return html`<mh-pair-screen .t=${this.ctx.t} issue=${this.pairIssue} scanned=${this.scanned} kind=${this.env.served?.kind() ?? 'laptop'} ?busy=${this.pairing} ?revoked=${this.state.connectIssue === 'revoked'}
      @pair=${(e: CustomEvent<{ code: string; name: string }>) => { void this.pair(e.detail.code, e.detail.name); }}></mh-pair-screen>`;
  }

  /** A page with a key: where it stands with the app on its hub, for the settings; null where that does not count. */
  private awayState(): AwayState | null {
    const { away, synced } = this.env;
    if (!away) return null;
    if (!synced) return { paired: false, role: null, up: false, mismatch: null };
    return { paired: true, role: synced.knownRole(), up: synced.up(), mismatch: synced.mismatch() };
  }

  /** Takes this page off the hub; the copy of the dashboards here stays, and the page starts anew without the hub. */
  private async unpairAway(): Promise<void> {
    await this.env.away?.unpair();
    window.location.reload();
  }

  /** The page started anew because the hub took its pairing away: said once. */
  private sayAwayGone(): void {
    let gone = false;
    try {
      gone = window.sessionStorage.getItem(AWAY_GONE_KEY) !== null;
      window.sessionStorage.removeItem(AWAY_GONE_KEY);
    } catch { /* best effort */ }
    // once the page has its snackbar
    if (gone) void this.updateComplete.then(() => this.notify({ text: this.ctx.t('sync.gone'), icon: 'link_off' }));
  }

  /** Inside a frame of another website: the default theme on the page and the language of the browser, nothing else. */
  private showFramed(): void {
    const languages = navigator.languages?.length ? [...navigator.languages] : [navigator.language];
    this.framedT ??= createTranslate(resolveLanguage(null, languages));
    document.documentElement.lang = this.framedT.language;
    applyThemeTo(document.documentElement, createDefaultConfig().theme, this.media?.matches ?? false);
    this.requestUpdate();
  }

  override render() {
    // the address without what the other website put behind it
    if (this.framed) return html`<mh-framed-screen .t=${this.framedT} address=${`${location.origin}${location.pathname}`}></mh-framed-screen>`;
    if (!this.state) return nothing;
    this.applyTheme();
    const phase = this.state.phase;
    const s = this.state;
    const body = phase === 'connect' && this.env.served ? this.renderPairing() : phase === 'connect'
      ? html`<mh-connect-screen .t=${this.ctx.t} issue=${s.connectIssue} ?busy=${s.busy} ?waitingForPermission=${s.waitingForPermission} .review=${s.review} address=${s.savedAddress}
          @connect=${(e: CustomEvent<{ address: string; apiKey: string }>) => { void this.controller.connect(e.detail.address, e.detail.apiKey); }}
          @continue=${() => this.controller.continueWithMissingRights()} @other-key=${() => { void this.controller.useOtherKey(); }}
          @demo=${(e: CustomEvent<{ which?: Demo } | null>) => { void this.controller.startDemo(e.detail?.which ?? 'camper'); }}
          @cancel=${() => { this.controller.cancelConnect(); }}></mh-connect-screen>`
      : this.onboarding ? this.renderOnboarding(this.onboarding) : this.renderDashboard();
    return html`${body}<mh-snackbar></mh-snackbar>${this.renderRest()}`;
  }
}

if (!customElements.get('mh-app')) customElements.define('mh-app', MhApp);

declare global {
  interface HTMLElementTagNameMap { 'mh-app': MhApp }
}
