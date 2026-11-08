/**
 * What the kit decides about commands where the docs are silent (spec/judgments.md), and the flat
 * command file: skills.md § Where skills live ("a command file ... supports the same frontmatter
 * except `name` and `paths`"), § How a skill gets its command name (the `commands/` rows),
 * § Characters a skill name can't hold, § Names reserved for synced skills; plugins/components.md
 * § Commands. Outside spec(): the requirement ids of commands are the manifest entry fields
 * (tests/format/command.test.ts); an entry field winning over the file's, a `content` that is not
 * parsed for frontmatter and the refusal of a manifest key are judgments.
 */
import { describe, expect, test } from 'bun:test';
import { readCommand, readCommandEntry } from '../../src/format/command.ts';
import { ctx, loaded, PLUGIN } from '../support/command-read.ts';

const project = (relativePath: string) => ({ origin: { kind: 'project' } as const, relativePath });

const nameOf = (relativePath: string) =>
  loaded(readCommand(`.claude/commands/${relativePath}`, 'x', project(relativePath))).name;

describe('the entry against the file it names (spec/judgments.md: the entry wins)', () => {
  const file =
    '---\ndescription: From the file\nargument-hint: "[from-file]"\nmodel: haiku\nallowed-tools: Read\neffort: low\n---\nBody.\n';
  const entry = {
    source: './commands/c.md',
    description: 'From the entry',
    argumentHint: '[from-entry]',
    model: 'opus',
    allowedTools: ['Bash(ls *)'],
  };

  test('each field the entry sets replaces the file frontmatter field', () => {
    const command = loaded(readCommandEntry('c', entry, file, ctx));
    expect(command).toMatchObject({
      description: 'From the entry',
      argumentHint: '[from-entry]',
      model: 'opus',
      allowedTools: ['Bash(ls *)'],
    });
  });

  test('a field the entry leaves out keeps the file value, and other file fields still apply', () => {
    const command = loaded(readCommandEntry('c', { source: './commands/c.md' }, file, ctx));
    expect(command).toMatchObject({
      description: 'From the file',
      argumentHint: '[from-file]',
      model: 'haiku',
      allowedTools: ['Read'],
      effort: 'low',
    });
  });

  test('an empty allowedTools list in the entry replaces the file grants with none', () => {
    const command = loaded(
      readCommandEntry('c', { source: './commands/c.md', allowedTools: [] }, file, ctx),
    );
    expect(command.allowedTools).toEqual([]);
  });

  test('inline `content` is the body as written: a leading --- block is not read as frontmatter', () => {
    const content = '---\nmodel: haiku\n---\nBody.';
    const command = loaded(readCommandEntry('c', { content }, undefined, ctx));
    expect(command.body).toBe(content);
    expect(command.model).toBeUndefined();
  });
});

describe('blank and untrimmed entry fields (spec/judgments.md)', () => {
  test('a blank description is no description, so the body describes the command', () => {
    const command = loaded(
      readCommandEntry('about', { content: 'Say hello.', description: '   ' }, undefined, ctx),
    );
    expect(command.description).toBe('Say hello.');
  });

  test('a blank model sets none', () => {
    const command = loaded(
      readCommandEntry('plan', { content: 'Plan.', model: ' ' }, undefined, ctx),
    );
    expect(command.model).toBeUndefined();
  });

  test('every field is trimmed, and blank allowedTools items are dropped', () => {
    const command = loaded(
      readCommandEntry(
        'c',
        {
          content: 'Go.',
          description: '  Does it  ',
          argumentHint: ' [x] ',
          model: ' opus ',
          allowedTools: [' Read ', '  ', ''],
        },
        undefined,
        ctx,
      ),
    );
    expect(command).toMatchObject({
      description: 'Does it',
      argumentHint: '[x]',
      model: 'opus',
      allowedTools: ['Read'],
    });
  });

  test('an entry without allowedTools grants nothing (the reader default)', () => {
    const command = loaded(readCommandEntry('ship', { content: 'Ship.' }, undefined, ctx));
    expect(command.allowedTools).toEqual([]);
  });
});

describe('the name of a manifest entry', () => {
  test('a key with a segment separator is kept as the command name after the prefix', () => {
    const command = loaded(readCommandEntry('db:migrate', { content: 'Migrate.' }, undefined, ctx));
    expect(command.name).toBe('db:migrate');
    expect(command.command).toBe('my-plugin:db:migrate');
  });

  test('a key with a character a command name cannot hold refuses the entry', () => {
    const read = readCommandEntry('ab​out', { content: 'Hi.' }, undefined, ctx);
    expect(read.command).toBeUndefined();
    expect(read.issues).toHaveLength(1);
    expect(read.issues[0]).toMatchObject({ severity: 'error', path: 'commands.ab​out' });
    expect(read.issues[0]?.message).toContain('U+200B');
  });

  test('an empty key refuses the entry', () => {
    const read = readCommandEntry('', { content: 'Hi.' }, undefined, ctx);
    expect(read.command).toBeUndefined();
    expect(read.issues[0]?.severity).toBe('error');
  });
});

