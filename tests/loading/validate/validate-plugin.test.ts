/**
 * `validatePlugin` over a folder: which manifest it picks and what it reads. The wording of every
 * finding is the oracle's (`claude plugin validate` 2.1.319, docs/SPEC.md "Sources of truth");
 * each input here is the kit's own minimal fixture for a behaviour recorded in spec/judgments.md.
 */
import { describe, expect, test } from 'bun:test';
import { validatePlugin } from '../../../src/index.ts';
import { memoryFiles } from '../../support/ports.ts';

type Tree = Parameters<typeof memoryFiles>[0];

const COMPLETE = { name: 'demo', version: '1.0.0', description: 'Demo', author: { name: 'A' } };
const manifest = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ ...COMPLETE, ...extra });
const run = (tree: Tree, label?: string) =>
  validatePlugin({ files: memoryFiles(tree), ...(label === undefined ? {} : { label }) });
const brief = async (tree: Tree) =>
  (await run(tree)).issues.map((issue) => [issue.severity, issue.file, issue.path]);

describe('which folder it is', () => {
  test('a folder with plugin.json is a plugin, and a complete one has no findings', async () => {
    const report = await run({ '.claude-plugin/plugin.json': manifest() });
    expect(report).toEqual({ target: 'plugin', issues: [] });
  });

  test('marketplace.json wins over plugin.json, and the root plugin is checked too', async () => {
    const report = await run({
      '.claude-plugin/marketplace.json': JSON.stringify({
        name: 'shop',
        owner: { name: 'O' },
        description: 'Shop',
        plugins: [],
      }),
      '.claude-plugin/plugin.json': manifest({ version: undefined }),
    });
    expect(report.target).toBe('marketplace');
    expect(report.issues.map((issue) => [issue.file, issue.path])).toEqual([
      ['.claude-plugin/marketplace.json', 'plugins'],
      ['.claude-plugin/plugin.json', 'version'],
    ]);
  });

  test('a folder with neither manifest nor components is one error at the folder', async () => {
    const report = await run({ 'README.md': 'x' }, 'some/dir');
    expect(report.target).toBe('none');
    expect(report.issues).toEqual([
      {
        severity: 'error',
        file: 'some/dir',
        path: 'directory',
        message:
          'No manifest found in directory. Expected .claude-plugin/marketplace.json or .claude-plugin/plugin.json',
      },
    ]);
  });

  test('a skills tree without a manifest is validated as components', async () => {
    const report = await run({ 'skills/a/SKILL.md': 'no block' });
    expect(report.target).toBe('components');
    expect(report.issues.map((issue) => issue.file)).toEqual(['skills/a/SKILL.md']);
  });

  test('a folder that does not exist is a file-not-found error', async () => {
    const files = {
      ...memoryFiles(),
      stat: () => Promise.resolve(undefined),
      list: () => Promise.resolve(undefined),
    };
    const report = await validatePlugin({ files, label: 'gone' });
    expect(report.issues[0]?.message).toBe('File not found: gone');
  });
});

