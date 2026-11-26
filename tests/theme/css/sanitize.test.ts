import { expect, test } from 'vitest';
import { sanitizeCss } from '../../../src/theme/css/sanitize';
import { tokenize } from '../../../src/theme/css/tokens';
import { PART_NAMES } from '../../../src/theme/css/parts';

const wide = (text: string) => sanitizeCss(text, { list: 'wide', keyframes: 't1' });
const narrow = (text: string) => sanitizeCss(text, { list: 'narrow', keyframes: 't1' });

test('the tokenizer reads idents with escapes, strings, numbers, urls and skips comments, with lines', () => {
  const tokens = tokenize('a\\62 c /* x */ "s\\"t" 1.5em 50% url(data:x) #fff\nb').filter((token) => token.type !== 'space');
  expect(tokens.map((token) => [token.type, token.value])).toEqual([
    ['ident', 'abc'], ['string', 's"t'], ['dimension', '1.5em'], ['percentage', '50%'], ['url', 'data:x'], ['hash', 'fff'], ['ident', 'b'],
  ]);
  expect(tokens.at(-1)!.line).toBe(2);
});

test('a plain rule on a part comes back, prefixed, rebuilt', () => {
  const out = wide('::part(tile) { border-radius: 0; border: 1px solid currentColor; }\n::part(tile on):hover { background: #062; color: #7f7 }');
  expect(out.dashboard).toBe('mh-app::part(tile){border-radius:0;border:1px solid currentColor}\nmh-app::part(tile on):hover{background:#062;color:#7f7}');
  expect(out.messages).toEqual([]);
});

test('the rest screen goes to its own sheet', () => {
  const out = wide('::part(rest-clock) { color: #fff } ::part(tile) { color: #000 }');
  expect(out.rest).toBe('mh-app::part(rest-clock){color:#fff}');
  expect(out.dashboard).toBe('mh-app::part(tile){color:#000}');
});

test('only ::part() selectors with known names, allowed pseudos and ::before/::after', () => {
  for (const bad of ['body { color: red }', '* { color: red }', '::part(nope) { color: red }', 'mh-app { color: red }', '::part(tile) div { color: red }', '::part(tile):has(x) { color: red }', '::part(tile) + ::part(tile) { color: red }']) {
    const out = wide(bad);
    expect([bad, out.dashboard]).toEqual([bad, '']);
    expect(out.messages.length).toBeGreaterThan(0);
  }
  expect(wide('::part(tile-icon)::before { content: ""; border: 1px solid #fff }').dashboard).toBe('mh-app::part(tile-icon)::before{content:"";border:1px solid #fff}');
  expect(wide('::part(tile), ::part(nope) { color: #fff }').dashboard).toBe('mh-app::part(tile){color:#fff}');
});

test('what may hide, move, shrink or overlay is on no list, even in the house’s own CSS', () => {
  for (const declaration of ['display: none', 'visibility: hidden', 'opacity: 0', 'filter: blur(9px)', 'transform: scale(0)', 'scale: 0', 'translate: 9px',
    'rotate: 9deg', 'zoom: .1', 'clip-path: inset(50%)', 'mask: none', 'mix-blend-mode: multiply', 'content-visibility: hidden', 'position: fixed', 'z-index: 9',
    'pointer-events: none', 'margin: -40px', 'order: -1', 'grid-row: 1', 'width: 0', 'height: 0', 'min-height: 0', 'overflow: hidden', 'font-size: 0',
    '-webkit-text-fill-color: transparent', 'content: "Deur dicht"', 'content: "🔒"', 'outline-offset: -40px', 'box-shadow: 0 0 0 400px #f00']) {
    const out = wide(`::part(section) { ${declaration} }`);
    expect([declaration, out.dashboard]).toEqual([declaration, '']);
    expect(out.messages[0]!.line).toBe(1);
  }
});

test('the wide list: colours, gradients, borders, shadows, letters, space, decoration', () => {
  const css = '::part(tile) { background: linear-gradient(160deg, #012, var(--c-primary) 50%); box-shadow: 0 2px 8px rgb(0 0 0 / 30%); font-family: ui-monospace, "SF Mono", monospace; letter-spacing: -.02em; text-transform: uppercase; padding: 8px 12px; text-shadow: 0 0 4px #3f3 }';
  expect(wide(css).messages).toEqual([]);
  expect(wide('::part(tile-name) { font-size: 1.2em }').messages).toEqual([]);
  expect(wide('::part(tile-name) { font-size: 3em }').dashboard).toBe('');
  expect(wide('::part(page) { background: color-mix(in srgb, #fff 20%, var(--c-surface)) url(data:image/svg+xml,%3Csvg%3E) no-repeat center / cover }').messages).toEqual([]);
  expect(wide('::part(tile) { color: #fff / 2 }').dashboard).toBe('');
  expect(wide('::part(tile) { padding: 400px }').dashboard).toBe('');
});

