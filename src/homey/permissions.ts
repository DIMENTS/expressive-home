export type Feature = 'readDevices' | 'controlDevices' | 'readZones' | 'readFlows' | 'startFlows' | 'readInsights' | 'readSystem';

export const FEATURE_SCOPES: Record<Feature, string> = {
  readDevices: 'homey.device.readonly', controlDevices: 'homey.device.control', readZones: 'homey.zone.readonly',
  readFlows: 'homey.flow.readonly', startFlows: 'homey.flow.start', readInsights: 'homey.insights.readonly', readSystem: 'homey.system.readonly',
};

/** A granted scope covers the required one when it is equal to it or a prefix of it at a dot boundary. */
export function can(scopes: string[], required: string): boolean {
  return scopes.some((granted) => granted === required || required.startsWith(`${granted}.`));
}

export function missingFeatures(scopes: string[]): Feature[] {
  return (Object.keys(FEATURE_SCOPES) as Feature[]).filter((feature) => !can(scopes, FEATURE_SCOPES[feature]));
}
