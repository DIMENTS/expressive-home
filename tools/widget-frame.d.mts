import type { Plugin } from 'vite';
export const FRAME_FILE: string;
export function scriptHash(script: string): string;
export function framePolicy(script: string): string;
export function frameScript(): Promise<string>;
export function framePage(): Promise<string>;
export function widgetFrame(): Plugin;
