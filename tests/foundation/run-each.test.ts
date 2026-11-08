import { expect, test } from 'bun:test';
import { runEach } from '../../src/foundation/index.ts';

test('runEach runs every item in order when none throws', () => {
  const ran: number[] = [];
  runEach([1, 2, 3], (item) => void ran.push(item));
  expect(ran).toEqual([1, 2, 3]);
});

test('runEach runs the rest after an item throws, then throws that error as it was', () => {
  const ran: number[] = [];
  const failure = new Error('two');
  expect(() =>
    runEach([1, 2, 3], (item) => {
      ran.push(item);
      if (item === 2) throw failure;
    }),
  ).toThrow(failure);
  expect(ran).toEqual([1, 2, 3]);
});

test('runEach reports several failures together, in order', () => {
  const thrown = (() => {
    try {
      runEach([1, 2, 3], (item) => {
        throw new Error(`item ${item}`);
      });
      return undefined;
    } catch (error) {
      return error;
    }
  })();
  expect(thrown).toBeInstanceOf(AggregateError);
  expect(thrown instanceof AggregateError && thrown.errors.map(String)).toEqual([
    'Error: item 1',
    'Error: item 2',
    'Error: item 3',
  ]);
});
