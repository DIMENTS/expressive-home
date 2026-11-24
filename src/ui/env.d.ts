/// <reference types="vite/client" />

/** The version of the dashboard, from package.json at build time. */
declare const __APP_VERSION__: string;
/** True in the build for the app on the hub (vite.homey.config.ts). */
declare const __SERVED_BY_HOMEY__: boolean;
