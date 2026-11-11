/**
 * mcp.md § Use dynamic headers for custom authentication: "The command must write a JSON object of
 * string key-value pairs to stdout". plugins/host-marketplace.md § Write the headersHelper command
 * says the same of a marketplace helper, so one reader serves both.
 */
import { describe, expect, test } from 'bun:test';
import { readHelperHeaders } from '../../src/format/helper-headers.ts';
import { spec } from '../support/spec.ts';

spec('mcp.behavior.Use dynamic headers for custom authentication', () => {
  test('a JSON object of string pairs is the headers', () => {
    expect(readHelperHeaders('{"Authorization": "Bearer abc", "X-Team": "blue"}\n')).toEqual({
      headers: { Authorization: 'Bearer abc', 'X-Team': 'blue' },
    });
    expect(readHelperHeaders('{}')).toEqual({ headers: {} });
  });

  test('anything that is not an object of strings is refused, whole', () => {
    expect(readHelperHeaders('')).toEqual({ problem: 'not-an-object' });
    expect(readHelperHeaders('Bearer abc')).toEqual({ problem: 'not-an-object' });
    expect(readHelperHeaders('["a"]')).toEqual({ problem: 'not-an-object' });
    expect(readHelperHeaders('null')).toEqual({ problem: 'not-an-object' });
    expect(readHelperHeaders('{"Retry": 3}')).toEqual({ problem: 'non-string-value' });
    expect(readHelperHeaders('{"Ok": "1", "Bad": null}')).toEqual({ problem: 'non-string-value' });
  });
});

describe('reading helper output (judgment)', () => {
  test('output with a trailing log line before the JSON is not an object: the whole stdout is parsed', () => {
    expect(readHelperHeaders('log\n{"A":"b"}')).toEqual({ problem: 'not-an-object' });
  });
});
