'use strict';

// For the settings of the app: Homey lets only its own users in. A key goes in and never comes out; a code to pair with only
// comes out when it is asked for.
module.exports = {
  async getState({ homey }) { return homey.app.getState(); },
  async getCode({ homey, body }) { return homey.app.getCode(body); },
  async setRole({ homey, params, body }) { return homey.app.setRole(params.id, body && body.role); },
  async removeDevice({ homey, params }) { return homey.app.removeDevice(params.id); },
  async setFlowKey({ homey, body }) { return homey.app.setFlowKey(body && body.key); },
  async removeFlowKey({ homey }) { return homey.app.removeFlowKey(); },
  async resetLooks({ homey }) { return homey.app.resetLooks(); },
  async setRecording({ homey, body }) { return homey.app.setRecording(body && body.on); },
  async wipeRecording({ homey }) { return homey.app.wipeRecording(); },
};