test('someone else’s CSS: only the narrow list until it is allowed', () => {
  const out = narrow('::part(tile) { color: #fff; box-shadow: 0 0 4px #fff; text-transform: uppercase }');
  expect(out.dashboard).toBe('mh-app::part(tile){color:#fff;text-transform:uppercase}');
  expect(out.messages.map((message) => message.kind)).toEqual(['not-allowed']);
});

test('own values only for names that can be set, checked by their kind; protected never', () => {
  expect(wide('::part(section) { --tile-bg: #FFFFFF }').dashboard).toBe('mh-app::part(section){--tile-bg:#ffffff}');
  for (const bad of ['--tile-alert-bg: green', '--hold-step: 1ms', '--target-min: 0px', '--tile-bg: url(x)', '--nope: 1']) expect([bad, wide(`::part(section) { ${bad} }`).dashboard]).toEqual([bad, '']);
  expect(wide('::part(tile) { color: var(--tile-alert-bg) }').dashboard).toBe('');
  expect(wide('::part(tile) { color: var(--c-error) }').dashboard).toBe('');
  expect(wide('::part(tile) { color: var(--c-primary) }').dashboard).toBe('mh-app::part(tile){color:var(--c-primary)}');
});

test('url() only with data:, and only on the page, a section, the hero and the rest screen', () => {
  expect(wide('::part(page) { background-image: url(data:image/png;base64,AAAA) }').dashboard).toBe('mh-app::part(page){background-image:url("data:image/png;base64,AAAA")}');
  expect(wide('::part(page) { background-image: url(https://x.example/a.png) }').dashboard).toBe('');
  expect(wide('::part(page) { background: url("//x/a.png") }').dashboard).toBe('');
  expect(wide('::part(tile) { background-image: url(data:image/png;base64,AAAA) }').dashboard).toBe('');
  expect(wide('@import url(data:text/css,x); ::part(tile) { color: #fff }').dashboard).toBe('mh-app::part(tile){color:#fff}');
});

test('media for light, dark and width; keyframes renamed and only for colour; motion only without reduced motion', () => {
  expect(wide('@media (prefers-color-scheme: dark) { ::part(section) { color: #fff } }').dashboard).toBe('@media (prefers-color-scheme:dark){mh-app::part(section){color:#fff}}');
  expect(wide('@media url(x) { ::part(section) { color: #fff } }').dashboard).toBe('');
  const out = wide('@keyframes glow { from { box-shadow: 0 0 2px #3f3 } to { box-shadow: 0 0 8px #3f3; opacity: 0 } } ::part(tile on) { animation: glow 2s infinite alternate; transition: background-color .2s }');
  expect(out.dashboard).toBe('@keyframes t1-glow{from{box-shadow:0 0 2px #3f3}to{box-shadow:0 0 8px #3f3}}\n@media (prefers-reduced-motion:no-preference){mh-app::part(tile on){animation:t1-glow 2s infinite alternate;transition:background-color .2s}}');
  for (const bad of ['@font-face { font-family: x }', '@layer x;', '@property --x { syntax: "*" }', '@container (width > 1px) { ::part(tile) { color: red } }', '@namespace x;']) expect([bad, wide(bad).dashboard]).toEqual([bad, '']);
});

test('!important and old ways to run code are dropped; broken CSS keeps what can be read', () => {
  expect(wide('::part(tile) { color: #fff !important }').dashboard).toBe('mh-app::part(tile){color:#fff}');
  expect(wide('::part(tile) { color: expression(alert(1)); behavior: url(x.htc) }').dashboard).toBe('');
  expect(wide('::part(tile) { color: #fff; background: "unclosed\n} ::part(section) { color: #000 }').dashboard).toContain('mh-app::part(section){color:#000}');
  expect(wide('}}}{{{').dashboard).toBe('');
});

test('names given with escapes are read as what they are', () => {
  expect(wide('::part(tile) { \\70 osition: fixed }').dashboard).toBe('');
  expect(wide('::part(t\\69 le) { color: #fff }').dashboard).toBe('mh-app::part(tile){color:#fff}');
});

test('limits: too much CSS, too deep, too long a value', () => {
  expect(wide('::part(tile) { color: #fff }'.repeat(500)).messages.some((message) => message.kind === 'too-many')).toBe(true);
  expect(wide(`::part(tile) { font-family: ${'"x",'.repeat(300)} serif }`).dashboard).toBe('');
});

