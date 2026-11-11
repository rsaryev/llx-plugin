/**
 * plugins/marketplace-reference.md § Strict mode (the table, row by row); plugins/manifest-reference.md
 * § How entry fields combine with `plugin.json` and § Metadata precedence ("regardless of `strict`").
 * Each test is one row of the doc's table or one bullet; the entry is read with the real entry reader
 * and merged with `mergeEntryWithManifest`.
 */
import { describe, expect, test } from 'bun:test';
import { mergeEntryWithManifest } from '../../../src/format/marketplace/entry-merge.ts';
import type { PluginManifest } from '../../../src/format/manifest-schema.ts';
import { loaded, rawEntry } from '../../support/marketplace-entries.ts';
import { spec } from '../../support/spec.ts';

const merge = (changes: Record<string, unknown>, manifest?: PluginManifest) =>
  mergeEntryWithManifest(loaded(rawEntry(changes)), manifest);
const manifestOf = (rest: Record<string, unknown> = {}): PluginManifest => ({
  name: 'my-plugin',
  ...rest,
});

const CONFLICT =
  'Plugin my-plugin has conflicting manifests: both plugin.json and marketplace entry specify components';

/** One declaration of each of the six component fields the table is about. */
const SIX = {
  commands: ['./cmds/'],
  agents: ['./agents/a.md'],
  skills: ['./skills/'],
  hooks: { Stop: [{ hooks: [] }] },
  outputStyles: ['./styles/'],
  themes: ['./themes/'],
} as const;

spec('marketplace.rule.Strict mode.any', () => {
  test('row 1: with plugin.json absent the entry is the manifest, for strict true, false and unset, with any component fields', () => {
    for (const strict of [true, false, undefined]) {
      for (const [field, value] of Object.entries(SIX)) {
        const result = merge({ strict, [field]: value });
        expect(result.issues).toEqual([]);
        expect(result.manifest).toEqual({ name: 'my-plugin', [field]: value });
      }
      expect(merge({ strict }).manifest).toEqual({ name: 'my-plugin' });
    }
  });
});

spec('marketplace.rule.Strict mode.true', () => {
  test('row 2: with plugin.json present, the entry component fields are appended after the manifest ones', () => {
    for (const strict of [true, undefined]) {
      for (const field of ['commands', 'agents', 'skills', 'outputStyles', 'themes'] as const) {
        const result = merge(
          { strict, [field]: ['./entry/'] },
          manifestOf({ [field]: ['./manifest/'] }),
        );
        expect(result.issues).toEqual([]);
        expect(Reflect.get(result.manifest ?? {}, field)).toEqual(['./manifest/', './entry/']);
      }
    }
  });

  test('row 2: plugin.json stays the authority: a field only it declares is kept untouched', () => {
    const manifest = manifestOf({ commands: ['./cmds/'], themes: ['./themes/'] });
    const result = merge({ strict: true, skills: ['./s/'] }, manifest);
    expect(result.manifest).toEqual({ ...manifest, skills: ['./s/'] });
  });

  test('row 2, the exception: hooks replace the manifest matchers per event instead of appending', () => {
    const result = merge(
      { strict: true, hooks: { PreToolUse: [{ matcher: 'Write', hooks: [] }] } },
      manifestOf({
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [] }],
          Stop: [{ hooks: [] }],
        },
      }),
    );
    expect(result.manifest?.hooks).toEqual({
      PreToolUse: [{ matcher: 'Write', hooks: [] }],
      Stop: [{ hooks: [] }],
    });
    expect(result.replacedHookEvents).toEqual(['PreToolUse']);
  });
});

