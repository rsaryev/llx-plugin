/**
 * permissions.md § What `Read` and `Edit` rules cover and § `Write(path)`, `Glob(path)`, and
 * `Grep(path)` rules don't match; tools-reference.md § Configure tools with permission rules and
 * hooks ("An `Edit(...)` allow rule also grants read access to the same path ... A `Read(...)` deny
 * rule also blocks the Edit and Write tools"); § Network paths (allow rules, hooks and auto mode
 * leave the prompt in place: `readsNetworkPath` is what tells a host to ask); § Cd. The path of each
 * tool is the field the hooks.md input tables name: `file_path` for Read, Edit and Write, `path`
 * for Grep and Glob, `notebook_path` for NotebookEdit.
 */
import { describe, expect, test } from 'bun:test';
import type {
  FileEditInput,
  FileReadInput,
  FileWriteInput,
  GlobInput,
  GrepInput,
  NotebookEditInput,
} from '../../src/protocol/official-tools.ts';
import { matchCdRule, matchRule, readsNetworkPath } from '../../src/rules/index.ts';
import { call, matchContext, parsed } from '../support/rule-context.ts';
import { allows, asks, covers, denies, withPaths } from '../support/path-rules.ts';
import { spec } from '../support/spec.ts';

/** The SDK's own inputs: this file stops compiling when a path field leaves one of them (E2). */
const read: FileReadInput = { file_path: '/work/app/secrets/a.txt' };
const edit: FileEditInput = {
  file_path: '/work/app/secrets/a.txt',
  old_string: 'a',
  new_string: 'b',
};
const write: FileWriteInput = { file_path: '/work/app/secrets/a.txt', content: 'x' };
const glob: GlobInput = { pattern: '*.txt', path: '/work/app/secrets' };
const grep: GrepInput = { pattern: 'x', path: '/work/app/secrets' };
const notebook: NotebookEditInput = {
  notebook_path: '/work/app/secrets/n.ipynb',
  new_source: 'x',
};

const matches = (
  rule: string,
  tool: string,
  input: unknown,
  behavior: 'allow' | 'deny' | 'ask' = 'deny',
): boolean => matchRule(parsed(rule, behavior), call(tool, input), matchContext);

const FIELDS: readonly (readonly [string, string, string, unknown, unknown])[] = [
  [
    'tools.input.Read.file_path',
    'Read',
    'Read(secrets/**)',
    read,
    { file_path: '/work/app/ok.txt' },
  ],
  [
    'tools.input.Edit.file_path',
    'Edit',
    'Edit(secrets/**)',
    edit,
    { ...edit, file_path: '/work/app/ok.txt' },
  ],
  [
    'tools.input.Write.file_path',
    'Edit',
    'Edit(secrets/**)',
    write,
    { ...write, file_path: '/work/app/ok.txt' },
  ],
  ['tools.input.Glob.path', 'Read', 'Read(secrets/**)', glob, { ...glob, path: '/work/app/docs' }],
  ['tools.input.Grep.path', 'Read', 'Read(secrets/**)', grep, { ...grep, path: '/work/app/docs' }],
];

for (const [id, , rule, hit, miss] of FIELDS) {
  const tool = id.split('.')[2] ?? '';
  spec(id, () => {
    test(`a path rule reads the path from the ${tool} input and from no other field`, () => {
      expect(matches(rule, tool, hit)).toBe(true);
      expect(matches(rule, tool, miss)).toBe(false);
    });

    test('an input with no path string is covered by no path rule', () => {
      const without =
        tool === 'Glob' || tool === 'Grep' ? { pattern: 'x', path: 7 } : { file_path: 7 };
      expect(matches(rule, tool, without)).toBe(false);
      expect(matches(rule, tool, undefined)).toBe(false);
    });
  });
}

