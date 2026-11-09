/**
 * Judgment, oracle 2.1.321 (spec/judgments.md, `src/settings/env/check-env.ts`): settings-reference.md
 * types `env` as "string values" and says nothing of another value. claude sets it as JavaScript's
 * `String(value)`: a SessionStart hook under `{"env":{"A":1,"B":true,"N":null,"O":{},"L":[1,2],
 * "F":1.5,"Z":false}}` printed `1`, `true`, `null`, `[object Object]`, `1,2`, `1.5`, `false`. The kit
 * reads the same text and warns the author.
 */
import { describe, expect, test } from 'bun:test';
import { issuesOf, layerOf } from '../../support/settings-layers.ts';

describe('judgments: an env value that is not a string', () => {
  test('is read as the text claude sets', () => {
    const env = { A: 1, B: true, N: null, O: {}, L: [1, 2], F: 1.5, Z: false, S: 's' };
    expect(layerOf('user', { env }).settings.env).toEqual({
      A: '1',
      B: 'true',
      N: 'null',
      O: '[object Object]',
      L: '1,2',
      F: '1.5',
      Z: 'false',
      S: 's',
    });
  });

  test('is reported by name with the text it is read as; a string is not reported', () => {
    expect(
      issuesOf('user', { env: { PORT: 8080, OK: '1' } }).map(({ message }) => message),
    ).toEqual(['"PORT" is not a string; it is read as "8080"']);
  });

  test('a variable the file cannot set stays ignored whatever its type', () => {
    const read = layerOf('project', { env: { CLAUDE_CONFIG_DIR: 1 } });
    expect(read.settings.env).toEqual({});
  });
});