spec('marketplace.rule.Strict mode.false', () => {
  test('row 3: with plugin.json present and no component field, plugin.json is the manifest, as with true', () => {
    const manifest = manifestOf({ skills: ['./skills/'], hooks: { Stop: [] } });
    const withFalse = merge({ strict: false }, manifest);
    expect(withFalse.issues).toEqual([]);
    expect(withFalse.manifest).toEqual(manifest);
    expect(withFalse.manifest).toEqual(merge({ strict: true }, manifest).manifest);
  });

  describe('row 4: one or more component fields is a conflict and the plugin fails to load', () => {
    for (const [field, value] of Object.entries(SIX)) {
      test(`${field} alone`, () => {
        const result = merge({ strict: false, [field]: value }, manifestOf());
        expect(result.manifest).toBeUndefined();
        expect(result.issues).toEqual([{ severity: 'error', path: 'plugin', message: CONFLICT }]);
      });
    }

    test('all six together report the conflict once', () => {
      const result = merge({ strict: false, ...SIX }, manifestOf());
      expect(result.manifest).toBeUndefined();
      expect(result.issues.map((issue) => issue.message)).toEqual([CONFLICT]);
    });

    test('the message names the plugin by the entry name', () => {
      const result = merge({ name: 'deploy', strict: false, skills: ['./s/'] }, manifestOf());
      expect(result.issues[0]?.message).toBe(
        'Plugin deploy has conflicting manifests: both plugin.json and marketplace entry specify components',
      );
    });
  });

  test('a field that is not one of the six is no conflict: display fields and dependencies pass', () => {
    const result = merge(
      { strict: false, description: 'd', license: 'MIT', category: 'x', tags: ['t'] },
      manifestOf(),
    );
    expect(result.manifest).toBeDefined();
    expect(result.issues).toEqual([]);
  });
});

spec('marketplace.rule.How entry fields combine with plugin.json', () => {
  test('no plugin.json: entry hooks load only in the inline object form', () => {
    const inline = merge({ hooks: { Stop: [{ hooks: [] }] } });
    expect(inline.manifest?.hooks).toEqual({ Stop: [{ hooks: [] }] });
    expect(inline.issues).toEqual([]);
  });

  test('no plugin.json: hooks given as a file path or an array are an error and do not load', () => {
    // "the entry is the manifest, regardless of `strict`"
    for (const strict of [true, false, undefined]) {
      for (const hooks of ['./hooks/hooks.json', [{ hooks: [] }]]) {
        const result = merge({ hooks, ...(strict === undefined ? {} : { strict }) });
        expect(result.manifest?.hooks).toBeUndefined();
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]?.severity).toBe('error');
        expect(result.issues[0]?.message).toContain('not yet supported in a marketplace entry');
      }
    }
  });

  test('plugin.json present, strict unset: appends commands, agents, skills, outputStyles and themes', () => {
    const result = merge(
      {
        commands: ['./b/'],
        agents: ['./b.md'],
        skills: ['./b/'],
        outputStyles: ['./b/'],
        themes: ['./b/'],
      },
      manifestOf({
        commands: ['./a/'],
        agents: ['./a.md'],
        skills: ['./a/'],
        outputStyles: ['./a/'],
        themes: ['./a/'],
      }),
    );
    expect(result.manifest).toEqual({
      name: 'my-plugin',
      commands: ['./a/', './b/'],
      agents: ['./a.md', './b.md'],
      skills: ['./a/', './b/'],
      outputStyles: ['./a/', './b/'],
      themes: ['./a/', './b/'],
    });
  });

  test('plugin.json present, strict unset: the entry matchers of an event replace the manifest ones for that event', () => {
    const result = merge(
      { hooks: { PreToolUse: [{ matcher: 'Write', hooks: [] }] } },
      manifestOf({
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [] }],
          Stop: [{ hooks: [] }],
        },
      }),
    );
    expect(result.manifest?.hooks).toEqual({
      PreToolUse: [{ matcher: 'Write', hooks: [] }],
      Stop: [{ hooks: [] }],
    });
    expect(result.replacedHookEvents).toEqual(['PreToolUse']);
  });

  test('plugin.json present, strict unset: events only the manifest declares keep their matchers', () => {
    const result = merge(
      { hooks: { Stop: [{ hooks: [] }] } },
      manifestOf({ hooks: { SessionStart: [{ hooks: [] }] } }),
    );
    expect(Object.keys(result.manifest?.hooks ?? {}).toSorted()).toEqual(['SessionStart', 'Stop']);
  });

  test('plugin.json present, strict false: an entry declaring any of the six is a conflict', () => {
    expect(merge({ strict: false, themes: ['./t/'] }, manifestOf()).manifest).toBeUndefined();
  });

  describe('an entry whose source is the marketplace root and lists skills', () => {
    test('loads only those subdirectories: the default skills/ directory is not scanned', () => {
      expect(merge({ source: '.', skills: ['./skills/a', './skills/b'] }).scanDefaultSkills).toBe(
        false,
      );
      expect(merge({ source: '.', skills: ['./skills/a'] }, manifestOf()).scanDefaultSkills).toBe(
        false,
      );
    });

    test('a root entry that lists no skills scans the default directory', () => {
      expect(merge({ source: '.' }).scanDefaultSkills).toBe(true);
    });

    test('an entry that is not the root scans it even when it lists skills', () => {
      expect(merge({ skills: ['./skills/a'] }).scanDefaultSkills).toBe(true);
    });

    test('a skills key in the manifest adds to the default instead', () => {
      const result = merge({ source: '.' }, manifestOf({ skills: ['./extra/'] }));
      expect(result.scanDefaultSkills).toBe(true);
      expect(result.manifest?.skills).toEqual(['./extra/']);
    });
  });
});