describe('Write, Glob, Grep and NotebookEdit path rules are accepted but never match', () => {
  test('Grep(docs/**) does not stop Grep from searching docs', () => {
    expect(matches('Grep(docs/**)', 'Grep', { pattern: 'x', path: '/work/app/docs' })).toBe(false);
    expect(matches('Grep(docs/**)', 'Grep', { pattern: 'x', path: '/work/app/docs/a.md' })).toBe(
      false,
    );
  });

  test('nor do Write(docs/**), Glob(docs/**) and NotebookEdit(docs/**)', () => {
    expect(
      matches('Write(docs/**)', 'Write', { file_path: '/work/app/docs/a.md', content: '' }),
    ).toBe(false);
    expect(matches('Glob(docs/**)', 'Glob', { pattern: '*', path: '/work/app/docs' })).toBe(false);
    expect(matches('NotebookEdit(docs/**)', 'NotebookEdit', notebook)).toBe(false);
    const inDocs = { notebook_path: '/work/app/docs/n.ipynb', new_source: '' };
    expect(matches('NotebookEdit(docs/**)', 'NotebookEdit', inDocs)).toBe(false);
  });

  test('in an allow or ask rule too', () => {
    expect(allows('Write(docs/**)', '/work/app/docs/a.md', { tool: 'Write' })).toBe(false);
    expect(asks('Grep(docs/**)', '/work/app/docs', { tool: 'Grep' })).toBe(false);
  });

  test('Edit(docs/**) is what covers Write and NotebookEdit; Read(docs/**) covers Grep and Glob', () => {
    expect(denies('Edit(docs/**)', '/work/app/docs/a.md', { tool: 'Write' })).toBe(true);
    expect(denies('Edit(docs/**)', '/work/app/docs/n.ipynb', { tool: 'NotebookEdit' })).toBe(true);
    expect(denies('Read(docs/**)', '/work/app/docs', { tool: 'Grep' })).toBe(true);
    expect(denies('Read(docs/**)', '/work/app/docs', { tool: 'Glob' })).toBe(true);
  });

  test('to match every use of one of these tools, write only the tool name', () => {
    expect(matches('Grep', 'Grep', { pattern: 'x', path: '/work/app/docs' })).toBe(true);
  });
});

describe('Grep and Glob are checked against the path they search', () => {
  test('as an ask rule Read(docs/**) prompts for a search of docs', () => {
    expect(asks('Read(docs/**)', '/work/app/docs', { tool: 'Grep' })).toBe(true);
    expect(asks('Read(docs/**)', '/work/app/docs/sub', { tool: 'Glob' })).toBe(true);
  });

  test('but not when a search of a working directory above it returns matching files', () => {
    expect(asks('Read(docs/**)', '/work/app', { tool: 'Grep' })).toBe(false);
    expect(matches('Read(docs/**)', 'Grep', { pattern: 'x' }, 'ask')).toBe(false);
    expect(matches('Read(docs/**)', 'Glob', { pattern: '*' }, 'ask')).toBe(false);
  });

  test('a search with no path searches the current directory itself, which no pattern under it matches', () => {
    expect(matches('Read(*)', 'Grep', { pattern: 'x' }, 'ask')).toBe(false);
    expect(matches('Read(.env)', 'Grep', { pattern: 'x', path: '/work/app/.env' })).toBe(true);
  });
});

describe('an Edit allow rule grants read; a Read deny rule blocks Edit and Write', () => {
  const secret = '/work/app/keys/a.pem';

  test('Edit(keys/**) as an allow rule also allows Read, Grep and Glob of the path', () => {
    for (const tool of ['Read', 'Grep', 'Glob']) {
      expect([tool, allows('Edit(keys/**)', secret, { tool })]).toEqual([tool, true]);
    }
  });

  test('an Edit deny or ask rule does not block reading', () => {
    expect(denies('Edit(keys/**)', secret, { tool: 'Read' })).toBe(false);
    expect(asks('Edit(keys/**)', secret, { tool: 'Read' })).toBe(false);
  });

  test('a Read allow rule does not allow editing', () => {
    expect(allows('Read(keys/**)', secret, { tool: 'Edit' })).toBe(false);
    expect(allows('Read(keys/**)', secret, { tool: 'Write' })).toBe(false);
  });

  test('a Read deny rule blocks Edit and Write on the same path, new files included', () => {
    expect(denies('Read(keys/**)', secret, { tool: 'Edit' })).toBe(true);
    expect(denies('Read(keys/**)', '/work/app/keys/new.pem', { tool: 'Write' })).toBe(true);
  });

  test('NotebookEdit is not covered by a Read deny rule', () => {
    expect(denies('Read(keys/**)', '/work/app/keys/n.ipynb', { tool: 'NotebookEdit' })).toBe(false);
  });

  test('a Read ask rule does not prompt an edit (only deny is stated)', () => {
    expect(asks('Read(keys/**)', secret, { tool: 'Edit' })).toBe(false);
  });

  test('another tool is never routed: a Bash call or a Skill call matches no path rule', () => {
    expect(matches('Read(keys/**)', 'Bash', { command: 'cat keys/a.pem' })).toBe(false);
    expect(covers('deny', 'Edit(keys/**)', secret, { tool: 'Skill' })).toBe(false);
  });
});

describe('judgments about the rest of the path tools', () => {
  test('Write(*) reads as every use of Write, because the docs ask for the bare name instead', () => {
    expect(allows('Write(*)', '/anywhere', { tool: 'Write' })).toBe(true);
    expect(matches('Grep(*)', 'Grep', { pattern: 'x', path: '/tmp' })).toBe(true);
  });

  test('an LSP path rule is not readable by the kit: deny and ask cover every LSP call', () => {
    expect(matches('LSP(src/**)', 'LSP', { operation: 'hover' })).toBe(true);
    expect(matches('LSP(src/**)', 'LSP', { operation: 'hover' }, 'allow')).toBe(false);
  });

  test('a bare Read rule covers Read calls only, not an Edit call', () => {
    expect(matches('Read', 'Edit', { file_path: '/a' })).toBe(false);
  });
});