describe('plugin.json', () => {
  test('JSON that does not parse is one error naming the parser', async () => {
    const report = await run({ '.claude-plugin/plugin.json': '{ "name": ' });
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]?.message).toStartWith('Invalid JSON syntax: ');
    expect([report.issues[0]?.file, report.issues[0]?.path]).toEqual([
      '.claude-plugin/plugin.json',
      'json',
    ]);
  });

  test('a missing name is the schema error, and nothing beyond the schema is advised', async () => {
    const report = await run({ '.claude-plugin/plugin.json': '{}' });
    expect(report.issues.map((issue) => [issue.severity, issue.path, issue.message])).toEqual([
      ['error', 'name', 'Invalid input: expected string, received undefined'],
    ]);
  });

  test('missing version, description and author are warnings; an empty version counts as missing', async () => {
    const report = await run({ '.claude-plugin/plugin.json': '{"name":"demo","version":""}' });
    expect(report.issues.map((issue) => [issue.severity, issue.path])).toEqual([
      ['warning', 'version'],
      ['warning', 'description'],
      ['warning', 'author'],
    ]);
  });

  test('a key it does not know is a warning, with a hint when one is close', async () => {
    const report = await run({
      '.claude-plugin/plugin.json': manifest({ keyword: ['a'], npm: 'x', publisher: 'p' }),
    });
    expect(report.issues.map((issue) => issue.message)).toEqual([
      "Unknown field 'keyword' — did you mean 'keywords'? Claude Code ignores unrecognized fields at load time, so this field has no effect.",
      "Unknown field 'npm'. Claude Code ignores it at load time.",
      "Unknown field 'publisher' (commonly seen in a VS Code/Cursor extension manifest). Claude Code ignores unrecognized fields at load time, so it's safe to keep.",
    ]);
  });

  test('a declared path that is not there is an error at the key', async () => {
    const report = await run({ '.claude-plugin/plugin.json': manifest({ skills: './nope' }) });
    expect(report.issues.map((issue) => [issue.severity, issue.path])).toEqual([
      ['error', 'skills[0]'],
    ]);
    expect(report.issues[0]?.message).toStartWith('Path not found: ./nope.');
  });

  test('a BOM before the manifest is read through', async () => {
    const report = await run({ '.claude-plugin/plugin.json': `﻿${manifest()}` });
    expect(report.issues).toEqual([]);
  });
});

describe('inline commands', () => {
  const issuesOf = async (commands: unknown) =>
    (await run({ '.claude-plugin/plugin.json': manifest({ commands }) })).issues.map((issue) => [
      issue.path,
      issue.message,
    ]);

  test('an entry with neither source nor content, or both, is named', async () => {
    const choice =
      'Command must have either "source" (file path) or "content" (inline markdown), but not both';
    expect(await issuesOf({ a: {} })).toEqual([['commands.a', choice]]);
    expect(await issuesOf({ a: { source: './a.md', content: 'x' } })).toContainEqual([
      'commands.a',
      choice,
    ]);
  });

  test('an entry of the wrong type is one "Invalid input" at the key', async () => {
    expect(await issuesOf({ a: 'x' })).toEqual([['commands', 'Invalid input']]);
    expect(await issuesOf({ a: { content: 5 } })).toEqual([['commands', 'Invalid input']]);
    expect(await issuesOf({ prefix: '/x:', namespaces: { a: 'b/' } })).toEqual([
      ['commands', 'Invalid input'],
    ]);
  });

  test('an entry with content and typed options is clean', async () => {
    expect(await issuesOf({ a: { content: 'x', allowedTools: ['Read'], model: 'm' } })).toEqual([]);
  });
});

describe('components', () => {
  test('a skill without frontmatter is a warning on the file; one without a description too', async () => {
    const report = await run({
      '.claude-plugin/plugin.json': manifest(),
      'skills/a/SKILL.md': 'text',
      'skills/b/SKILL.md': '---\nname: b\n---\ntext',
    });
    expect(report.issues.map((issue) => [issue.severity, issue.file, issue.path])).toEqual([
      ['warning', 'skills/a/SKILL.md', 'frontmatter'],
      ['warning', 'skills/b/SKILL.md', 'description'],
    ]);
  });

  test('paths the manifest declares are not read for frontmatter', async () => {
    const report = await run({
      '.claude-plugin/plugin.json': manifest({ skills: './extra', agents: ['./x/a.md'] }),
      'extra/s/SKILL.md': 'text',
      'x/a.md': 'text',
    });
    expect(report.issues).toEqual([]);
  });

  test('agents and commands are read at any depth', async () => {
    const report = await run({
      '.claude-plugin/plugin.json': manifest(),
      'commands/deep/er/c.md': 'text',
    });
    expect(report.issues.map((issue) => issue.file)).toEqual(['commands/deep/er/c.md']);
  });

  test('YAML that does not parse is an error naming the kind; a retry rescues what plain YAML cannot hold', async () => {
    const report = await run({
      '.claude-plugin/plugin.json': manifest(),
      'skills/bad/SKILL.md': '---\nname: bad\ndescription: "unclosed\n---\n',
      'skills/ok/SKILL.md': '---\nname: ok\ndescription: Does X: then Y\n---\n',
    });
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]?.severity).toBe('error');
    expect(report.issues[0]?.message).toStartWith(
      'YAML frontmatter failed to parse: YAML Parse error: ',
    );
    expect(report.issues[0]?.message).toContain('At runtime this skill loads with empty metadata');
  });

  test('an unclosed flow bracket is rescued by the retry: no finding, as `claude plugin validate` 2.1.322', async () => {
    const report = await run({
      '.claude-plugin/plugin.json': manifest(),
      'skills/s/SKILL.md': '---\nname: [\ndescription: d\n---\nbody',
      'agents/a.md': '---\nname: [\ndescription: d\ntools: [a, b\n---\nbody',
    });
    expect(report.issues).toEqual([]);
  });

  test('CLAUDE.md at the root is a warning, unless it is a link', async () => {
    const plain = { '.claude-plugin/plugin.json': manifest(), 'CLAUDE.md': 'x' };
    expect(await brief(plain)).toEqual([['warning', 'CLAUDE.md', 'root']]);
    const linked = { ...plain, 'CLAUDE.md': { symlink: 'README.md' }, 'README.md': 'x' };
    expect(await brief(linked)).toEqual([]);
  });
});

