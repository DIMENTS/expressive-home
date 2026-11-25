import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseWidgetFile } from '../../src/widgets/widget-file';

test.each(['gauge', 'big-switch'])('the example widget %s is a good widget file', (name) => {
  const parsed = parseWidgetFile(JSON.parse(readFileSync(new URL(`../../docs/widgets/${name}.widget.json`, import.meta.url), 'utf8')));
  expect(parsed.ok).toBe(true);
});
