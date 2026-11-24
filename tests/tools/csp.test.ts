import { expect, test } from 'vitest';
import { contentSecurityPolicy } from '../../tools/csp.mjs';

test('the build policy allows only our own origin and the two hub addresses', () => {
  const p = contentSecurityPolicy('build');
  for (const part of ["default-src 'self'", "script-src 'self'", "style-src 'self'", "font-src 'self'", "img-src 'self' data:", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
    'https://*.homey.homeylocal.com', 'wss://*.homey.homeylocal.com', 'https://*.connect.athom.com', 'wss://*.connect.athom.com']) expect(p).toContain(part);
  expect(p).not.toMatch(/unsafe-eval|unsafe-inline|\*\s|http:/);
});
test('the dev policy only adds what the dev server needs', () => {
  const d = contentSecurityPolicy('dev');
  expect(d).toContain('ws://localhost:5273'); expect(d).toContain("style-src 'self' 'unsafe-inline'"); expect(d).not.toContain('unsafe-eval');
});
test('connections are limited to our own origin and the hub, in both policies', () => {
  const connect = (policy: string) => policy.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src '));
  const hub = "https://*.homey.homeylocal.com wss://*.homey.homeylocal.com https://*.connect.athom.com wss://*.connect.athom.com";
  expect(connect(contentSecurityPolicy('build'))).toBe(`connect-src 'self' ${hub}`);
  expect(connect(contentSecurityPolicy('dev'))).toBe(`connect-src 'self' ${hub} ws://localhost:5273`);
});
test('the build never inlines a file as a data: address, which the policy would block for fonts', async () => {
  const { default: config } = await import('../../vite.config');
  expect((config as { build?: { assetsInlineLimit?: number } }).build?.assetsInlineLimit).toBe(0);
});

test('the page that the app on the hub serves may only talk to that app', () => {
  const policy = contentSecurityPolicy('homey');
  expect(policy).toContain("connect-src 'self';");
  expect(policy).toContain("script-src 'self';");
  expect(policy).not.toContain('homeylocal');
  expect(policy).not.toContain('athom');
});
