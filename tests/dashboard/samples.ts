import { cap, device } from '../helpers/build';

export const dimLamp = device({ id: 'l1', name: 'Plafond', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: true }), cap('dim', { setable: true, value: 0.8 })] });
export const plainLamp = device({ id: 'l2', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: false })] });
export const plug = device({ id: 'p1', deviceClass: 'socket', caps: [cap('onoff', { type: 'boolean', setable: true, value: true }), cap('measure_power', { value: 45 })] });
export const climate = device({ id: 's1', deviceClass: 'sensor', caps: [cap('measure_temperature', { value: 20.5 }), cap('measure_humidity', { value: 52 }), cap('measure_battery', { value: 80 })] });
export const motion = device({ id: 's2', deviceClass: 'sensor', caps: [cap('alarm_motion', { type: 'boolean', value: false }), cap('measure_temperature', { value: 19 })] });
export const tank = device({ id: 't1', caps: [cap('tank_level', { value: 64 }), cap('tank_capacity', { value: 90 }), cap('measure_content_volume', { value: 58 })] });
export const dish = device({ id: 'o1', caps: [cap('measure_download', { value: 182 }), cap('measure_upload', { value: 21 }), cap('measure_latency', { value: 34 }), cap('measure_obstruction', { value: 0.4 })] });
export const remote = device({ id: 'b1', deviceClass: 'button', caps: [cap('button', { type: 'boolean', setable: true }), cap('measure_battery', { value: 90 })] });
export const bare = device({ id: 'x1' });

export const battery = device({ id: 'bat', caps: [cap('battery_soc', { value: 78 }), cap('time_to_go', { value: 3120 }), cap('ac_input_source', { type: 'enum', value: 'none' })] });
export const solar = device({ id: 'sol', deviceClass: 'solarpanel', caps: [cap('measure_power', { value: 412 })] });
export const meter = device({ id: 'met', energy: { cumulative: true, homeBattery: false }, caps: [cap('measure_power', { value: 186 })] });
