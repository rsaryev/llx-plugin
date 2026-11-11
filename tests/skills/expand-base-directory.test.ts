/**
 * The text a skill gives the model opens with its folder; a command's does not (Claude Code 2.1.319,
 * observed by `bun run oracle:model-content`: "Base directory for this skill: <dir>", a blank line,
 * then the body). The docs do not show the line; spec/judgments.md records it.
 */
import { describe, expect, test } from 'bun:test';
import { BASE_DIRECTORY } from '../../src/skills/folder-line.ts';
import { commandFrom, expandWith, skillFrom } from '../support/expand.ts';

const textOf = (run: Awaited<ReturnType<typeof expandWith>>): string =>
  run.expansion.ok ? run.expansion.text : '';

describe('the folder line of an expanded skill', () => {
  test('a skill opens with its folder and a blank line', async () => {
    const run = await expandWith(skillFrom('', 'Body.', { kind: 'project' }, 'tidy'));
    expect(textOf(run)).toBe(`${BASE_DIRECTORY}/work/app/.claude/skills/tidy\n\nBody.`);
  });

  test('a command has no folder line', async () => {
    const run = await expandWith(commandFrom('', 'Body.'));
    expect(textOf(run)).toBe('Body.');
  });
});
