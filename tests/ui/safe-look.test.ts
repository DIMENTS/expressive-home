// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { BUILT_IN } from '../../src/theme/look';
import { computeLook, styleOf } from '../../src/theme/styles';
import { applyThemeTo } from '../../src/ui/apply-theme';
import { isSafeAddress, safeLook } from '../../src/ui/safe-look';

const settings = { seed: '#3a5ba9', mode: 'dark', density: 'comfortable' } as const;

test('the danger question and the theme panel draw with Rustig, whatever the page shows', () => {
  for (const file of BUILT_IN) {
    const root = document.createElement('div');
    const dialog = document.createElement('mh-dialog');
    root.append(dialog);
    applyThemeTo(root, settings, false, styleOf(file));
    safeLook(dialog, settings, false);
    const rustig = computeLook(styleOf(BUILT_IN[0]!), settings, false);
    for (const name of ['--dialog-bg', '--section-bg', '--tile-on-bg', '--font-family', '--weight-strong', '--shape-xl', '--c-primary', '--page-bg']) {
      expect([file.id, name, dialog.style.getPropertyValue(name)]).toEqual([file.id, name, rustig[name]]);
    }
  }
});

test('#veilig in the address opens the dashboard in Rustig, once', () => {
  expect(isSafeAddress('#veilig')).toBe(true);
  expect(isSafeAddress('#VEILIG')).toBe(true);
  expect(isSafeAddress('#safe')).toBe(true);
  expect(isSafeAddress('')).toBe(false);
  expect(isSafeAddress('#veiligheid')).toBe(false);
});
