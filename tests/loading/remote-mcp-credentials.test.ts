import { describe, expect, test } from 'bun:test';
import { readExpected } from '../../scripts/oracle/remote-mcp-env.ts';
import { readsAsEmptyInRemoteMcp } from '../../src/format/remote-mcp-credentials.ts';

/**
 * mcp.md, "Credential variables that read as empty", names the covered variables only "such as";
 * the set is what Claude Code empties (`bun run oracle:remote-mcp-env`, a black-box run that records
 * tests/fixtures/remote-mcp-env/expected.json). The kit agrees on every recorded name.
 */
const expected = await readExpected();

describe('variables a remote MCP url or header reads as empty (oracle)', () => {
  test(`agrees with Claude Code ${expected.claudeCodeVersion} on every emptied name`, () => {
    expect(expected.empty.filter((name) => !readsAsEmptyInRemoteMcp(name))).toEqual([]);
  });
  test('and on every name that expands', () => {
    expect(expected.kept.filter((name) => readsAsEmptyInRemoteMcp(name))).toEqual([]);
  });
});
