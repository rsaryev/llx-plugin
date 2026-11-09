/**
 * Judgment (spec/judgments.md, `src/format/frontmatter.ts`): reading frontmatter writes nothing to
 * the host's process. A key that is a collection makes the YAML parser warn through
 * `process.emitWarning`; the kit reads the key as its text and keeps the warning off the host.
 */
import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { parseFrontmatter } from '../../src/format/frontmatter.ts';

describe('judgments: frontmatter reads quietly', () => {
  const warn = spyOn(process, 'emitWarning');
  afterEach(() => warn.mockClear());

  test('a collection key loads as its text and emits no process warning', () => {
    const parsed = parseFrontmatter('---\n{ SKILL_NAME }: x\ndescription: d\n---\nBody');
    expect(parsed.state).toBe('ok');
    expect(parsed.fields).toEqual({ '{ SKILL_NAME }': 'x', description: 'd' });
    expect(warn).not.toHaveBeenCalled();
  });
});
