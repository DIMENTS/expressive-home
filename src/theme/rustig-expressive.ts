import type { ThemeDefinition } from './types';

/**
 * The first theme. This object is the source of every visual value;
 * docs/design/tokens.css carries the same names and values, and a test keeps the two equal.
 */
export const rustigExpressive: ThemeDefinition = {
  id: 'rustig-expressive',
  name: 'Rustig Expressive',
  color: {
    variant: 'tonalSpot',
    contrast: 0,
    defaultSeed: '#3b6939',
    presets: [
      { id: 'forest', seed: '#3b6939' },
      { id: 'blue', seed: '#3a5ba9' },
      { id: 'purple', seed: '#6750a4' },
      { id: 'terracotta', seed: '#a6422a' },
      { id: 'raspberry', seed: '#a03b6c' },
    ],
  },
  system: {
    // shape scale
    'shape-xs': '4px', 'shape-sm': '8px', 'shape-md': '12px', 'shape-lg': '16px', 'shape-xl': '20px', 'shape-2xl': '28px', 'shape-full': '999px',
    // type scale: one family, three weights
    'font-family': '"Google Sans Flex Variable", "Google Sans Flex", system-ui, "Segoe UI", sans-serif',
    'weight-regular': '400', 'weight-medium': '500', 'weight-strong': '600',
    'type-hero-size': '104px', 'type-hero-line': '.92',
    'type-greeting-size': '44px', 'type-greeting-line': '1.05',
    'type-value-size': '32px', 'type-value-line': '1.1',
    'type-title-size': '22px', 'type-title-line': '1.25',
    'type-body-l-size': '16px', 'type-body-l-line': '1.45',
    'type-label-l-size': '15px', 'type-label-l-line': '1.25',
    'type-label-m-size': '14px', 'type-label-m-line': '1.3',
    'type-body-s-size': '13px', 'type-body-s-line': '1.35',
    'type-label-s-size': '12px', 'type-label-s-line': '1.3',
    'tracking-display': '-.02em',
    // spacing scale: the number is the size in pixels
    'space-2': '2px', 'space-4': '4px', 'space-6': '6px', 'space-8': '8px', 'space-10': '10px', 'space-12': '12px', 'space-14': '14px',
    'space-16': '16px', 'space-20': '20px', 'space-24': '24px', 'space-32': '32px', 'space-40': '40px',
    // motion: spatial may overshoot, effects never do
    'motion-spatial': '500ms cubic-bezier(.38,1.21,.22,1)', 'motion-effects': '200ms cubic-bezier(.34,.8,.34,1)', 'press-scale': '.97',
    'easing-spatial': 'cubic-bezier(.38,1.21,.22,1)', 'duration-spatial': '500ms',
    // continuous motion: one wavelength, one turn or one pulse
    'easing-pulse': 'ease-in-out',
    'motion-wave': '1.8s', 'motion-banner-wave': '1.2s', 'motion-loader': '2.4s', 'motion-pulse': '1.4s', 'motion-spin': '1.2s', 'motion-drift': '60s', 'motion-arrive': '1.6s',
    // interaction states
    'state-hover': '8%', 'state-pressed': '10%', 'state-dragged': '16%',
    'state-disabled-content': '.38', 'state-disabled-container': '12%', 'state-stale': '.62',
    'focus-width': '3px', 'focus-offset': '3px', 'focus-color': 'var(--c-primary)',
    'target-min': '48px',
    // icons
    'icon-xs': '16px', 'icon-s': '18px', 'icon-m': '20px', 'icon-l': '24px',
    // the two ramps show real light colours, so they are fixed values rather than theme colours
    'ramp-hue': 'linear-gradient(to right, hsl(0 85% 60%), hsl(60 85% 55%), hsl(120 70% 50%), hsl(180 75% 50%), hsl(240 85% 65%), hsl(300 80% 60%), hsl(360 85% 60%))',
    'ramp-temperature': 'linear-gradient(to right, #ffb46b, #ffe2c2, #f4f7ff, #cfe2ff)',
    // the swatch for a free colour shows every hue, so it is a fixed ramp too
    'ramp-swatch': 'conic-gradient(hsl(0 80% 60%), hsl(60 80% 55%), hsl(120 65% 50%), hsl(180 70% 50%), hsl(240 80% 65%), hsl(300 75% 60%), hsl(360 80% 60%))',
    // elevation: only overlays cast a shadow
    'shadow-overlay': '0 12px 40px color-mix(in srgb, var(--c-shadow) 22%, transparent)',
    'scrim': 'color-mix(in srgb, var(--c-scrim) 36%, transparent)',
    // stacking layers: what floats above what
    'layer-sheet-scrim': '60', 'layer-sheet': '61', 'layer-snackbar': '80', 'layer-dialog-scrim': '89', 'layer-dialog': '90', 'layer-menu': '30',
    'layer-edit-bar': '20', 'layer-drag': '70', 'layer-nav-bar': '35', 'layer-dimmer': '71', 'layer-rest': '100',
    // the rest screen of a wall tablet: everything in units that follow the size of the screen (a number is so many units)
    'rest-unit': 'min(100vw / 1280, 100dvh / 800)', 'rest-unit-portrait': 'min(100vw / 800, 100dvh / 1280)', 'rest-pad-x': '64', 'rest-pad-top': '56', 'rest-pad-bottom': '48',
    'rest-gap': '16', 'rest-clock': '272', 'rest-clock-portrait': '254', 'rest-clock-line': '.84', 'rest-clock-inset': '-10',
    'rest-tracking': '-.045em', 'rest-date': '34', 'rest-temp': '52', 'rest-label': '21', 'rest-icon': '36',
    'rest-pill': '60', 'rest-pill-text': '23', 'rest-number': '148', 'rest-number-line': '.82', 'rest-unit-text': '64',
    'rest-line': '26', 'rest-line-width': '190', 'rest-stat': '40', 'rest-stat-width': '230', 'rest-wave-height': '44',
    'rest-wave-stroke': '14px', 'rest-night-clock': '200', 'rest-night-text': '26', 'rest-night-width': '600', 'rest-shift': '4px',
    'rest-night-shift-x': '12vw', 'rest-night-shift-y': '20dvh',
  },
  density: {
    comfortable: {
      'density-tile-height': '112px', 'density-tile-pad': '14px', 'density-tile-gap': '10px',
      'density-section-gap': '16px', 'density-section-pad': '20px', 'density-title-gap': '16px',
      'density-icon-box': '40px', 'density-slider-height': '28px', 'density-flow-height': '56px',
      'density-greeting-size': '44px', 'density-hero-size': '104px', 'density-hero-title-size': '22px', 'density-section-title-size': '22px',
      'density-page-pad': '24px', 'density-stat-pad': '14px 16px',
    },
    compact: {
      'density-tile-height': '56px', 'density-tile-pad': '10px 12px', 'density-tile-gap': '8px',
      'density-section-gap': '12px', 'density-section-pad': '16px', 'density-title-gap': '12px',
      'density-icon-box': '36px', 'density-slider-height': '20px', 'density-flow-height': '48px',
      'density-greeting-size': '44px', 'density-hero-size': '104px', 'density-hero-title-size': '22px', 'density-section-title-size': '22px',
      'density-page-pad': '24px', 'density-stat-pad': '14px 16px',
    },
    // a window as narrow as a phone; the owner's choice between the other two does not count there
    phone: {
      'density-tile-height': '60px', 'density-tile-pad': '10px 12px', 'density-tile-gap': '8px',
      'density-section-gap': '12px', 'density-section-pad': '14px', 'density-title-gap': '10px',
      'density-icon-box': '36px', 'density-slider-height': '20px', 'density-flow-height': '48px',
      'density-greeting-size': '26px', 'density-hero-size': '56px', 'density-hero-title-size': '16px', 'density-section-title-size': '18px',
      'density-page-pad': '12px', 'density-stat-pad': '8px',
    },
  },
  components: {
    // page and navigation rail
    'page-bg': 'var(--c-surface-container)', 'page-fg': 'var(--c-on-surface)', 'page-max-width': '1560px', 'page-pad': 'var(--density-page-pad)',
    'rail-width': '96px', 'rail-item-fg': 'var(--c-on-surface-variant)', 'rail-item-active-fg': 'var(--c-on-surface)',
    'rail-indicator-width': '56px', 'rail-indicator-height': '32px', 'rail-indicator-radius': 'var(--shape-full)',
    'rail-indicator-bg': 'var(--c-secondary-container)', 'rail-indicator-fg': 'var(--c-on-secondary-container)',
    'rail-item-min-width': '80px', 'rail-item-height': '56px',
    // the bar at the bottom of a phone
    'nav-bar-height': '72px', 'nav-bar-bg': 'var(--c-surface-container-high)', 'nav-bar-item-min': '64px', 'nav-bar-item-max': '120px',
    // header and status chips
    'header-eyebrow-fg': 'var(--c-on-surface-variant)', 'header-title-size': 'var(--density-greeting-size)',
    'chip-height': '36px', 'chip-radius': 'var(--shape-full)', 'chip-bg': 'var(--c-surface)', 'chip-fg': 'var(--c-on-surface)',
    'chip-alert-bg': 'var(--c-error-container)', 'chip-alert-fg': 'var(--c-on-error-container)',
    // section
    'section-bg': 'var(--c-surface)', 'section-fg': 'var(--c-on-surface)', 'section-radius': 'var(--shape-2xl)',
    'section-pad': 'var(--density-section-pad)', 'section-gap': 'var(--density-section-gap)', 'section-title-gap': 'var(--density-title-gap)',
    'section-title-size': 'var(--density-section-title-size)',
    'section-count-fg': 'var(--c-on-surface-variant)',
    'section-hero-bg': 'var(--c-primary-container)', 'section-hero-fg': 'var(--c-on-primary-container)',
    // tile
    'tile-bg': 'var(--c-surface-container-high)', 'tile-fg': 'var(--c-on-surface)', 'tile-state-fg': 'var(--c-on-surface-variant)',
    'tile-on-bg': 'var(--c-primary-container)', 'tile-on-fg': 'var(--c-on-primary-container)',
    'tile-alert-bg': 'var(--c-error-container)', 'tile-alert-fg': 'var(--c-on-error-container)',
    'tile-radius': 'var(--shape-xl)', 'tile-radius-pressed': '14px',
    'tile-height': 'var(--density-tile-height)', 'tile-pad': 'var(--density-tile-pad)', 'tile-gap': 'var(--density-tile-gap)',
    'tile-icon-box': 'var(--density-icon-box)', 'tile-icon-bg': 'var(--c-surface)', 'tile-icon-fg': 'var(--c-on-surface-variant)',
    'tile-icon-on-bg': 'var(--c-primary)', 'tile-icon-on-fg': 'var(--c-on-primary)',
    'tile-icon-alert-bg': 'var(--c-error)', 'tile-icon-alert-fg': 'var(--c-on-error)',
    'tile-cell-bg': 'var(--c-surface)', 'tile-cell-radius': 'var(--shape-md)', 'tile-value-small': '20px',
    'tile-badge-fg': 'var(--c-error)', 'tile-more-size': '36px',
    'tile-unavailable-bg': 'color-mix(in srgb, var(--c-on-surface) 5%, transparent)', 'tile-unavailable-ring': '2px', 'tile-unavailable-opacity': '.6',
    'tile-wide-face-basis': '52%',
    // a line around sections and tiles (none in Rustig), and the slider on a tile that is on
    'section-outline': 'transparent', 'section-outline-width': '0px', 'tile-outline': 'transparent', 'tile-outline-width': '0px',
    'tile-on-slider-fill': 'var(--slider-fill)', 'tile-on-slider-track': 'var(--slider-track)',
    // slider
    'slider-height': 'var(--density-slider-height)', 'slider-radius': 'var(--shape-md)', 'slider-radius-inner': 'var(--shape-xs)',
    'slider-fill': 'var(--c-primary)', 'slider-track': 'color-mix(in srgb, var(--c-primary) 24%, transparent)',
    'slider-off-fill': 'var(--c-on-surface-variant)', 'slider-off-track': 'color-mix(in srgb, var(--c-on-surface-variant) 22%, transparent)',
    'slider-handle-width': '4px', 'slider-handle-width-dragging': '2px', 'slider-handle-overshoot': '5px', 'slider-gap': '7px',
    'slider-off-opacity': '.55', 'slider-ramp-handle-width': '8px', 'slider-ramp-ring': '3px', 'slider-grip-scale': '1.2',
    // the buttons on a tile and at the top of a window
    'control-height': '40px', 'control-bg': 'color-mix(in srgb, currentColor 10%, transparent)', 'control-hover': '16%', 'control-radius': 'var(--shape-full)', 'control-radius-pressed': 'var(--shape-md)',
    'control-gap': 'var(--space-4)', 'control-main-bg': 'var(--c-primary)', 'control-main-fg': 'var(--c-on-primary)', 'control-fill': 'color-mix(in srgb, currentColor 26%, transparent)',
    'control-step-width': '56px', 'control-value-size': '24px', 'control-large-height': '60px', 'control-large-radius': 'var(--shape-xl)', 'control-large-value-size': '64px', 'control-unit-size': '.6em', 'hold-step': '200ms',
    'control-large-width': '76px', 'control-held-width': '168px', 'top-window-height': '190px', 'top-window-bg': 'linear-gradient(var(--c-tertiary-container), var(--c-surface-container-high))',
    'top-cloth-bg': 'var(--c-secondary-container)', 'top-cloth-line': 'color-mix(in srgb, var(--c-secondary-container), var(--c-secondary) 14%)', 'top-slat': '14px', 'top-roll': '12px', 'top-bunch': '30px', 'top-frame': 'color-mix(in srgb, var(--c-surface) 70%, transparent)',
    'top-art-height': '150px', 'top-art-bg': 'linear-gradient(135deg, var(--c-primary-container), var(--c-tertiary-container))', 'top-art-icon': '64px', 'top-icon-box': '88px', 'top-icon': '44px',
    // the cards of the rooms
    'room-card-min': '280px', 'room-card-height': '116px',
    // a lamp tile that is held and grows into a dimmer
    'dimmer-height': '236px', 'dimmer-grow': '4px', 'dimmer-radius': 'var(--shape-2xl)', 'dimmer-bg': 'color-mix(in srgb, var(--c-primary) 24%, var(--c-surface-container-low))',
    'dimmer-fg': 'var(--c-on-surface)', 'dimmer-fill': 'var(--c-primary)', 'dimmer-fill-fg': 'var(--c-on-primary)', 'dimmer-scrim': 'color-mix(in srgb, var(--c-scrim) 18%, transparent)',
    // hero
    'hero-number-size': 'var(--density-hero-size)', 'hero-title-size': 'var(--density-hero-title-size)', 'hero-stat-pad': 'var(--density-stat-pad)',
    'hero-stat-bg': 'color-mix(in srgb, currentColor 8%, transparent)', 'hero-stat-radius': 'var(--shape-lg)', 'hero-stat-hover': '14%', 'hero-stat-word': '100px', 'hero-wave-height': '20px',
    'hero-wave-stroke': '6px', 'hero-wave-fg': 'var(--c-primary)', 'hero-wave-track': 'color-mix(in srgb, var(--c-primary) 24%, transparent)',
    'hero-wave-length': '28px', 'hero-wave-amplitude': '3.2px', 'hero-wave-gap': '12px',
    // chart in the hero
    'chart-height': '112px', 'chart-gap': 'var(--space-20)', 'chart-line': 'var(--c-primary)', 'chart-line-2': 'var(--c-tertiary)', 'chart-line-width': '3px',
    'chart-area': 'color-mix(in srgb, var(--c-primary) 20%, transparent)', 'chart-baseline': 'color-mix(in srgb, currentColor 18%, transparent)',
    'chart-label-fg': 'color-mix(in srgb, currentColor 72%, transparent)', 'chart-now-size': '12px', 'chart-now-ring': '3px',
    // charts in the device window, on a wide tile and in the hero
    'chart-window-height': '150px', 'chart-cursor': 'color-mix(in srgb, currentColor 34%, transparent)', 'chart-cursor-width': '2px',
    'chart-tip-bg': 'var(--c-inverse-surface)', 'chart-tip-fg': 'var(--c-inverse-on-surface)', 'chart-tip-radius': 'var(--shape-full)',
    'chart-band-height': '12px', 'chart-band-on': 'var(--c-primary)', 'chart-band-track': 'color-mix(in srgb, currentColor 10%, transparent)',
    'chart-tile-share': '55%', 'chart-tile-area': 'color-mix(in srgb, currentColor 18%, transparent)',
    'hero-chart-line': 'var(--chart-line)', 'hero-chart-line-2': 'var(--chart-line-2)', 'hero-chart-area': 'var(--chart-area)', 'hero-chart-band': 'color-mix(in srgb, currentColor 55%, transparent)',
    // section menu and colour per section
    'section-menu-bg': 'var(--c-surface-container)', 'section-menu-fg': 'var(--c-on-surface)', 'section-menu-radius': 'var(--shape-lg)',
    'section-menu-width': '336px', 'section-menu-item-height': '48px', 'section-dot-size': '20px',
    'section-menu-divider': '1px', 'section-menu-trigger-fg': 'var(--c-on-surface-variant)',
    'section-title-icon-fg': 'currentColor', 'section-own-title-icon-fg': 'var(--c-primary)',
    // tank
    'tank-fill': 'var(--c-tertiary)', 'tank-track': 'color-mix(in srgb, var(--c-tertiary) 22%, transparent)',
    'tank-bar-height': '20px', 'tank-compact-fill': 'var(--c-tertiary-container)',
    // flow button
    'flow-height': 'var(--density-flow-height)', 'flow-radius': 'var(--shape-full)', 'flow-radius-pressed': 'var(--shape-lg)',
    'flow-bg': 'var(--c-secondary-container)', 'flow-fg': 'var(--c-on-secondary-container)', 'flow-press-scale': '.96',
    // buttons
    'button-height': '48px', 'button-radius': 'var(--shape-full)', 'button-radius-pressed': 'var(--shape-lg)',
    'button-filled-bg': 'var(--c-primary)', 'button-filled-fg': 'var(--c-on-primary)',
    'button-tonal-bg': 'var(--c-secondary-container)', 'button-tonal-fg': 'var(--c-on-secondary-container)',
    'button-text-fg': 'var(--c-primary)', 'button-danger-fg': 'var(--c-error)',
    'icon-button-size': '40px', 'button-small-height': '40px',
    // text field
    'field-height': '56px', 'field-radius': 'var(--shape-lg)', 'field-bg': 'var(--c-surface-container-high)', 'field-fg': 'var(--c-on-surface)',
    'field-label-fg': 'var(--c-on-surface-variant)', 'field-focus': 'var(--c-primary)', 'field-error': 'var(--c-error)',
    'field-outline-width': '2px',
    // switch and connected choice buttons
    'switch-width': '52px', 'switch-height': '32px', 'switch-off-bg': 'var(--c-surface-container-highest)', 'switch-off-outline': 'var(--c-outline)',
    'switch-off-thumb': 'var(--c-outline)', 'switch-on-bg': 'var(--c-primary)', 'switch-on-thumb': 'var(--c-on-primary)',
    'switch-outline-width': '2px', 'switch-thumb-off': '16px', 'switch-thumb-on': '24px', 'switch-thumb-pressed': '28px',
    'choice-height': '48px', 'choice-bg': 'var(--c-surface-container-high)', 'choice-fg': 'var(--c-on-surface-variant)',
    'choice-on-bg': 'var(--c-secondary-container)', 'choice-on-fg': 'var(--c-on-secondary-container)',
    'choice-radius': 'var(--shape-sm)', 'choice-radius-on': 'var(--shape-full)',
    'swatch-size': '34px', 'swatch-size-chosen': '46px',
    'radio-height': '48px',
    // the cards to choose a theme: a little dashboard in that theme's own values
    'look-card-bg': 'var(--c-surface-container-high)', 'look-card-fg': 'var(--c-on-surface)', 'look-card-note-fg': 'var(--c-on-surface-variant)',
    'look-card-radius': 'var(--shape-xl)', 'look-card-pad': 'var(--space-6)', 'look-card-ring': '3px', 'look-picker-min': '140px',
    'look-preview-height': '84px', 'look-preview-radius': 'var(--shape-lg)', 'look-preview-mark': '40%',
    'share-code-font': 'ui-monospace, "SF Mono", Consolas, monospace',
    // sheet (device window, theme, settings) and dialog
    'sheet-width': '420px', 'sheet-margin': 'var(--space-16)', 'sheet-radius': 'var(--shape-2xl)', 'sheet-bg': 'var(--c-surface)', 'sheet-fg': 'var(--c-on-surface)',
    'sheet-row-bg': 'var(--c-surface-container-high)', 'sheet-row-radius': 'var(--shape-xl)', 'sheet-cell-radius': 'var(--shape-lg)',
    'sheet-phone-height': '88dvh', 'sheet-grab-width': '36px', 'sheet-grab-height': '4px', 'sheet-grab-fg': 'var(--c-outline-variant)',
    'sheet-icon-box': '44px', 'sheet-row-height': '56px', 'sheet-summary-height': '40px', 'sheet-slider-height': '28px',
    'dialog-bg': 'var(--c-surface-container-high)', 'dialog-radius': 'var(--shape-2xl)', 'dialog-width': '400px', 'dialog-enter-scale': '.94',
    // feedback
    'banner-bg': 'var(--c-error-container)', 'banner-fg': 'var(--c-on-error-container)', 'banner-radius': 'var(--shape-xl)',
    'banner-ok-bg': 'var(--c-primary-container)', 'banner-ok-fg': 'var(--c-on-primary-container)',
    'snackbar-bg': 'var(--c-inverse-surface)', 'snackbar-fg': 'var(--c-inverse-on-surface)', 'snackbar-action': 'var(--c-inverse-primary)',
    'snackbar-radius': 'var(--shape-lg)', 'snackbar-max-width': '560px',
    'banner-text-min': '260px', 'banner-wave-width': '96px', 'banner-wave-height': '12px', 'banner-wave-length': '24px', 'banner-wave-stroke': '4px', 'banner-wave-amplitude': '3px',
    'note-bg': 'var(--c-surface-container-high)', 'note-fg': 'var(--c-on-surface-variant)', 'note-radius': 'var(--shape-lg)',
    'skeleton-bg': 'var(--c-surface-container-high)', 'skeleton-text-height': '24px', 'skeleton-hero-height': '220px', 'skeleton-pulse-opacity': '.45',
    // connect screen
    'connect-max-width': '1040px', 'connect-art-size': '200px', 'connect-art-offset': '-56px', 'connect-art-bg': 'color-mix(in srgb, currentColor 9%, transparent)',
    'connect-title-width': '9em', 'connect-lead-width': '26em', 'connect-step-size': '36px', 'connect-right-min': '112px',
    // loading and empty
    'loader-small': '22px', 'loader-large': '56px',
    'empty-pad': '96px', 'empty-art-size': '120px', 'empty-icon-size': '48px', 'empty-text-width': '440px',
    // the edit mode: the bar at the top while editing
    'edit-bar-bg': 'var(--c-secondary-container)', 'edit-bar-fg': 'var(--c-on-secondary-container)', 'edit-bar-radius': 'var(--shape-xl)',
    'edit-bar-height': '64px',
    // tiles and sections while editing
    'edit-tile-ring': 'var(--c-outline-variant)', 'edit-ring-width': '2px', 'edit-handle-fg': 'var(--c-on-surface-variant)',
    'add-slot-border': 'var(--c-outline)', 'add-slot-fg': 'var(--c-on-surface-variant)', 'add-slot-border-width': '2px',
    'add-slot-height': 'var(--button-height)',
    // dragging
    'drag-lift-scale': '1.03', 'drag-shadow': 'var(--shadow-overlay)',
    'drop-bg': 'color-mix(in srgb, var(--c-primary) 12%, transparent)', 'drop-border': 'var(--c-primary)',
    // changes on the hub: new or gone devices
    'news-bg': 'var(--c-surface)', 'news-fg': 'var(--c-on-surface)', 'news-radius': 'var(--shape-xl)',
    'news-icon-bg': 'var(--c-primary)', 'news-icon-fg': 'var(--c-on-primary)', 'news-icon-box': '40px',
    'rail-badge-size': '8px', 'rail-badge-bg': 'var(--c-primary)',
    // own labels in the header: declared, not used
    'chip-add-border': 'var(--c-outline)', 'chip-add-fg': 'var(--c-on-surface-variant)',
    // pickers: icons, values and the list of devices per room
    'icon-scroll-height': '260px', 'icon-pick-size': '48px', 'icon-pick-bg': 'var(--c-surface-container-high)', 'icon-pick-on-bg': 'var(--c-secondary-container)', 'icon-pick-on-fg': 'var(--c-on-secondary-container)',
    'pick-row-height': '56px', 'pick-icon-box': '36px', 'pick-badge-fg': 'var(--c-primary)',
    // the rest screen of a wall tablet
    'rest-bg': 'var(--c-surface)', 'rest-fg': 'var(--c-on-surface)', 'rest-fg-muted': 'var(--c-on-surface-variant)', 'rest-accent': 'var(--c-primary)',
    'rest-wave-track': 'var(--c-secondary-container)', 'rest-stale-wave': 'var(--c-outline)', 'rest-alarm-bg': 'var(--c-error-container)', 'rest-alarm-fg': 'var(--c-on-error-container)',
    'rest-warn-bg': 'var(--c-tertiary-container)', 'rest-warn-fg': 'var(--c-on-tertiary-container)', 'rest-night-bg': '#000000', 'rest-night-fg': '#3a3f38',
    'rest-night-alarm': '#96423b',
    // widgets: the clock, a note, a link to a dashboard, and a frame of an own widget
    'widget-clock-size': 'var(--density-greeting-size)', 'widget-clock-wide-size': 'calc(var(--density-greeting-size) * 1.45)', 'widget-note-accent-bg': 'var(--c-inverse-surface)', 'widget-note-accent-fg': 'var(--c-inverse-on-surface)', 'widget-note-accent-icon-bg': 'var(--c-inverse-primary)', 'widget-note-accent-icon-fg': 'var(--c-inverse-surface)', 'widget-note-lines': '6', 'widget-note-wide-lines': '4', 'widget-link-arrow-bg': 'var(--c-primary)', 'widget-link-arrow-fg': 'var(--c-on-primary)', 'widget-max-height': 'calc(var(--tile-height) * 4)', 'widget-missing-border': 'var(--c-outline)',
    'widget-gauge-width': '150px', 'widget-gauge-stroke': '14', 'widget-gauge-lift': '34px', 'widget-gauge-fill': 'var(--slider-fill)', 'widget-gauge-track': 'var(--slider-track)',
  },
};
