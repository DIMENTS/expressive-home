'use strict';

const path = require('node:path');
const Homey = require('homey');
const { HomeyAPIV3Local } = require('homey-api');

/** Where the dashboard is, on the own network. */
const PORT = 8790;

/** The flow cards, and what they make of the night of the wall tablets. */
const NIGHT_CARDS = { night_on: true, night_off: false };

const isRole = (value) => value === 'use' || value === 'edit';
const MODES = ['light', 'dark', 'auto'];

class ExpressiveHomeApp extends Homey.App {
  async onInit() {
    this.server = null;
    this.problem = null;
    for (const [id, night] of Object.entries(NIGHT_CARDS)) {
      this.homey.flow.getActionCard(id).registerRunListener(async () => {
        if (!this.server) throw new Error(this.homey.__('flow.notRunning'));
        this.server.setNight(night);
        return true;
      });
    }
    const theme = this.homey.flow.getActionCard('theme_set');
    theme.registerArgumentAutocompleteListener('theme', async (query) => (this.server ? this.server.themeChoices(query || '') : []));
    theme.registerRunListener(async (args) => {
      if (!this.server) throw new Error(this.homey.__('flow.notRunning'));
      const id = args && args.theme && args.theme.id;
      if (typeof id !== 'string' || !this.server.setHouseTheme(id)) throw new Error(this.homey.__('flow.themeGone'));
      return true;
    });
    this.homey.flow.getActionCard('mode_set').registerRunListener(async (args) => {
      if (!this.server) throw new Error(this.homey.__('flow.notRunning'));
      const mode = args && args.mode;
      if (!MODES.includes(mode)) throw new Error('not-possible');
      this.server.setHouseMode(mode);
      return true;
    });
    try {
      // the server is one bundled file (npm run homey-app)
      const { startHomeServer } = await import('./lib/server.mjs');
      this.server = await startHomeServer({
        homey: this.homey, HomeyAPIV3Local, folder: path.join(__dirname, 'public'), port: PORT, log: (message) => this.log(message),
      });
      this.log(`Serving the dashboard on port ${PORT}`);
    } catch (error) {
      this.problem = error.code === 'EADDRINUSE' ? 'port' : 'start';
      this.error('Could not start', error);
    }
  }

  async onUninit() {
    if (this.server) await this.server.close();
  }

  /** What the settings show; asked every few seconds, so nothing here waits for anything. */
  async getState() {
    if (!this.server) return { running: false, problem: this.problem };
    const { server } = this;
    return { running: true, connected: server.connected(), devices: server.devices(), flowKey: server.flowKey(), codes: server.codes(), buttons: server.buttons(), recording: server.recording(), appLive: server.appLive() };
  }

  /** The code that another device pairs with; a new one when none is open, or when that is asked for. */
  async getCode(body) {
    const { slot = 'scan', role = null, fresh = false } = body || {};
    if (!this.server || (slot !== 'scan' && slot !== 'here') || (role !== null && !isRole(role))) throw new Error('not-possible');
    return this.server.code(slot, role, fresh === true);
  }

  setRole(id, role) {
    if (!this.server || !isRole(role)) throw new Error('not-possible');
    return this.server.setRole(id, role);
  }

  removeDevice(id) {
    return this.server ? this.server.removeDevice(id) : false;
  }

  /** Keeps the key for flows when the hub takes it; what comes back is only what became of it. */
  async setFlowKey(key) {
    if (!this.server) throw new Error('not-possible');
    return { result: await this.server.setFlowKey(key) };
  }

  removeFlowKey() {
    if (!this.server) throw new Error('not-possible');
    this.server.removeFlowKey();
    return true;
  }

  /** "Zelf opnemen wat Homey niet bijhoudt", on or off. */
  setRecording(on) {
    if (!this.server || typeof on !== 'boolean') throw new Error('not-possible');
    this.server.setRecording(on);
    return true;
  }

  /** "Opname wissen": what the app recorded goes from Insights. */
  async wipeRecording() {
    if (!this.server) throw new Error('not-possible');
    await this.server.wipeRecording();
    return true;
  }

  /** "Alle apparaten weer in Rustig": the house and every dashboard; each device follows the house again. */
  resetLooks() {
    if (!this.server) throw new Error('not-possible');
    this.server.resetLooks();
    return true;
  }
}

module.exports = ExpressiveHomeApp;
