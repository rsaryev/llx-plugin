/**
 * The files a skill's or command's expanded text names with `@`. The docs say Claude Code attaches
 * them for a local skill: a synced skill's body "doesn't attach the files that `@` references name
 * the way it does for a local skill, ... so the `@` references ... reach Claude as literal text"
 * (skills.md, "How Claude Code handles the body of a synced skill"; changelog.md: "Custom slash
 * commands: Run bash output, @-mention files", "Added support for @-mentions in slash command
 * arguments"). They give no syntax for a skill's references: the reading is oracle 2.1.322
 * (spec/judgments.md, `src/skills/file-references.ts`), tested outside `spec()`.
 */
import { describe, expect, test } from 'bun:test';
import { readFileReferences } from '../../src/skills/index.ts';
import { locations } from '../../src/testing/index.ts';
import { expandWith, PLUGIN, skillFrom } from '../support/expand.ts';

const AT = { cwd: '/work/app', locations: locations() };
const read = (text: string) => readFileReferences(text, AT);
const paths = (text: string) => read(text).map((reference) => reference.path);

describe('readFileReferences (oracle 2.1.322)', () => {
  test('a reference starts the text or follows whitespace; it is resolved against the working directory', () => {
    expect(read('See @README.md and\n@docs/a.md')).toEqual([
      { text: '@README.md', path: '/work/app/README.md' },
      { text: '@docs/a.md', path: '/work/app/docs/a.md' },
    ]);
  });

  test('`@` inside a word or after punctuation is no reference: `x@a`, `(@a`, `` `@a` ``', () => {
    expect(read('mail x@a.md (@b.md) `@c.md` ``@d.md``')).toEqual([]);
  });

  test('Markdown code spans and fences are not skipped: `@` after whitespace in them counts', () => {
    expect(paths('`y @a.md` and\n```\n@b.md\n```')).toEqual(['/work/app/a.md', '/work/app/b.md']);
  });

  test('trailing punctuation and a line range are not part of the path', () => {
    expect(paths('@a.md) @b.md: @c.md! @d.md? @e.md" @f.md, @g.md; @h.md. @i.md#2-3')).toEqual(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((name) => `/work/app/${name}.md`),
    );
    expect(read('@i.md#2-3')[0]?.text).toBe('@i.md#2-3');
  });

  test('a quoted path may hold spaces; a backslash-escaped space ends the path', () => {
    expect(paths('@"sub dir/a.md"')).toEqual(['/work/app/sub dir/a.md']);
    expect(read('@sub\\ dir/a.md')).toEqual([{ text: '@sub\\', path: '/work/app/sub\\' }]);
  });

  test('an absolute path is kept, `~/` is the home folder', () => {
    expect(paths('@/etc/hosts @~/notes.md')).toEqual(['/etc/hosts', '/home/user/notes.md']);
  });

  test('the same reference twice is one; two spellings of one file are two', () => {
    expect(paths('@a.md @a.md @./a.md')).toEqual(['/work/app/a.md', '/work/app/a.md']);
    expect(read('@a.md @a.md @./a.md').map((reference) => reference.text)).toEqual([
      '@a.md',
      '@./a.md',
    ]);
  });

  test('a lone `@` names nothing', () => {
    expect(read('@ @. @"" end')).toEqual([]);
  });
});

describe('expandSkill reports the references of the expanded text', () => {
  test('the text stays as written; arguments and command output are read too', async () => {
    const skill = skillFrom(
      'allowed-tools: Bash(echo *)',
      'Read @a.md @$ARGUMENTS !`echo @c.md`',
      PLUGIN,
    );
    const { expansion } = await expandWith(skill, {
      request: { arguments: 'b.md', cwd: '/work/app' },
      replies: [{ stdout: '@c.md' }],
    });
    if (!expansion.ok) throw new Error('expected an expansion');
    expect(expansion.text).toEndWith('Read @a.md @b.md @c.md');
    expect(expansion.references.map((reference) => reference.path)).toEqual([
      '/work/app/a.md',
      '/work/app/b.md',
      '/work/app/c.md',
    ]);
  });

  test('without a cwd the project folder is the base', async () => {
    const { expansion } = await expandWith(skillFrom('', 'Read @a.md'));
    expect(expansion.ok && expansion.references).toEqual([
      { text: '@a.md', path: '/work/app/a.md' },
    ]);
  });

  test("the skill's own folder line is not read", async () => {
    const { expansion } = await expandWith(skillFrom('', 'Body'), {
      request: { session: { skillRoot: '/work/my @x' } },
    });
    expect(expansion.ok && expansion.text).toContain(' @x');
    expect(expansion.ok && expansion.references).toEqual([]);
  });

  test("a synced skill on the owner's machine attaches nothing; an isolated session does", async () => {
    const synced = skillFrom('', 'Read @a.md', { kind: 'synced' });
    const local = await expandWith(synced);
    expect(local.expansion.ok && local.expansion.references).toEqual([]);
    const cloud = await expandWith(synced, { request: { session: { isolatedSession: true } } });
    expect(cloud.expansion.ok && cloud.expansion.references.length).toBe(1);
  });
});
