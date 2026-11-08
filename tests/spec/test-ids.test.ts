/** Regression tests for SP2's literal scanner (docs/SPEC.md, "Proof"); not compatibility claims. */
import { expect, test } from 'bun:test';
import { testIds } from '../../scripts/spec/test-ids.ts';

test('apostrophes inside double quotes and double quotes inside single quotes stay in the ID', () => {
  const call = 'spe' + 'c(';
  expect(testIds(`${call}"the server's tools", () => {})`)).toEqual(["the server's tools"]);
  expect(testIds(`${call}'the "command" field', () => {})`)).toEqual(['the "command" field']);
});

test('arrays preserve mixed quote styles and static template literals', () => {
  const call = 'spe' + 'c(';
  expect(testIds(`${call}['first', "second's", \`third\`], () => {})`)).toEqual([
    'first',
    "second's",
    'third',
  ]);
  expect(testIds(`${call}\`the call's input\`, () => {})`)).toEqual(["the call's input"]);
  expect(testIds(`${call}\`dynamic.\${event}\`, () => {})`)).toEqual([]);
});
