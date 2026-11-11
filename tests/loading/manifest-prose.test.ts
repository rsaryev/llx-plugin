/** plugins/manifest-reference.md § Containment and existence, § hooks; plugins/troubleshooting.md § claude plugin validate reports errors. */
import { expect, test } from 'bun:test';
import { readManifest } from '../../src/format/manifest.ts';
import { discoverComponents } from '../../src/loading/discover.ts';
import { loadPlugin } from '../../src/loading/load-plugin.ts';
import { validatePlugin } from '../../src/loading/validate/validate-plugin.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

const manifest = { name: 'demo', version: '1.0.0', description: 'Demo', author: { name: 'Team' } };

spec(
  [
    'manifest.rule.Containment and existence',
    "manifest.troubleshooting.Files the plugin references outside its directory aren't found",
  ],
  () => {
    test('missing and escaping component paths never load; internal paths do', async () => {
      const found = await discoverComponents(
        memoryFiles({
          'commands/linked.md': { symlink: '../shared/go.md' },
          'commands/inside.md': 'inside',
        }),
        {
          ...manifest,
          commands: ['./commands/linked.md', './commands/missing.md', './commands/inside.md'],
        },
        'demo',
      );
      expect(found.commands.map((entry) => entry.path)).toEqual(['commands/inside.md']);
      expect(found.issues.map((issue) => issue.message)).toContain(
        'commands path not found: ./commands/missing.md',
      );
      expect(found.issues.map((issue) => issue.message)).toContain(
        'commands path escapes plugin directory: ./commands/linked.md — it resolves to ../shared/go.md, outside the plugin directory',
      );
      expect(
        readManifest({ ...manifest, commands: './../shared' }).issues.map((issue) => issue.message),
      ).toContain('Path contains ".." which could be a path traversal attempt: ./../shared');
    });
  },
);

spec('manifest.rule.hooks', () => {
  test('a file needs the hooks wrapper while an inline object is the bare map', async () => {
    const hook = [{ hooks: [{ type: 'command', command: 'run' }] }];
    const files = {
      '.claude-plugin/plugin.json': JSON.stringify({
        ...manifest,
        hooks: ['./extra.json', { PostToolUse: hook }],
      }),
      'hooks/hooks.json': JSON.stringify({ hooks: { SessionStart: hook } }),
      'extra.json': JSON.stringify({ hooks: { Stop: hook } }),
    };
    const good = await loadPlugin({ files: memoryFiles(files) });
    expect(Object.keys(good.plugin?.hooks ?? {}).toSorted()).toEqual([
      'PostToolUse',
      'SessionStart',
      'Stop',
    ]);
    expect(good.issues).toEqual([]);
    const bad = await loadPlugin({
      files: memoryFiles({ ...files, 'extra.json': JSON.stringify({ Stop: hook }) }),
    });
    expect(bad.plugin?.hooks.Stop).toBeUndefined();
    expect(bad.issues).toContainEqual(expect.objectContaining({ severity: 'error' }));
  });
});

spec(
  'manifest.troubleshooting.claude plugin validate reports errors.File not found: <path>',
  () => {
    test('a missing target reports the supplied target path', async () => {
      const files = memoryFiles({});
      const report = await validatePlugin({
        files: {
          ...files,
          stat: () => Promise.resolve(undefined),
          list: () => Promise.resolve(undefined),
        },
        label: '/missing/plugin',
      });
      expect(report.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', message: 'File not found: /missing/plugin' }),
      );
    });
  },
);

spec(
  'manifest.troubleshooting.claude plugin validate reports errors.Invalid JSON syntax: <parse error>',
  () => {
    test('invalid manifest or hooks JSON is an error, with the parser reason', async () => {
      for (const files of [
        { '.claude-plugin/plugin.json': '{' },
        { '.claude-plugin/plugin.json': JSON.stringify(manifest), 'hooks/hooks.json': '{' },
      ]) {
        const report = await validatePlugin({ files: memoryFiles(files) });
        expect(report.issues).toContainEqual(
          expect.objectContaining({
            severity: 'error',
            message: expect.stringMatching(/^Invalid JSON syntax: .+/),
          }),
        );
      }
    });
  },
);

spec(
  'manifest.troubleshooting.claude plugin validate reports errors.No frontmatter block found',
  () => {
    test('a component without frontmatter emits the documented warning', async () => {
      const report = await validatePlugin({
        files: memoryFiles({
          '.claude-plugin/plugin.json': JSON.stringify(manifest),
          'skills/go/SKILL.md': 'Go.',
        }),
      });
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringMatching(/^No frontmatter block found(?:\.|$)/),
        }),
      );
    });
  },
);

spec(
  [
    "manifest.troubleshooting.claude plugin validate reports errors.Unknown field '<key>'",
    'manifest.rule.Unrecognized fields',
  ],
  () => {
    test('an unknown top-level field is a warning, but loading strips it and succeeds', async () => {
      const raw = { ...manifest, unpublished: true };
      const report = await validatePlugin({
        files: memoryFiles({ '.claude-plugin/plugin.json': JSON.stringify(raw) }),
      });
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringMatching(/^Unknown field 'unpublished'/),
        }),
      );
      const loaded = readManifest(raw);
      expect(loaded.manifest).toEqual(manifest);
    });
  },
);

spec('manifest.rule.Unrecognized fields', () => {
  test('an unknown key inside a userConfig option or a channels entry is an error', () => {
    const option = readManifest({
      name: 'p',
      userConfig: { k: { type: 'string', title: 't', description: 'd', bogus: 1 } },
    });
    expect(option.issues.map((found) => [found.severity, found.path])).toEqual([
      ['error', 'userConfig.k'],
    ]);
    const channel = readManifest({ name: 'p', channels: [{ server: 's', bogus: 1 }] });
    expect(channel.issues.map((found) => found.severity)).toEqual(['error']);
  });
});

spec('manifest.rule.version', () => {
  test('a version string is not checked against semver', () => {
    for (const version of ['1.2.0', 'banana', '2026-11-08', '1']) {
      const read = readManifest({ name: 'p', version });
      expect(read.issues).toEqual([]);
      expect(read.manifest?.version).toBe(version);
    }
  });
});
