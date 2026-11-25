import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { contentSecurityPolicy } from '../../tools/csp.mjs';
import { framePage, frameScript } from '../../tools/widget-frame.mjs';

test('the page allows its one script by the hash of exactly that script', async () => {
  const page = await framePage();
  const script = /<script>([\s\S]*)<\/script>/.exec(page)![1]!;
  const hash = createHash('sha256').update(script, 'utf8').digest('base64');
  expect(page).toContain(`script-src 'sha256-${hash}' 'unsafe-eval'`);
  expect(page.match(/<script/g)).toHaveLength(1);
});

test('the frame may reach nothing, not even its own address', async () => {
  const page = await framePage();
  const policy = /content="([^"]*)"/.exec(page)![1]!;
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain("connect-src 'none'");
  expect(policy).toContain("frame-src 'none'");
  expect(policy).not.toContain("'self'");
  expect(policy).not.toMatch(/https?:|wss?:/);
});

test('the runtime is one script that stands alone and starts itself', async () => {
  const script = await frameScript();
  expect(script).toContain('startFrame(window);');
  expect(script).not.toMatch(/^\s*(import|export)\b/m);
});

test('the policy of the dashboard is not loosened for it', () => {
  for (const mode of ['build', 'homey'] as const) {
    const policy = contentSecurityPolicy(mode);
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain('unsafe-inline');
  }
});

test('the frame and its page name the same colour schemes, so the frame stays see-through in dark mode', async () => {
  expect(await framePage()).toContain('color-scheme: light dark');
});
