// The breakpoints of the design system. CSS cannot read variables inside @media and @container
// conditions, so these numbers enter the styles as interpolations; the fixed-values check skips conditions.

/** From this window width the dashboard has two columns (7 to 5). */
export const COLUMNS_MIN_PX = 1180;
/** From this inner section width the tile grid has four columns instead of two. */
export const TILE_GRID_WIDE_MIN_PX = 600;
/** Below this section width the hero's stats go under the number. */
export const HERO_STACK_MAX_PX = 560;
/** Below this window width the two halves of the connect card stack. */
export const CONNECT_STACK_MAX_PX = 880;
/** Below this window width the dashboard has the form of a phone. */
export const PHONE_MAX_PX = 600;
/** On a phone the hero's stats stand in one row from this section width, two by two below it. */
export const HERO_STATS_ROW_PX = 300;
/** And when one of them is a word instead of a number, from this section width. */
export const HERO_WORDS_ROW_PX = 330;
/** And when a label has a long word, from this section width. */
export const HERO_LABELS_ROW_PX = 420;
/** And when its longest word is just too long for the narrowest phones. */
export const HERO_LABEL_ROW_PX = 352;
/** A button narrower than this says only what it does, not how. */
export const HOLD_TEXT_MIN_PX = 270;
/** In a narrower row of buttons there is no room for a slider beside them. */
export const CONTROL_SLIDER_MIN_PX = 224;
