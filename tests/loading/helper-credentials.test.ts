import { describe, expect, test } from 'bun:test';
import { readHelperExpected } from '../../scripts/oracle/headers-helper-env.ts';
import { removedFromHeadersHelper } from '../../src/format/helper-credentials.ts';

/**
 * mcp.md, "Which variables a helper can read", gives the rule by example; the set is what Claude
 * Code removes (`bun run oracle:headers-helper-env`, recorded in
 * tests/fixtures/headers-helper-env/expected.json). The kit agrees on every recorded name.
 */
const expected = await readHelperExpected();

describe('variables a supplied headersHelper runs without (oracle)', () => {
  test(`agrees with Claude Code ${expected.claudeCodeVersion} on every removed name`, () => {
    expect(expected.removed.filter((name) => !removedFromHeadersHelper(name))).toEqual([]);
  });
  test('and on every name the helper receives', () => {
    expect(expected.kept.filter((name) => removedFromHeadersHelper(name))).toEqual([]);
  });
});
