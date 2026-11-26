import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// The workflow that puts the app on GitHub Pages: only in a public repository, with no more rights than each job needs,
// actions pinned to their commit, and nothing of an event ever in a command.

const PATH = '.github/workflows/pages.yml';
const yaml = (): string => readFileSync(PATH, 'utf8');

/** The jobs by name, each with its own lines. */
function jobs(text: string): Map<string, string> {
  const result = new Map<string, string>();
  let name = '';
  for (const line of (text.split(/^jobs:\s*$/m)[1] ?? '').split('\n')) {
    const job = /^ {2}([a-z][a-z0-9_-]*):\s*$/.exec(line);
    if (job) { name = job[1]!; result.set(name, ''); continue; }
    if (name) result.set(name, `${result.get(name)}${line}\n`);
  }
  return result;
}

/** The rights a job asks for, one per line. */
const rights = (job: string): string[] => (/^ {4}permissions:\n((?: {6}.*\n)+)/m.exec(job)?.[1] ?? '').trim().split('\n').map((line) => line.trim());

/** The text of every `run:`, also when it spans several lines. */
function runs(text: string): string[] {
  const lines = text.split('\n');
  return lines.flatMap((line, at) => {
    const match = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(line);
    if (!match) return [];
    const block = [match[2]!];
    if (/^[|>]/.test(match[2]!)) {
      for (const next of lines.slice(at + 1)) {
        if (next.trim() !== '' && next.length - next.trimStart().length <= match[1]!.length) break;
        block.push(next);
      }
    }
    return [block.join('\n')];
  });
}

test('there is a workflow that builds and one that publishes', () => {
  expect(existsSync(PATH)).toBe(true);
  expect([...jobs(yaml()).keys()]).toEqual(['build', 'deploy']);
});

test('it runs after a push to main and by hand, and only in a public repository', () => {
  expect(yaml()).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n/m);
  for (const [name, job] of jobs(yaml())) expect([name, job]).toEqual([name, expect.stringMatching(/^ {4}if: github\.event\.repository\.visibility == 'public'$/m)]);
});

test('it grants nothing by default; building may only read, publishing only publish', () => {
  expect(yaml()).toMatch(/^permissions:\s*\{\}\s*$/m);
  const all = jobs(yaml());
  expect(rights(all.get('build')!)).toEqual(['contents: read']);
  expect(rights(all.get('deploy')!).sort()).toEqual(['id-token: write', 'pages: write']);
  expect(all.get('build')).toMatch(/persist-credentials: false/);
  expect(all.get('deploy')).toMatch(/^ {4}needs: build$/m);
  expect(all.get('deploy')).toMatch(/^ {4}environment:\n {6}name: github-pages\n {6}url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}$/m);
  expect(runs(all.get('deploy')!)).toEqual([]);
});

test('every action is pinned to its full commit, with its version beside it', () => {
  const uses = [...yaml().matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)];
  expect(uses.map((use) => use[1]!.split('@')[0])).toEqual(['actions/checkout', 'actions/setup-node', 'actions/upload-pages-artifact', 'actions/deploy-pages']);
  for (const [, ref, comment] of uses) expect([ref, comment]).toEqual([expect.stringMatching(/^actions\/[a-z-]+@[0-9a-f]{40}$/), expect.stringMatching(/^ # v\d+\.\d+\.\d+$/)]);
});

test('nothing of an event reaches a command, and no secret is used', () => {
  for (const run of runs(yaml())) expect(run).not.toMatch(/\$\{\{/);
  expect(yaml()).not.toMatch(/pull_request_target|secrets\./);
});

test('it builds from the lock file without install scripts, checks the library of Athom and uploads the app alone', () => {
  const build = jobs(yaml()).get('build')!;
  expect(runs(build)).toEqual(['npm ci --ignore-scripts', 'npm run vendor', 'npm run build:pages']);
  expect(build).toMatch(/node-version: 24$/m);
  expect(build).toMatch(/^ {10}path: dist-pages$/m);
});

test('one run at a time, and a run that started is not broken off', () => {
  expect(yaml()).toMatch(/^concurrency:\n {2}group: pages\n {2}cancel-in-progress: false$/m);
});
