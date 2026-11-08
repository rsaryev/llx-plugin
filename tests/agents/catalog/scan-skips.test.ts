/**
 * sub-agents.md, "Subagent files Claude Code skips" (no name, a name but no description, YAML that
 * does not parse, the name rules) and "Write subagent files" (the file format, what is watched).
 */
import { expect, test } from 'bun:test';
import { HOME, MANAGED, PROJECT } from '../../support/scan.ts';
import { agent, namesOf, scan } from '../../support/agent-scan.ts';
import { spec } from '../../support/spec.ts';

spec('agents.behavior.Subagent files Claude Code skips', () => {
  test('a markdown file beside the agents without a name is documentation: skipped, and silently', async () => {
    const outcome = await scan({
      [`${PROJECT}/.claude/agents/README.md`]: '# Our agents\n\nSee the files below.\n',
      [`${PROJECT}/.claude/agents/real.md`]: agent('real'),
    });
    expect(namesOf(outcome)).toEqual(['project:real']);
    expect(outcome.issues).toEqual([]);
  });

  test('an opening --- that is not the first line leaves the file with no frontmatter: documentation', async () => {
    const outcome = await scan({
      [`${PROJECT}/.claude/agents/late.md`]: '\n---\nname: late\ndescription: Late\n---\nBody\n',
    });
    expect(outcome.entries).toEqual([]);
    expect(outcome.issues).toEqual([]);
  });

  test.each([
    ['managed', MANAGED],
    ['user', HOME],
    ['project', PROJECT],
    ['an --add-dir directory', '/shared'],
  ])('the same rules hold in the %s agents directory', async (_label, base) => {
    const outcome = await scan(
      {
        [`${base}/.claude/agents/no-name.md`]: '---\ndescription: Notes\n---\nBody\n',
        [`${base}/.claude/agents/no-description.md`]: '---\nname: lonely\n---\nBody\n',
        [`${base}/.claude/agents/fine.md`]: agent('fine'),
      },
      { addedDirectories: ['/shared'] },
    );
    expect(outcome.entries.map((entry) => entry.agent.name)).toEqual(['fine']);
    expect(outcome.issues).toHaveLength(1);
  });

  test('a name that starts with "-", contains ":" or is longer than 256 characters skips the file with an error', async () => {
    const outcome = await scan({
      [`${PROJECT}/.claude/agents/dash.md`]: agent('-dash'),
      [`${PROJECT}/.claude/agents/colon.md`]: agent('my-plugin:reviewer'),
      [`${PROJECT}/.claude/agents/long.md`]: agent('x'.repeat(257)),
      [`${PROJECT}/.claude/agents/ok.md`]: agent('x'.repeat(256)),
    });
    expect(outcome.entries.map((entry) => entry.agent.name)).toEqual(['x'.repeat(256)]);
    expect(outcome.issues.map((issue) => issue.severity)).toEqual(['error', 'error', 'error']);
    expect(outcome.issues.map((issue) => issue.path).toSorted()).toEqual([
      `${PROJECT}/.claude/agents/colon.md`,
      `${PROJECT}/.claude/agents/dash.md`,
      `${PROJECT}/.claude/agents/long.md`,
    ]);
  });
});

spec('agents.behavior.Subagent files Claude Code skips.No name', () => {
  test('a file whose frontmatter has no name is documentation and is never listed or reported', async () => {
    const outcome = await scan({
      [`${HOME}/.claude/agents/notes.md`]: '---\ndescription: How we work\n---\nNotes.\n',
    });
    expect(outcome.entries).toEqual([]);
    expect(outcome.issues).toEqual([]);
  });
});

spec('agents.behavior.Subagent files Claude Code skips.A name but no description', () => {
  test('the file is skipped and the reason is reported (the debug log of Claude Code)', async () => {
    const outcome = await scan({
      [`${PROJECT}/.claude/agents/half.md`]: '---\nname: half\n---\nBody.\n',
    });
    expect(outcome.entries).toEqual([]);
    expect(outcome.issues).toEqual([
      {
        severity: 'error',
        path: `${PROJECT}/.claude/agents/half.md`,
        message: 'Agent "half" has a name but no "description"',
      },
    ]);
  });
});

spec(`agents.behavior.Subagent files Claude Code skips.YAML that doesn't parse`, () => {
  test('no field is read from the file, it is skipped and the parse error is reported; the others load', async () => {
    const outcome = await scan({
      [`${PROJECT}/.claude/agents/broken.md`]:
        '---\nname: broken\ndescription: "unclosed\ntools: Read\n---\nBody.\n',
      [`${PROJECT}/.claude/agents/fine.md`]: agent('fine'),
    });
    expect(outcome.entries.map((entry) => entry.agent.name)).toEqual(['fine']);
    expect(outcome.issues).toHaveLength(1);
    expect(outcome.issues[0]?.severity).toBe('error');
    expect(outcome.issues[0]?.message).toContain('does not parse');
  });
});

spec('agents.behavior.Write subagent files', () => {
  test('the body is the system prompt and the frontmatter the configuration (the docs example)', async () => {
    const outcome = await scan({
      [`${PROJECT}/.claude/agents/code-reviewer.md`]: [
        '---',
        'name: code-reviewer',
        'description: Reviews code for quality and best practices',
        'tools: Read, Glob, Grep',
        'model: sonnet',
        '---',
        '',
        'You are a code reviewer. When invoked, analyze the code and provide',
        'specific, actionable feedback on quality, security, and best practices.',
        '',
      ].join('\n'),
    });
    expect(outcome.entries[0]?.agent.definition).toEqual({
      description: 'Reviews code for quality and best practices',
      prompt: [
        '',
        'You are a code reviewer. When invoked, analyze the code and provide',
        'specific, actionable feedback on quality, security, and best practices.',
        '',
      ].join('\n'),
      tools: ['Read', 'Glob', 'Grep'],
      model: 'sonnet',
    });
  });

  test('the personal and project agents directories that exist are watched', async () => {
    const outcome = await scan({
      [`${HOME}/.claude/agents/a.md`]: agent('a'),
      [`${PROJECT}/.claude/agents/b.md`]: agent('b'),
      [`${MANAGED}/.claude/agents/c.md`]: agent('c'),
    });
    expect(outcome.watch.toSorted()).toEqual([
      `${HOME}/.claude/agents`,
      `${PROJECT}/.claude/agents`,
    ]);
  });

  test('a scope with no agents directory when the session starts is not watched: its first file needs a restart', async () => {
    const outcome = await scan({ [`${HOME}/.claude/agents/a.md`]: agent('a') });
    expect(outcome.watch).toEqual([`${HOME}/.claude/agents`]);
  });

  test('the agents directory of a --add-dir directory is read but not watched', async () => {
    const outcome = await scan(
      { '/shared/.claude/agents/team.md': agent('team') },
      { addedDirectories: ['/shared'] },
    );
    expect(outcome.entries).toHaveLength(1);
    expect(outcome.watch).toEqual([]);
  });

  test('a session started with --disable-slash-commands watches none of them', async () => {
    const outcome = await scan(
      {
        [`${HOME}/.claude/agents/a.md`]: agent('a'),
        [`${PROJECT}/.claude/agents/b.md`]: agent('b'),
      },
      { watch: false },
    );
    expect(outcome.entries).toHaveLength(2);
    expect(outcome.watch).toEqual([]);
  });
});
