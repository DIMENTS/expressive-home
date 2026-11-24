import type { Plugin } from 'vite';

export const ICON_FILES: readonly string[];
export const MANIFEST: {
  name: string; short_name: string; lang: string; start_url: string; scope: string; display: string; theme_color: string; background_color: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};
export function appManifest(): Plugin;
