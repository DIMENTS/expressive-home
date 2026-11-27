// The fixed values the check of tools/fixed-values.mjs lets through on purpose.
// Each one names its file, the declaration exactly as the check reports it, and why it is no design value.

const CIRCLE = 'A circle: 50% is the shape itself, not a size that could change with the theme.';
const FULL_TURN = 'A full turn of a spinning icon is geometry, not a design value.';
const VIEWPORT = 'The size of the screen is a boundary of the layout, not a design value.';

/** @type {{ file: string; declaration: string; reason: string }[]} */
export const EXCEPTIONS = [
  { file: 'src/ui/parts/swatch-group.ts', declaration: 'border-radius: 50%', reason: CIRCLE },
  { file: 'src/ui/parts/switch.ts', declaration: 'border-radius: 50%', reason: CIRCLE },
  { file: 'src/ui/tiles/tile-base.ts', declaration: 'border-radius: 50%', reason: CIRCLE },
  { file: 'src/ui/parts/menu.ts', declaration: 'border-radius: 50%', reason: CIRCLE },
  { file: 'src/ui/screens/rail.ts', declaration: 'border-radius: 50%', reason: CIRCLE },
  { file: 'src/ui/parts/chip.ts', declaration: 'transform: rotate(360deg)', reason: FULL_TURN },
  { file: 'src/ui/parts/loader.ts', declaration: 'transform: rotate(360deg)', reason: FULL_TURN },
  { file: 'src/ui/screens/connect-card.ts', declaration: 'transform: rotate(360deg)', reason: FULL_TURN },
  { file: 'src/ui/panels/panel-styles.ts', declaration: 'transform: rotate(90deg)', reason: 'The arrow of an open group turns a quarter: geometry, not a design value.' },
  { file: 'src/ui/panels/device-list.ts', declaration: 'transform: rotate(90deg)', reason: 'The arrow of an open row turns a quarter: geometry, not a design value.' },
  { file: 'src/ui/screens/connect-card.ts', declaration: 'min-height: 100vh', reason: VIEWPORT },
  { file: 'src/ui/onboarding/onboarding.ts', declaration: 'transform: rotate(360deg)', reason: FULL_TURN },
  { file: 'src/ui/onboarding/onboarding.ts', declaration: 'min-height: 100vh', reason: VIEWPORT },
  { file: 'src/ui/screens/rail.ts', declaration: 'height: 100vh', reason: VIEWPORT },
  { file: 'src/ui/parts/dialog.ts', declaration: 'width: min(var(--dialog-width), calc(100vw - var(--space-32)))', reason: VIEWPORT },
  { file: 'src/ui/parts/dialog.ts', declaration: 'max-height: calc(100vh - var(--space-32))', reason: VIEWPORT },
  { file: 'src/ui/parts/sheet.ts', declaration: 'width: min(var(--sheet-width), calc(100vw - 2 * var(--sheet-margin)))', reason: VIEWPORT },
  { file: 'src/ui/parts/snackbar.ts', declaration: 'max-width: min(var(--snackbar-max-width), calc(100vw - var(--space-32)))', reason: VIEWPORT },
  { file: 'src/ui/parts/menu.ts', declaration: 'max-width: calc(100vw - var(--space-32))', reason: VIEWPORT },
];