describe('network paths always prompt (permissions.md § Network paths)', () => {
  test('Read, Grep and Glob of a /net path read a network path', () => {
    const net = '/net/fileserver/notes.txt';
    expect(readsNetworkPath(call('Read', { file_path: net }), matchContext.paths)).toBe(true);
    expect(readsNetworkPath(call('Grep', { pattern: 'x', path: net }), matchContext.paths)).toBe(
      true,
    );
    expect(readsNetworkPath(call('Glob', { pattern: '*', path: net }), matchContext.paths)).toBe(
      true,
    );
  });

  test('a symlink that resolves into a /net path is a network read', () => {
    const linked = {
      ...call('Read', { file_path: '/work/app/share' }),
      resolvedPaths: ['/net/srv/x'],
    };
    expect(readsNetworkPath(linked, matchContext.paths)).toBe(true);
  });

  test('a UNC path on Windows, and no other tool', () => {
    const windows = withPaths({
      platform: 'windows',
      cwd: 'C:\\w',
      primaryWorkingDirectory: 'C:\\w',
      home: 'C:\\h',
    });
    expect(
      readsNetworkPath(call('Read', { file_path: '\\\\server\\share\\f' }), windows.paths),
    ).toBe(true);
    expect(readsNetworkPath(call('Read', { file_path: 'C:\\w\\f' }), windows.paths)).toBe(false);
    expect(readsNetworkPath(call('Edit', { file_path: '/net/x/y' }), matchContext.paths)).toBe(
      false,
    );
    expect(readsNetworkPath(call('Bash', { command: 'ls /net/x' }), matchContext.paths)).toBe(
      false,
    );
  });

  test('an ordinary read is not a network read', () => {
    expect(readsNetworkPath(call('Read', read), matchContext.paths)).toBe(false);
  });
});

const cd = (rule: string, target: string, behavior: 'allow' | 'deny' = 'deny') =>
  matchCdRule(parsed(rule, behavior), { resolved: target, spellings: [target] }, matchContext);

describe('Cd(path) rules (permissions.md § Cd)', () => {
  test('Cd(~/code/*) matches ~/code/app, not ~/code/app/src or ~/code', () => {
    expect(cd('Cd(~/code/*)', '/home/alice/code/app')).toBe(true);
    expect(cd('Cd(~/code/*)', '/home/alice/code/app/src')).toBe(false);
    expect(cd('Cd(~/code/*)', '/home/alice/code')).toBe(false);
  });

  test('Cd(~/code/**) matches ~/code and any directory under it', () => {
    expect(cd('Cd(~/code/**)', '/home/alice/code')).toBe(true);
    expect(cd('Cd(~/code/**)', '/home/alice/code/a/b/c')).toBe(true);
    expect(cd('Cd(~/code/**)', '/home/alice/other')).toBe(false);
    expect(cd('Cd(~/code/**)', '/home/alice/codex')).toBe(false);
  });

  test('Cd(**/node_modules) matches any node_modules directory under the cwd, not what is inside', () => {
    expect(cd('Cd(**/node_modules)', '/work/app/node_modules')).toBe(true);
    expect(cd('Cd(**/node_modules)', '/work/app/pkg/a/node_modules')).toBe(true);
    expect(cd('Cd(**/node_modules)', '/work/app/node_modules/pkg')).toBe(false);
    expect(cd('Cd(**/node_modules)', '/work/other/node_modules')).toBe(false);
  });

  test('the // and / anchors work as for Read and Edit', () => {
    expect(cd('Cd(//opt/*)', '/opt/tool')).toBe(true);
    expect(cd('Cd(/pkg/*)', '/work/app/pkg/a')).toBe(true);
  });

  test('a deny rule checks every spelling of the target, an allow rule only the resolved one', () => {
    const target = { resolved: '/data/real', spellings: ['/work/app/link', '/data/real'] };
    expect(matchCdRule(parsed('Cd(/link)', 'deny'), target, matchContext)).toBe(true);
    expect(matchCdRule(parsed('Cd(/link)', 'allow'), target, matchContext)).toBe(false);
    expect(matchCdRule(parsed('Cd(//data/*)', 'allow'), target, matchContext)).toBe(true);
  });

  test('a bare Cd rule has no path to match', () => {
    expect(
      matchCdRule(parsed('Cd', 'deny'), { resolved: '/a', spellings: ['/a'] }, matchContext),
    ).toBe(false);
  });
});
