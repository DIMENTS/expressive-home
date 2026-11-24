import { expect, test } from 'vitest';
import config from '../../vite.config';

test('only the tests of this checkout run, not those of other worktrees inside it', () => {
  const { include } = (config as { test: { include?: string[] } }).test;
  expect(include).toEqual(['tests/**/*.test.ts']);
});