test('a thousand seeded malicious texts never give anything outside the rules', () => {
  let state = 42;
  const random = (): number => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const bits = ['::part(tile)', '::part(section)', '::part(rest)', '{', '}', ';', ':', ' ', 'color', 'position', 'fixed', 'url(', ')', '//x', 'data:', '"', "'", '\\', '\\70 ', '@import', '@media', '@keyframes', '!important', 'expression(', '#fff', '0', 'px', '--tile-alert-bg', 'var(', 'opacity', '/*', '*/', '<', '>', '\n', 'content', 'mh-app', ',', 'display', 'none'];
  for (let i = 0; i < 1000; i += 1) {
    const text = Array.from({ length: 1 + Math.floor(random() * 40) }, () => bits[Math.floor(random() * bits.length)]).join('');
    const out = wide(text);
    for (const sheet of [out.dashboard, out.rest]) {
      expect(sheet).not.toMatch(/position|opacity|display|expression|@import|!important|--tile-alert|\/\/x|<|\\|\/\*/);
      for (const rule of sheet.split('\n').filter(Boolean)) expect(rule).toMatch(/^(mh-app::part\(|@media |@keyframes t1-)/);
    }
  }
});

test('the list of parts is version 1 and has the states', () => {
  expect(PART_NAMES).toEqual(expect.arrayContaining(['page', 'tile', 'tile-name', 'section', 'hero-number', 'slider', 'rest-clock', 'chart-line', 'nav-item']));
  expect(PART_NAMES).not.toContain('theme');
});

test('deep nesting is refused quickly instead of running out of stack', () => {
  let colour = '#fff';
  for (let i = 0; i < 2600; i += 1) colour = `color-mix(in srgb,${colour},#000)`;
  const started = Date.now();
  const out = narrow(`::part(tile){color:${colour}}`);
  expect(out.dashboard).toBe('');
  expect(Date.now() - started).toBeLessThan(500);
  expect(wide('::part(tile){color:color-mix(in srgb,color-mix(in srgb,#fff,#000),#000)}').dashboard).not.toBe('');
});

test('a transition is only of colour, short and without delay, never of all', () => {
  for (const bad of ['transition: all 1s', 'transition: background-color 0s 60s', 'transition-delay: 1s', 'transition: color 30s', 'transition-property: all']) {
    expect([bad, wide(`::part(tile) { ${bad} }`).dashboard]).toEqual([bad, '']);
  }
  expect(wide('::part(tile) { transition: background-color .2s ease }').dashboard).toContain('transition:background-color .2s ease');
});

test('someone else’s CSS sets no values of the theme until it is allowed', () => {
  expect(narrow('::part(tile alert) { --motion-effects: 10000ms; color: #fff }').dashboard).toBe('mh-app::part(tile alert){color:#fff}');
});

test('sizes of letters and decoration only on the parts that hold text, not on what holds other parts', () => {
  for (const part of ['page', 'section', 'tile', 'hero', 'rail', 'header', 'rest']) {
    expect([part, wide(`::part(${part}) { font-size: 1.5em }`).dashboard]).toEqual([part, '']);
    expect([part, wide(`::part(${part})::before { content: "" }`).dashboard]).toEqual([part, '']);
  }
  expect(wide('::part(tile-name) { font-size: 1.5em }').dashboard).toBe('mh-app::part(tile-name){font-size:1.5em}');
  expect(wide('::part(tile-icon)::after { content: "" }').dashboard).toBe('mh-app::part(tile-icon)::after{content:""}');
});

test('names of the language itself are no units', () => {
  for (const bad of ['transition-duration: 1constructor', 'box-shadow: 1constructor 1constructor #000', 'padding: 1__proto__', 'letter-spacing: 1hasownproperty']) {
    expect([bad, wide(`::part(tile-name) { ${bad} }`).dashboard]).toEqual([bad, '']);
  }
  expect(wide('@media (min-width: 1__proto__) { ::part(tile) { color: #fff } }').dashboard).toBe('');
});

test('what holds tiles gets no space or border that would make the tiles in it smaller; a tile itself may', () => {
  for (const part of ['page', 'section', 'hero', 'rail', 'header', 'rest', 'slider']) {
    for (const declaration of ['padding: 8px', 'gap: 8px', 'border: 1px solid #fff', 'border-width: 2px', 'border-style: solid', 'border-left: 2px solid #fff']) {
      expect([part, declaration, wide(`::part(${part}) { ${declaration} }`).dashboard]).toEqual([part, declaration, '']);
    }
    expect(wide(`::part(${part}) { border-color: #fff; box-shadow: inset 0 0 0 1px #fff; outline: 1px solid #fff }`).messages).toEqual([]);
  }
  expect(wide('::part(tile) { padding: 8px; border: 1px solid #fff }').messages).toEqual([]);
});

test('every part own CSS can reach is explained in both languages', async () => {
  const { PART_NAMES } = await import('../../../src/theme/css/parts');
  const { nl } = await import('../../../src/i18n/nl');
  const { en } = await import('../../../src/i18n/en');
  const missing = PART_NAMES.filter((name) => !(`css.part.${name}` in nl) || !(`css.part.${name}` in en));
  expect(missing).toEqual([]);
});