describe('hooks.json', () => {
  const hooksIssues = async (hooks: string) =>
    (await run({ '.claude-plugin/plugin.json': manifest(), 'hooks/hooks.json': hooks })).issues;

  test('an entry that cannot load is a warning, and an error under a guarded event', async () => {
    const found = await hooksIssues(
      JSON.stringify({
        hooks: { Stop: [{ nothing: 1 }], PreToolUse: [{ nothing: 1 }], Nope: [] },
      }),
    );
    expect(found.map((issue) => issue.severity)).toEqual(['warning', 'error', 'warning']);
    expect(found.map((issue) => issue.message)).toEqual([
      'hooks.Stop.0: Hook matcher "hooks" must be an array of hook entries; received undefined; entry ignored at runtime',
      expect.stringContaining(
        'hooks.PreToolUse.0: Hook matcher "hooks" must be an array of hook entries; received undefined — a PreToolUse/PermissionRequest hook that cannot be loaded',
      ),
      'hooks.Nope: unknown hook event; entry ignored at runtime',
    ]);
  });

  test('the hooks array is checked before the matcher type', async () => {
    const found = await hooksIssues(JSON.stringify({ hooks: { Stop: [{ matcher: {} }] } }));
    expect(found[0]?.message).toStartWith('hooks.Stop.0: Hook matcher "hooks" must be an array');
  });

  test('an event map without the "hooks" wrapper, or a list in its place, names the guard', async () => {
    for (const text of ['{"PermissionRequest":5}', '{"hooks":[{"event":"Stop"}]}']) {
      const [issue] = await hooksIssues(text);
      expect(issue?.message).toStartWith(
        'PreToolUse/PermissionRequest is declared at the top level',
      );
    }
    const [none] = await hooksIssues('{"PreToolUse":[]}');
    expect(none?.message).toStartWith('hooks.json must have `hooks`');
    const [record] = await hooksIssues('{"hooks":"x"}');
    expect(record?.message).toBe('Invalid input: expected record, received string');
  });

  test('a byte-order mark is a JSON error here, unlike in plugin.json', async () => {
    const [issue] = await hooksIssues(`﻿{"hooks":{}}`);
    expect(issue?.message).toStartWith('Invalid JSON syntax: JSON Parse error: Unrecognized token');
  });

  test('a shell command with an unquoted ${CLAUDE_PLUGIN_ROOT} is advised on', async () => {
    const found = await hooksIssues(
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'sh ${CLAUDE_PLUGIN_ROOT}/a.sh' }] }],
        },
      }),
    );
    expect(found.map((issue) => [issue.severity, issue.path])).toEqual([['warning', 'hooks.Stop']]);
  });
});

describe('.mcp.json', () => {
  test('a byte-order mark is refused with its own reason', async () => {
    const report = await run({
      '.claude-plugin/plugin.json': manifest(),
      '.mcp.json': `﻿{"mcpServers":{}}`,
    });
    expect(report.issues[0]?.message).toContain('starts with a UTF-8 byte-order mark (BOM)');
  });
});
