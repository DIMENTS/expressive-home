/** Earlier states, the newest on top; beyond the limit the oldest falls away. */
export interface UndoStack<T> { push(state: T): void; pop(): T | undefined; clear(): void; readonly size: number; readonly top: T | undefined }

export function createUndoStack<T>(limit = 50): UndoStack<T> {
  let states: T[] = [];
  return {
    push(state) { states = [...states, state].slice(-limit); },
    pop: () => states.pop(),
    clear() { states = []; },
    get size() { return states.length; },
    get top() { return states.at(-1); },
  };
}