describe('readCommand: a flat command file (skills.md, "How a skill gets its command name")', () => {
  test('.claude/commands/deploy.md is /deploy', () => {
    const read = readCommand('.claude/commands/deploy.md', 'Deploy it.\n', project('deploy.md'));
    expect(read.issues).toEqual([]);
    expect(loaded(read)).toMatchObject({
      kind: 'command',
      name: 'deploy',
      command: 'deploy',
      path: '.claude/commands/deploy.md',
      body: 'Deploy it.\n',
    });
  });

  test('.claude/commands/frontend/component.md is /frontend:component', () => {
    const command = loaded(
      readCommand(
        '.claude/commands/frontend/component.md',
        'Make one.',
        project('frontend/component.md'),
      ),
    );
    expect(command.name).toBe('frontend:component');
    expect(command.command).toBe('frontend:component');
  });

  test('a plugin file commands/db/migrate.md is /my-plugin:db:migrate', () => {
    const command = loaded(
      readCommand('commands/db/migrate.md', 'Migrate.', {
        origin: PLUGIN,
        relativePath: 'db/migrate.md',
      }),
    );
    expect(command).toMatchObject({ name: 'db:migrate', command: 'my-plugin:db:migrate' });
  });

  test('it takes the skill frontmatter except `name` and `paths`, which are ignored', () => {
    const text =
      '---\nname: other\npaths: src/**\ndescription: Deploys\nargument-hint: "[env]"\nallowed-tools: Bash(make *)\n---\nGo.\n';
    const read = readCommand('.claude/commands/deploy.md', text, project('deploy.md'));
    expect(read.issues).toEqual([]);
    const command = loaded(read);
    expect(command.command).toBe('deploy');
    expect(command.paths).toEqual([]);
    expect(command).toMatchObject({
      description: 'Deploys',
      argumentHint: '[env]',
      allowedTools: ['Bash(make *)'],
    });
  });

  test('`name` and `paths` in the frontmatter are dropped silently, with no warning', () => {
    const read = readCommand(
      '.claude/commands/deploy.md',
      '---\nname: other\npaths: src/**\n---\nGo.\n',
      project('deploy.md'),
    );
    expect(read.issues).toEqual([]);
    expect(loaded(read).name).toBe('deploy');
  });

  test('only a `.md` extension is stripped from the name, in any case; another one stays', () => {
    expect(nameOf('Deploy.MD')).toBe('Deploy');
    expect(nameOf('notes.txt')).toBe('notes.txt');
    expect(nameOf('db/migrate.md')).toBe('db:migrate');
  });

  test('a file whose name holds a refused character does not load', () => {
    const read = readCommand('.claude/commands/a b.md', 'x', project('a b.md'));
    expect(read.command).toBeUndefined();
    expect(read.issues[0]).toMatchObject({ severity: 'error' });
    expect(read.issues[0]?.message).toContain('U+00A0');
  });

  test('a subfolder whose name holds a refused character does not load either', () => {
    const read = readCommand('commands/a<b/run.md', 'x', {
      origin: PLUGIN,
      relativePath: 'a<b/run.md',
    });
    expect(read.command).toBeUndefined();
    expect(read.issues[0]?.message).toContain('U+003C');
  });

  test('a file or subfolder named anthropic-skills does not load outside a plugin', () => {
    for (const relativePath of ['anthropic-skills.md', 'anthropic-skills/pdf.md']) {
      const read = readCommand(`.claude/commands/${relativePath}`, 'x', project(relativePath));
      expect(read.command).toBeUndefined();
      expect(read.issues[0]?.message).toContain('anthropic-skills');
    }
  });

  test('in a plugin that name is only a segment after the prefix, so it loads', () => {
    const command = loaded(
      readCommand('commands/anthropic-skills.md', 'x', {
        origin: PLUGIN,
        relativePath: 'anthropic-skills.md',
      }),
    );
    expect(command.command).toBe('my-plugin:anthropic-skills');
  });

  test('a YAML error loads the command with its body and no fields, and a warning on the file', () => {
    const read = readCommand(
      '.claude/commands/deploy.md',
      '---\nmodel: [unclosed\n---\nDeploy.\n',
      project('deploy.md'),
    );
    expect(loaded(read).body).toBe('Deploy.\n');
    expect(read.issues).toHaveLength(1);
    expect(read.issues[0]).toMatchObject({
      severity: 'warning',
      path: '.claude/commands/deploy.md',
    });
  });
});
