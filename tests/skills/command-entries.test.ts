/**
 * plugins/manifest-reference.md § `commands` (the object map and its fields), plugins/components.md
 * § Define commands in the manifest, skills.md § Frontmatter reference ("A command file ... accepts
 * the same fields except `name` and `paths`"), § Pre-approve tools for a skill, § Permission checks
 * on injected commands, model-config.md § Restrict model selection. `loadCommandEntries` reads the
 * entries through the `PluginFiles` port (in memory here); the loaded commands then run through the
 * same `expandSkill` and `menuEntries` a skill does, so each field is proven by what it does: a
 * body that expands, a menu row, the model of the turn, the grants a command runs under. How a
 * field reaches a `Command` is in tests/format/command.test.ts. A `source` that is not a path the
 * manifest allows, and an `allowedTools` rule that does not parse, are the kit's judgments
 * (spec/judgments.md) and are tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import type { Command, SkillOrigin } from '../../src/format/skill-types.ts';
import type { CommandEntry } from '../../src/format/manifest-schema.ts';
import { loadCommandEntries } from '../../src/skills/command-entries.ts';
import { menuEntries } from '../../src/skills/listing.ts';
import { abortOf, expandWith, grantsOf, textOf } from '../support/expand.ts';
import { memoryFiles } from '../support/files.ts';
import { spec } from '../support/spec.ts';

const PLUGIN: SkillOrigin = { kind: 'plugin', plugin: 'my-plugin' };
const signal = new AbortController().signal;

const STATUS_FILE = '---\nmodel: haiku\n---\nCheck the status of $ARGUMENTS.\n';

/** Load entries from an in-memory plugin folder. */
async function load(
  map: Readonly<Record<string, CommandEntry>>,
  files: Readonly<Record<string, string>> = {},
) {
  const folder = memoryFiles(files);
  const result = await loadCommandEntries(map, folder, { origin: PLUGIN }, signal);
  return { ...result, folder };
}

/** The one command a map of one entry loads. */
async function loadOne(
  key: string,
  entry: CommandEntry,
  files: Readonly<Record<string, string>> = {},
): Promise<Command> {
  const { commands, issues } = await load({ [key]: entry }, files);
  const [command] = commands;
  if (command === undefined) throw new Error(issues.map((found) => found.message).join('; '));
  return command;
}

spec('commands.entry.content', () => {
  test('the docs example: /my-plugin:about expands to its inline content', async () => {
    const command = await loadOne('about', {
      content: 'Summarize what this repository does in three sentences.',
      description: 'Summarize the repository',
    });
    expect(command.command).toBe('my-plugin:about');
    const run = await expandWith(command);
    expect(textOf(run.expansion)).toBe('Summarize what this repository does in three sentences.');
  });

  test('the content is a command body: arguments and injected commands work in it', async () => {
    const command = await loadOne('review', {
      content: 'Review $ARGUMENTS. Branch: !`git branch --show-current`',
    });
    const run = await expandWith(command, {
      request: { arguments: 'src/a.ts' },
      permissions: () => 'allow',
      replies: [{ stdout: 'main' }],
    });
    expect(textOf(run.expansion)).toBe('Review src/a.ts. Branch: main');
  });

  test('an entry that sets both or neither loads nothing, and reads no file', async () => {
    const { commands, issues, folder } = await load(
      {
        both: { source: './commands/a.md', content: 'x' },
        neither: { description: 'd' },
      },
      { 'commands/a.md': 'File.' },
    );
    expect(commands).toEqual([]);
    expect(issues.map((found) => [found.severity, found.path])).toEqual([
      ['error', 'commands.both'],
      ['error', 'commands.neither'],
    ]);
    expect(folder.reads).toEqual([]);
  });
});

spec('commands.entry.source', () => {
  test('the docs example: one command from a file and one inline, in key order', async () => {
    const { commands, issues, folder } = await load(
      {
        status: { source: './commands/status.md', argumentHint: '[env]' },
        about: { content: 'Explain what this plugin provides.' },
      },
      { 'commands/status.md': STATUS_FILE },
    );
    expect(issues).toEqual([]);
    expect(commands.map((command) => command.command)).toEqual([
      'my-plugin:status',
      'my-plugin:about',
    ]);
    expect(folder.reads).toEqual(['commands/status.md']);
  });

  test('the file is the command: its body expands with the typed arguments', async () => {
    const command = await loadOne(
      'status',
      { source: './commands/status.md' },
      {
        'commands/status.md': STATUS_FILE,
      },
    );
    const run = await expandWith(command, { request: { arguments: 'prod' } });
    expect(textOf(run.expansion)).toBe('Check the status of prod.\n');
  });

  test('a file that is missing is an error at the entry; the other entries still load', async () => {
    const { commands, issues } = await load({
      status: { source: './commands/status.md' },
      about: { content: 'About.' },
    });
    expect(commands.map((command) => command.command)).toEqual(['my-plugin:about']);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'error', path: 'commands.status' });
    expect(issues[0]?.message).toContain('./commands/status.md');
  });

  test('a source outside the plugin folder is refused and never read', async () => {
    const { commands, issues, folder } = await load(
      { sneaky: { source: './../secrets.md' }, bare: { source: 'commands/a.md' } },
      { 'commands/a.md': 'File.', '../secrets.md': 'Secret.' },
    );
    expect(commands).toEqual([]);
    expect(issues.map((found) => found.severity)).toEqual(['error', 'error']);
    expect(folder.reads).toEqual([]);
  });
});