describe('metadata precedence, whatever strict says', () => {
  const both = [true, false] as const;

  spec('marketplace.rule.Metadata precedence.defaultEnabled and display fields', () => {
    test("the entry's defaultEnabled and display fields override the manifest's for strict true and false", () => {
      for (const strict of both) {
        const result = merge(
          { strict, defaultEnabled: false, displayName: 'Entry', license: 'MIT' },
          manifestOf({ defaultEnabled: true, displayName: 'Manifest', license: 'ISC' }),
        );
        expect(result.manifest?.defaultEnabled).toBe(false);
        expect(result.manifest?.displayName).toBe('Entry');
        expect(result.manifest?.license).toBe('MIT');
      }
    });

    test('a field the entry leaves unset keeps the manifest value', () => {
      for (const strict of both) {
        const result = merge({ strict, displayName: 'Entry' }, manifestOf({ license: 'ISC' }));
        expect(result.manifest?.license).toBe('ISC');
      }
    });
  });

  spec('marketplace.rule.Metadata precedence.version', () => {
    test("the manifest's version overrides the entry's for strict true and false", () => {
      for (const strict of both) {
        const result = merge({ strict, version: '1.0.0' }, manifestOf({ version: '2.0.0' }));
        expect(result.manifest?.version).toBe('2.0.0');
      }
    });

    test('an entry version that plugin.json lacks is the plugin version', () => {
      for (const strict of both) {
        expect(merge({ strict, version: '1.0.0' }, manifestOf()).manifest?.version).toBe('1.0.0');
      }
    });
  });

  spec('marketplace.rule.Metadata precedence.name', () => {
    test('enabledPlugins uses the entry name and components are namespaced under the manifest name', () => {
      for (const strict of both) {
        const result = merge({ strict, name: 'deploy' }, manifestOf({ name: 'deploy-tools' }));
        expect(result.installName).toBe('deploy');
        expect(result.manifest?.name).toBe('deploy-tools');
      }
    });

    test('the entry never renames the manifest: a name only the entry has is not copied over', () => {
      const result = merge({ name: 'deploy' }, manifestOf({ name: 'deploy-tools' }));
      expect(result.manifest?.name).not.toBe('deploy');
    });
  });
});
