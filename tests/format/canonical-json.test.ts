/**
 * One canonical JSON text (judgment, spec/judgments.md): keys sorted by code unit at every depth,
 * an `undefined` member left out and an `undefined` array item written `null`, as JSON.stringify
 * writes them, so two values equal in content are equal text.
 */
import { expect, test } from 'bun:test';
import { canonicalJson } from '../../src/format/canonical-json.ts';

test('keys are sorted at every depth, by code unit and not by locale', () => {
  expect(canonicalJson({ b: 1, a: { d: [1, { z: 0, y: 1 }], c: 'x' } })).toBe(
    '{"a":{"c":"x","d":[1,{"y":1,"z":0}]},"b":1}',
  );
  expect(canonicalJson({ b: 0, a: 0, B: 0, é: 0 })).toBe('{"B":0,"a":0,"b":0,"é":0}');
});

test('an undefined member is left out and an undefined item is null, as in JSON', () => {
  expect(canonicalJson({ a: undefined, b: 1 })).toBe(canonicalJson({ b: 1 }));
  expect(canonicalJson([1, undefined])).toBe('[1,null]');
  expect(canonicalJson(undefined)).toBe('undefined');
});

test('scalars are their JSON text, and an order of keys never changes the text', () => {
  expect(canonicalJson('x')).toBe('"x"');
  expect(canonicalJson(null)).toBe('null');
  expect(canonicalJson({ x: 1, y: [2] })).toBe(canonicalJson({ y: [2], x: 1 }));
});
