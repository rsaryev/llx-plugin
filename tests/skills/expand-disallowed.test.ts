/**
 * skills.md § Frontmatter reference (`disallowed-tools`: "Tools removed from Claude's available pool
 * while this skill is active. ... Like deny rules, the field can't remove `EndConversation` while
 * any other tool remains") and § Restrict tools: the skill's `disallowed` list is applied to the
 * pool as deny rules, through `availableTools`.
 */
import { expect, test } from 'bun:test';
import { availableTools } from '../../src/rules/index.ts';
import { expandWith, skillFrom } from '../support/expand.ts';
import { parsed } from '../support/rule-context.ts';
import { spec } from '../support/spec.ts';

spec('skills.frontmatter.disallowed-tools', () => {
  const CANDIDATES = ['AskUserQuestion', 'Bash', 'Read', 'Edit', 'EndConversation'];
  /** The pool Claude sees while the skill is active: its `disallowed` list as deny rules. */
  const poolDuring = async (frontmatter: string, candidates = CANDIDATES) => {
    const { expansion } = await expandWith(skillFrom(frontmatter, 'Loop.'));
    const disallowed = 'disallowed' in expansion ? expansion.disallowed : [];
    const rules = disallowed.map((text) => parsed(text, 'deny'));
    return availableTools(candidates, { platform: 'posix', rules });
  };

  test('the listed tools leave the pool while the skill is active, and the rest stays', async () => {
    expect(await poolDuring('disallowed-tools: AskUserQuestion')).toEqual([
      'Bash',
      'Read',
      'Edit',
      'EndConversation',
    ]);
    expect(await poolDuring('disallowed-tools: Bash, Edit')).toEqual([
      'AskUserQuestion',
      'Read',
      'EndConversation',
    ]);
  });

  test('like deny rules, the field cannot remove EndConversation while any other tool remains', async () => {
    const pool = await poolDuring('disallowed-tools: EndConversation, Bash');
    expect(pool).toContain('EndConversation');
    expect(pool).not.toContain('Bash');
  });

  test('once no other tool remains it goes too, as a deny rule would drop it', async () => {
    const pool = await poolDuring('disallowed-tools: AskUserQuestion, EndConversation', [
      'AskUserQuestion',
      'EndConversation',
    ]);
    expect(pool).toEqual([]);
    expect(await poolDuring('disallowed-tools: "*"')).toEqual([]);
  });

  test('a scoped tool rule does not remove the tool, only the whole name does', async () => {
    expect(await poolDuring('disallowed-tools: Bash(rm *)')).toEqual(CANDIDATES);
  });
});
