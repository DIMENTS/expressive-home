import { expect, test } from 'vitest';
import { createUndoStack } from '../../src/layout/undo';

test('the undo stack keeps the last 50 states and pops the newest first', () => {
  const stack = createUndoStack<number>();
  for (let i = 1; i <= 60; i += 1) stack.push(i);
  expect(stack.size).toBe(50);
  expect(stack.pop()).toBe(60);
  expect(stack.pop()).toBe(59);
  let last: number | undefined;
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) last = next;
  expect(last).toBe(11);
  expect(stack.size).toBe(0);
  expect(stack.pop()).toBeUndefined();
});

test('the limit can be another one, and clearing empties the stack', () => {
  const stack = createUndoStack<string>(2);
  for (const state of ['a', 'b', 'c']) stack.push(state);
  expect([stack.size, stack.pop(), stack.pop(), stack.pop()]).toEqual([2, 'c', 'b', undefined]);
  stack.push('d');
  stack.clear();
  expect(stack.size).toBe(0);
});

test('the newest state can be looked at without taking it', () => {
  const stack = createUndoStack<string>();
  expect(stack.top).toBeUndefined();
  stack.push('a');
  stack.push('b');
  expect([stack.top, stack.size]).toEqual(['b', 2]);
  stack.pop();
  expect(stack.top).toBe('a');
});
