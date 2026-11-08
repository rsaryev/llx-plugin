/**
 * Judgments of the strict-mode merge: what plugins/marketplace-reference.md ("Strict mode",
 * "Hooks in an entry") and plugins/manifest-reference.md ("How entry fields combine with
 * `plugin.json`") leave open (spec/judgments.md lists each). Tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { mergeEntryWithManifest } from '../../../src/format/marketplace/entry-merge.ts';
import type { PluginManifest } from '../../../src/format/manifest-schema.ts';
import { loaded, rawEntry } from '../../support/marketplace-entries.ts';

const merge = (changes: Record<string, unknown>, manifest?: PluginManifest) =>
  mergeEntryWithManifest(loaded(rawEntry(changes)), manifest);
const manifestOf = (rest: Record<string, unknown> = {}): PluginManifest => ({
  name: 'my-plugin',
  ...rest,
});

describe('judgment: fields the docs leave out of the four that "don\'t apply" beside a plugin.json', () => {
  test('settings, workflows, monitors, experimental and types of the entry do not apply either', () => {
    const entryOnly = {
      settings: { agent: 'entry' },
      workflows: './entry-wf/',
      monitors: './entry-monitors.json',
      experimental: { themes: './entry-themes/' },
      types: './entry.d.ts',
    };
    const manifest = manifestOf({ settings: { agent: 'manifest' } });
    for (const strict of [true, false]) {
      expect(merge({ strict, ...entryOnly }, manifest).manifest).toEqual(manifest);
    }
  });

  test('without a plugin.json they apply with the other manifest fields', () => {
    const entryOnly = { settings: { agent: 'entry' }, workflows: './wf/', types: './t.d.ts' };
    expect(merge({ ...entryOnly }).manifest).toEqual({ name: 'my-plugin', ...entryOnly });
  });
});

describe('judgment: dependencies of an entry and of plugin.json', () => {
  test("both count: the entry's follow the manifest's (dependencies.md refuses an install over an entry's)", () => {
    const result = merge(
      { dependencies: ['b', { name: 'c', version: '^1.0.0' }] },
      manifestOf({ dependencies: ['a'] }),
    );
    expect(result.manifest?.dependencies).toEqual(['a', 'b', { name: 'c', version: '^1.0.0' }]);
  });

  test('with strict false too (dependencies are not one of the six component fields)', () => {
    const result = merge(
      { strict: false, dependencies: ['b'] },
      manifestOf({ dependencies: ['a'] }),
    );
    expect(result.issues).toEqual([]);
    expect(result.manifest?.dependencies).toEqual(['a', 'b']);
  });

  test('an entry without a plugin.json is the manifest, dependencies included', () => {
    expect(merge({ dependencies: ['a'] }).manifest?.dependencies).toEqual(['a']);
  });
});

describe('judgment: commands given as a map or as paths', () => {
  test("two maps merge and the entry's command replaces one of the same name", () => {
    const result = merge(
      { commands: { deploy: { content: 'entry deploy' }, lint: { content: 'lint' } } },
      manifestOf({
        commands: { deploy: { content: 'manifest deploy' }, test: { content: 'test' } },
      }),
    );
    expect(result.manifest?.commands).toEqual({
      deploy: { content: 'entry deploy' },
      lint: { content: 'lint' },
      test: { content: 'test' },
    });
  });

  test("a map beside a list cannot be one field: plugin.json's stays and the entry's is reported", () => {
    const result = merge(
      { commands: { lint: { content: 'lint' } } },
      manifestOf({ commands: ['./cmds/'] }),
    );
    expect(result.manifest?.commands).toEqual(['./cmds/']);
    expect(result.issues.map((found) => [found.severity, found.path])).toEqual([
      ['warning', 'commands'],
    ]);
  });
});

describe('judgment: hooks the manifest keeps in files', () => {
  const entryHooks = { PreToolUse: [{ matcher: 'Write', hooks: [] }] };

  test("a manifest hooks path stays and the entry's object follows it; the events it replaces are listed", () => {
    const result = merge({ hooks: entryHooks }, manifestOf({ hooks: './hooks/extra.json' }));
    expect(result.manifest?.hooks).toEqual(['./hooks/extra.json', entryHooks]);
    expect(result.replacedHookEvents).toEqual(['PreToolUse']);
  });

  test('in a manifest array the inline objects lose the replaced events and the files stay', () => {
    const inline = { PreToolUse: [{ matcher: 'Bash', hooks: [] }], Stop: [{ hooks: [] }] };
    const result = merge({ hooks: entryHooks }, manifestOf({ hooks: ['./a.json', inline] }));
    expect(result.manifest?.hooks).toEqual(['./a.json', { Stop: inline.Stop }, entryHooks]);
  });

  test("an entry hooks object is the whole entry's hooks when the manifest has none", () => {
    expect(merge({ hooks: entryHooks }, manifestOf()).manifest?.hooks).toEqual(entryHooks);
    expect(merge({ hooks: entryHooks }, manifestOf()).replacedHookEvents).toEqual(['PreToolUse']);
  });

  test("without a plugin.json nothing is replaced: the entry hooks merge with hooks/hooks.json as a manifest's do", () => {
    expect(merge({ hooks: entryHooks }).replacedHookEvents).toEqual([]);
  });

  test('replacement keeps a hook event named like an object member', () => {
    const hooks = JSON.parse('{"constructor":[],"toString":[]}');
    const result = merge({ hooks }, manifestOf({ hooks: { Stop: [] } }));
    expect(Object.keys(result.manifest?.hooks ?? {}).toSorted()).toEqual([
      'Stop',
      'constructor',
      'toString',
    ]);
  });
});

describe('judgment: the root-source skills rule', () => {
  test("applies beside a plugin.json too: the entry's listed skills and the manifest's are the only ones loaded", () => {
    const result = merge(
      { source: '.', skills: ['./skills/a/'] },
      manifestOf({ skills: ['./skills/b/'] }),
    );
    expect(result.scanDefaultSkills).toBe(false);
    expect(result.manifest?.skills).toEqual(['./skills/b/', './skills/a/']);
  });
});

describe('judgment: the conflict and the unsupported hooks are reported on the plugin', () => {
  test('the conflict is on path "plugin" and the plugin does not load', () => {
    const result = merge({ strict: false, themes: ['./t/'] }, manifestOf());
    expect(result.manifest).toBeUndefined();
    expect(result.replacedHookEvents).toEqual([]);
    expect(result.issues.map((found) => found.path)).toEqual(['plugin']);
  });

  test('a strict-false entry with unsupported hooks is a conflict, not a hooks report: it declares hooks', () => {
    const result = merge({ strict: false, hooks: './h.json' }, manifestOf());
    expect(result.manifest).toBeUndefined();
    expect(result.issues[0]?.message).toContain('has conflicting manifests');
  });
});
