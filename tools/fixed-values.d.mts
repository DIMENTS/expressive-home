export type Reason = 'colour' | 'length' | 'angle' | 'time' | 'easing' | 'type' | 'opacity' | 'radius' | 'layer' | 'transform' | 'interpolated';
export function extractCss(source: string): string[];
export function findFixedValues(cssText: string): { line: number; declaration: string; reason: Reason }[];
export function findFixedCssom(source: string): { line: number; call: string }[];
