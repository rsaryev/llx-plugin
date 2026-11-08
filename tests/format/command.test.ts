/**
 * plugins/manifest-reference.md § `commands` (the object map: `source` or `content`, `description`,
 * `argumentHint`, `model`, `allowedTools`; "each key becomes the command name after the plugin
 * prefix"; "an entry that sets both or neither fails validation"); plugins/components.md §
 * Commands and § Define commands in the manifest; skills.md § Where skills live ("a command file
 * ... supports the same frontmatter except `name` and `paths`"), § How a skill gets its command
 * name and § Characters a skill name can't hold. The entry fields reach the command here; what the
 * command does once it runs is proven in tests/skills/command-entries.test.ts. Precedence between
 * an entry field and the same field in the source file, and a `content` that is not parsed for
 * frontmatter, are the kit's judgments (spec/judgments.md) and are tested outside spec(), as are a
 * blank field and the default of an entry without `allowedTools` (tests/format/command-judgments.test.ts).
 */
import { expect, test } from 'bun:test';
import { readCommandEntry } from '../../src/format/command.ts';
import { ctx, loaded, PLUGIN } from '../support/command-read.ts';
import { spec } from '../support/spec.ts';

const STATUS_FILE =
  '---\nmodel: haiku\nargument-hint: "[issue]"\n---\nCheck the status of $ARGUMENTS.\n';

spec('commands.entry.content', () => {
  test('the docs example: an inline entry is /my-plugin:about and its content is the body', () => {
    const read = readCommandEntry(
      'about',
      {
        content: 'Summarize what this repository does in three sentences.',
        description: 'Summarize the repository',
      },
      undefined,
      ctx,
    );
    expect(read.issues).toEqual([]);
    expect(read.command).toMatchObject({
      kind: 'command',
      name: 'about',
      command: 'my-plugin:about',
      body: 'Summarize what this repository does in three sentences.',
      origin: PLUGIN,
    });
    expect(read.command?.path).toBeUndefined();
  });

  test('an entry that sets both `source` and `content` fails, and no command loads', () => {
    const read = readCommandEntry(
      'about',
      { source: './commands/about.md', content: 'Inline.' },
      'From the file.',
      ctx,
    );
    expect(read.command).toBeUndefined();
    expect(read.issues).toEqual([
      {
        severity: 'error',
        path: 'commands.about',
        message: 'Set exactly one of "source" or "content"',
      },
    ]);
  });

  test('an entry that sets neither fails, and no command loads', () => {
    const read = readCommandEntry('about', { description: 'Nothing to run' }, undefined, ctx);
    expect(read.command).toBeUndefined();
    expect(read.issues.map((found) => [found.severity, found.path, found.message])).toEqual([
      ['error', 'commands.about', 'Set exactly one of "source" or "content"'],
    ]);
  });
});

spec('commands.entry.source', () => {
  test('the docs example: "status" from ./commands/status.md is /my-plugin:status, body and fields from the file', () => {
    const read = readCommandEntry(
      'status',
      { source: './commands/status.md', argumentHint: '[env]' },
      STATUS_FILE,
      ctx,
    );
    expect(read.issues).toEqual([]);
    const command = loaded(read);
    expect(command.command).toBe('my-plugin:status');
    expect(command.path).toBe('./commands/status.md');
    expect(command.body).toBe('Check the status of $ARGUMENTS.\n');
    expect(command.model).toBe('haiku');
    expect(command.body).not.toContain('model:');
  });

  test('a source file that is not there is an error at the entry, and no command loads', () => {
    const read = readCommandEntry('status', { source: './commands/status.md' }, undefined, ctx);
    expect(read.command).toBeUndefined();
    expect(read.issues).toEqual([
      {
        severity: 'error',
        path: 'commands.status',
        message: 'source "./commands/status.md" was not found in the plugin folder',
      },
    ]);
  });

  test('a source file with a YAML error still loads: no fields, the body kept, a warning on the file', () => {
    const read = readCommandEntry(
      'status',
      { source: './commands/status.md' },
      '---\nmodel: "unclosed\n---\nCheck it.\n',
      ctx,
    );
    const command = loaded(read);
    expect(command.model).toBeUndefined();
    expect(command.body).toBe('Check it.\n');
    expect(read.issues).toHaveLength(1);
    expect(read.issues[0]).toMatchObject({ severity: 'warning', path: './commands/status.md' });
  });
});

spec('commands.entry.description', () => {
  test('the entry description is the command description', () => {
    const command = loaded(
      readCommandEntry(
        'about',
        { content: 'Summarize this.', description: 'Summarize the repository' },
        undefined,
        ctx,
      ),
    );
    expect(command.description).toBe('Summarize the repository');
  });

  test('without one the first non-empty line of the body describes the command', () => {
    const command = loaded(
      readCommandEntry(
        'about',
        { content: '\n\n  Explain what this plugin provides.\nSecond line.' },
        undefined,
        ctx,
      ),
    );
    expect(command.description).toBe('Explain what this plugin provides.');
  });
});

spec('commands.entry.argumentHint', () => {
  test('the entry argumentHint is the hint shown after the command name', () => {
    const command = loaded(
      readCommandEntry(
        'review',
        { content: 'Review $ARGUMENTS', argumentHint: '[file]' },
        undefined,
        ctx,
      ),
    );
    expect(command.argumentHint).toBe('[file]');
  });

  test('an entry without one has no hint', () => {
    const command = loaded(readCommandEntry('review', { content: 'Review.' }, undefined, ctx));
    expect(command.argumentHint).toBeUndefined();
  });
});

spec('commands.entry.model', () => {
  test('the entry model is the command model, as written', () => {
    for (const model of ['opus', 'claude-sonnet-5-5', 'inherit']) {
      const command = loaded(readCommandEntry('plan', { content: 'Plan.', model }, undefined, ctx));
      expect(command.model).toBe(model);
    }
  });

  test('an entry without a model sets none', () => {
    expect(
      loaded(readCommandEntry('plan', { content: 'Plan.' }, undefined, ctx)).model,
    ).toBeUndefined();
  });
});

spec('commands.entry.allowedTools', () => {
  test('the entry list is the command allowed-tools, rules as written, in order', () => {
    const command = loaded(
      readCommandEntry(
        'ship',
        { content: 'Ship.', allowedTools: ['Bash(git add *)', 'Bash(git commit *)', 'Read'] },
        undefined,
        ctx,
      ),
    );
    expect(command.allowedTools).toEqual(['Bash(git add *)', 'Bash(git commit *)', 'Read']);
  });
});
