import { afterEach, expect, test } from 'vitest';
import { bed, closeBeds, device, sleep, until, type Page } from './bed';

// Three devices that change dashboards while the wifi comes and goes, answers get lost and tabs sleep. Afterwards they
// all show what the hub keeps, and what a device lost it was told.

afterEach(closeBeds);

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0; return state / 2 ** 32; };
}

async function run(seed: number): Promise<string[]> {
  const next = random(seed * 7919);
  const b = await bed();
  const pages: Page[] = [];
  const told: number[][] = [];
  const added: { page: number; id: string; at: number }[] = [];
  for (let i = 0; i < 3; i += 1) {
    const page = device(b, { up: Math.floor(next() * 25), down: Math.floor(next() * 60), stream: Math.floor(next() * 30) });
    await page.pair();
    const times: number[] = [];
    told.push(times);
    page.served.onConflict(() => { times.push(Date.now()); });
    pages.push(page);
  }
  for (let step = 0; step < 60; step += 1) {
    const i = Math.floor(next() * 3);
    const page = pages[i]!;
    const what = next();
    if (what < 0.35) {
      const id = `d-${seed}-${step}`;
      const count = page.boards().length;
      page.add(id, id);
      if (page.boards().length > count) added.push({ page: i, id, at: Date.now() });
    } else if (what < 0.45) page.leave();
    else if (what < 0.65) page.comeBack();
    else if (what < 0.72) {
      // an answer gets lost
      page.net.away = true;
      setTimeout(() => page.comeBack(), 30);
    } else if (what < 0.78) {
      page.link.sleep();
      page.served.flush();
    } else if (what < 0.9) page.link.wake();
    else if (what < 0.95) page.controller.retry();
    await sleep(Math.floor(next() * 60));
  }
  for (const page of pages) {
    page.comeBack();
    page.link.wake();
  }
  const shown = (): string => JSON.stringify(pages.map((page) => page.boards()));
  const kept = (): string => JSON.stringify(pages.map(() => (b.boards().length === 0 ? ['overview'] : b.boards())));
  const problems: string[] = [];
  await until('all the same and connected', () => shown() === kept() && pages.every((page) => page.route() === 'local'), 8000)
    .catch(() => problems.push(`${seed}: ${shown()} but the hub has ${kept()}; routes ${pages.map((page) => page.route()).join()}`));
  for (const { page, id, at } of added) if (!b.boards().includes(id) && !told[page]!.some((time) => time >= at)) problems.push(`${seed}: ${id} of page ${page} was lost without a word`);
  await sleep(800);
  const asked = pages.map((page) => page.log.length);
  await sleep(800);
  pages.forEach((page, i) => { if (page.log.length - asked[i]! > 2) problems.push(`${seed}: page ${i} keeps asking ${page.log.slice(-5).join()}`); });
  return problems;
}

test('whatever happens, all devices end up the same, and nothing is lost without a word', async () => {
  const problems = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(run));
  expect(problems.flat()).toEqual([]);
}, 60_000);