spec('commands.entry.description', () => {
  test('the entry description is the description of the command in the / menu', async () => {
    const command = await loadOne('about', {
      content: 'Summarize what this repository does in three sentences.',
      description: 'Summarize the repository',
    });
    expect(menuEntries([command])).toEqual([
      {
        name: 'my-plugin:about',
        description: 'Summarize the repository',
        argumentHint: '',
      },
    ]);
  });

  test('without one the menu shows the first non-empty line of the body', async () => {
    const command = await loadOne('about', {
      content: '\nExplain what this plugin provides.\nMore.',
    });
    expect(menuEntries([command])[0]?.description).toBe('Explain what this plugin provides.');
  });
});

spec('commands.entry.argumentHint', () => {
  test('the entry argumentHint is the hint of the command in the / menu', async () => {
    const command = await loadOne(
      'status',
      { source: './commands/status.md', argumentHint: '[env]' },
      {
        'commands/status.md': STATUS_FILE,
      },
    );
    expect(menuEntries([command])).toEqual([
      {
        name: 'my-plugin:status',
        description: 'Check the status of $ARGUMENTS.',
        argumentHint: '[env]',
      },
    ]);
  });
});

spec('commands.entry.model', () => {
  test('the entry model is the model of the turn the command runs', async () => {
    const command = await loadOne('plan', { content: 'Plan the work.', model: 'opus' });
    const run = await expandWith(command);
    expect(run.expansion.ok && run.expansion.turn).toEqual({ target: 'turn', model: 'opus' });
  });

  test('a command with no model overrides nothing', async () => {
    const run = await expandWith(await loadOne('plan', { content: 'Plan the work.' }));
    expect(run.expansion.ok && run.expansion.turn).toEqual({ target: 'turn' });
  });

  test('a model the organization does not allow is ignored: the command runs on the session model', async () => {
    const command = await loadOne('plan', { content: 'Plan the work.', model: 'opus' });
    const run = await expandWith(command, {
      request: { limits: { models: { allowed: (model) => model !== 'opus' } } },
    });
    expect(run.expansion.ok && run.expansion.turn).toEqual({
      target: 'turn',
      modelKept: 'excluded',
    });
  });
});

spec('commands.entry.allowedTools', () => {
  const status = 'Status: !`git status --short`';

  test('the entry rules are the grants of the invocation, and the command runs without prompting', async () => {
    const command = await loadOne('status', {
      content: status,
      allowedTools: ['Bash(git status *)'],
    });
    const run = await expandWith(command, { replies: [{ stdout: 'clean' }] });
    expect(textOf(run.expansion)).toBe('Status: clean');
    expect(grantsOf(run)).toEqual(['Bash(git status *)']);
    expect(run.runs).toHaveLength(1);
  });

  test('without the entry field the same command would prompt, so the grant is what lets it run', async () => {
    const command = await loadOne('status', { content: status });
    const run = await expandWith(command);
    expect(abortOf(run.expansion)).toContain('Shell command permission check failed');
    expect(run.runs).toHaveLength(0);
  });

  test('a grant does not cover a command it does not name, and deny rules still override it', async () => {
    const command = await loadOne('status', {
      content: status,
      allowedTools: ['Bash(git status *)'],
    });
    const denied = await expandWith(command, { rules: { deny: ['Bash(git status *)'] } });
    expect(abortOf(denied.expansion)).toContain('permission check failed');
    const other = await loadOne('push', {
      content: '!`git push`',
      allowedTools: ['Bash(git status *)'],
    });
    expect(abortOf((await expandWith(other)).expansion)).toContain('permission check failed');
  });

  test('`${CLAUDE_PLUGIN_ROOT}` in a Bash rule is substituted, so it matches the command the body runs', async () => {
    const command = await loadOne('check', {
      content: 'Result: !`${CLAUDE_PLUGIN_ROOT}/scripts/check.sh`',
      allowedTools: ['Bash(${CLAUDE_PLUGIN_ROOT}/scripts/check.sh)'],
    });
    const run = await expandWith(command, { replies: [{ stdout: 'ok' }] });
    expect(textOf(run.expansion)).toBe('Result: ok');
    expect(grantsOf(run)).toEqual(['Bash(/plugins/my-plugin/scripts/check.sh)']);
  });
});

describe('an allowedTools rule that does not parse (spec/judgments.md)', () => {
  test('it is dropped with a warning at the entry; the valid rules and the command stay', async () => {
    const { commands, issues } = await load({
      status: { content: 'Go.', allowedTools: ['Bash(git status', 'Read', 'Bash(git diff *)'] },
    });
    expect(commands[0]?.allowedTools).toEqual(['Read', 'Bash(git diff *)']);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'warning', path: 'commands.status.allowedTools' });
    expect(issues[0]?.message).toContain('Bash(git status');
  });

  test('the dropped rule grants nothing: the command it would have covered still prompts', async () => {
    const command = await loadOne('status', {
      content: 'Status: !`git status --short`',
      allowedTools: ['Bash(git status'],
    });
    expect(abortOf((await expandWith(command)).expansion)).toContain('permission check failed');
  });

  test('with a `source` entry the entry list still replaces the file list, so an unparseable list leaves none', async () => {
    const { commands } = await load(
      { status: { source: './commands/s.md', allowedTools: ['Bash(ls'] } },
      { 'commands/s.md': '---\nallowed-tools: Read\n---\nGo.' },
    );
    expect(commands[0]?.allowedTools).toEqual([]);
  });
});
