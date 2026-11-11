/**
 * marketplace-reference.md § How an entry combines with plugin.json, § Hooks in an entry,
 * § Display fields, § Strict mode (the table); manifest-reference.md § Marketplace entries and the
 * manifest (How entry fields combine with plugin.json, Metadata precedence);
 * create-marketplace.md § Keep the entry name and the manifest name the same;
 * troubleshooting.md § Plugin <name> has conflicting manifests.
 *
 * The merge is pure over a parsed entry and a parsed plugin.json (`undefined` when the plugin has
 * none). Entries are read with the real entry reader so a test names only what it is about.
 */
import { describe, expect, test } from 'bun:test';
import { mergeEntryWithManifest } from '../../../src/format/marketplace/entry-merge.ts';
import type { PluginManifest } from '../../../src/format/manifest-schema.ts';
import { loaded, rawEntry } from '../../support/marketplace-entries.ts';
import { spec } from '../../support/spec.ts';

const entryOf = (changes: Record<string, unknown> = {}) => loaded(rawEntry(changes));
const merge = (changes: Record<string, unknown>, manifest?: PluginManifest) =>
  mergeEntryWithManifest(entryOf(changes), manifest);
const manifestOf = (rest: Record<string, unknown> = {}): PluginManifest => ({
  name: 'my-plugin',
  ...rest,
});

const CONFLICT =
  'Plugin my-plugin has conflicting manifests: both plugin.json and marketplace entry specify components';

spec(
  ['marketplace.entry.strict', 'manifest.troubleshooting.Plugin <name> has conflicting manifests'],
  () => {
    describe('plugin.json absent: the entry is the manifest, whatever strict says', () => {
      const components = {
        commands: ['./cmds/'],
        agents: ['./agents/a.md'],
        skills: ['./skills/'],
        outputStyles: ['./styles/'],
        themes: ['./themes/'],
        hooks: { PostToolUse: [{ matcher: 'Write', hooks: [] }] },
      };

      test('every component field of the entry applies, with strict true or false', () => {
        for (const strict of [true, false]) {
          const result = merge({ strict, ...components });
          expect(result.issues).toEqual([]);
          expect(result.manifest).toEqual({ name: 'my-plugin', ...components });
        }
      });

      test('mcpServers, lspServers, userConfig and channels apply too', () => {
        const extra = {
          mcpServers: { db: { command: 'db-mcp' } },
          lspServers: { ts: { command: 'tsserver' } },
          userConfig: {
            api_token: {
              type: 'string',
              title: 'Token',
              description: 'API token',
              sensitive: true,
            },
          },
          channels: [{ server: 'db' }],
        } satisfies Partial<PluginManifest>;
        const result = merge({ ...extra });
        expect(result.manifest).toEqual({ name: 'my-plugin', ...extra });
      });
    });

    describe('plugin.json present and strict true (the default): the entry completes it', () => {
      test("commands, agents, skills, outputStyles and themes are appended to the manifest's", () => {
        const result = merge(
          {
            commands: ['./more-cmds/'],
            agents: './agents/b.md',
            skills: ['./extra-skills/'],
            outputStyles: ['./terse/'],
            themes: './night/',
          },
          manifestOf({
            commands: './cmds/',
            agents: ['./agents/a.md'],
            skills: './skills/',
            outputStyles: ['./styles/'],
            themes: ['./themes/'],
          }),
        );
        expect(result.issues).toEqual([]);
        expect(result.manifest).toEqual({
          name: 'my-plugin',
          commands: ['./cmds/', './more-cmds/'],
          agents: ['./agents/a.md', './agents/b.md'],
          skills: ['./skills/', './extra-skills/'],
          outputStyles: ['./styles/', './terse/'],
          themes: ['./themes/', './night/'],
        });
      });

      test('a field only the entry declares is added; a field only the manifest declares stays', () => {
        const result = merge({ skills: ['./s/'] }, manifestOf({ agents: ['./agents/a.md'] }));
        expect(result.manifest).toEqual({
          name: 'my-plugin',
          agents: ['./agents/a.md'],
          skills: ['./s/'],
        });
      });

      test("hooks: the entry's matchers for an event replace the manifest's for that event; other events keep theirs", () => {
        const fromManifest = {
          PreToolUse: [{ matcher: 'Bash', hooks: [] }],
          PostToolUse: [{ matcher: 'Edit', hooks: [] }],
        };
        const fromEntry = { PreToolUse: [{ matcher: 'Write', hooks: [] }], Stop: [{ hooks: [] }] };
        const result = merge({ hooks: fromEntry }, manifestOf({ hooks: fromManifest }));
        expect(result.issues).toEqual([]);
        expect(result.manifest?.hooks).toEqual({
          PreToolUse: fromEntry.PreToolUse,
          PostToolUse: fromManifest.PostToolUse,
          Stop: fromEntry.Stop,
        });
        expect([...result.replacedHookEvents].toSorted()).toEqual(['PreToolUse', 'Stop']);
      });

      test('an entry with no component fields leaves the manifest as it is', () => {
        const manifest = manifestOf({ commands: ['./cmds/'], hooks: { Stop: [] } });
        const result = merge({}, manifest);
        expect(result.manifest).toEqual(manifest);
        expect(result.replacedHookEvents).toEqual([]);
      });
    });

    describe('plugin.json present and strict false', () => {
      test('an entry with no component field leaves plugin.json as the manifest', () => {
        const manifest = manifestOf({ commands: ['./cmds/'] });
        const result = merge({ strict: false }, manifest);
        expect(result.issues).toEqual([]);
        expect(result.manifest).toEqual(manifest);
      });

      test('any of the six component fields is a conflict: the plugin fails to load, with the documented message', () => {
        const declared: Record<string, unknown>[] = [
          { commands: ['./c/'] },
          { agents: ['./a.md'] },
          { skills: ['./s/'] },
          { hooks: { Stop: [] } },
          { outputStyles: ['./o/'] },
          { themes: ['./t/'] },
        ];
        for (const fields of declared) {
          const result = merge({ strict: false, ...fields }, manifestOf());
          expect(result.manifest).toBeUndefined();
          expect(result.issues).toEqual([{ severity: 'error', path: 'plugin', message: CONFLICT }]);
        }
      });

      test('entry mcpServers, lspServers, userConfig and channels are not component conflicts', () => {
        const result = merge({ strict: false, mcpServers: { db: { command: 'x' } } }, manifestOf());
        expect(result.manifest).toEqual(manifestOf());
        expect(result.issues).toEqual([]);
      });

      test('the same entry with strict true is not a conflict: the components are appended', () => {
        const result = merge({ strict: true, commands: ['./c/'] }, manifestOf());
        expect(result.issues).toEqual([]);
        expect(result.manifest?.commands).toEqual(['./c/']);
      });
    });

    test('the conflict names the plugin by its entry name', () => {
      const result = mergeEntryWithManifest(
        entryOf({ name: 'deploy-kit', strict: false, skills: ['./s/'] }),
        manifestOf({ name: 'deploy-tools' }),
      );
      expect(result.issues[0]?.message).toBe(
        'Plugin deploy-kit has conflicting manifests: both plugin.json and marketplace entry specify components',
      );
    });
  },
);

spec('marketplace.entry.strict', () => {
  describe('fields an entry sets but plugin.json outranks', () => {
    test('entry mcpServers, lspServers, userConfig and channels do not apply when plugin.json is present (either strict)', () => {
      const entryOnly = {
        mcpServers: { db: { command: 'entry-db' } },
        lspServers: { ts: { command: 'entry-ts' } },
        userConfig: { k: { type: 'string', title: 'K', description: 'k' } },
        channels: [{ server: 'db' }],
      };
      const manifest = manifestOf({ mcpServers: { db: { command: 'manifest-db' } } });
      for (const strict of [true, false]) {
        const result = merge({ strict, ...entryOnly }, manifest);
        expect(result.manifest).toEqual(manifest);
      }
    });
  });
});

spec(['marketplace.entry.strict', 'marketplace.rule.Hooks in an entry'], () => {
  describe('hooks in an entry', () => {
    test('a file path or an array is accepted by validation and never runs: the load reports "not yet supported in a marketplace entry"', () => {
      for (const hooks of ['./hooks/extra.json', ['./hooks/extra.json'], [{ Stop: [] }]]) {
        const result = merge({ hooks });
        expect(result.manifest).toEqual({ name: 'my-plugin' });
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]?.severity).toBe('error');
        expect(result.issues[0]?.path).toBe('hooks');
        expect(result.issues[0]?.message).toContain('not yet supported in a marketplace entry');
      }
    });

    test("with plugin.json present the manifest's own hooks keep running and the entry's are the ones left out", () => {
      const manifest = manifestOf({ hooks: { Stop: [{ hooks: [] }] } });
      const result = merge({ hooks: './hooks/extra.json' }, manifest);
      expect(result.manifest).toEqual(manifest);
      expect(result.replacedHookEvents).toEqual([]);
      expect(result.issues[0]?.message).toContain('not yet supported in a marketplace entry');
    });

    test('an inline object is the supported form and reports nothing', () => {
      expect(merge({ hooks: { Stop: [{ hooks: [] }] } }).issues).toEqual([]);
    });
  });
});

spec('marketplace.entry.strict', () => {
  describe('root-source entries and the default skills scan', () => {
    test('an entry whose source is the marketplace root and that lists skills loads only those: the default skills/ is not scanned', () => {
      const result = merge({ source: '.', skills: ['./skills/review/'] });
      expect(result.scanDefaultSkills).toBe(false);
      expect(result.manifest?.skills).toEqual(['./skills/review/']);
    });

    test('a skills key in the manifest instead adds to the default', () => {
      const result = merge({ source: '.' }, manifestOf({ skills: ['./extra/'] }));
      expect(result.scanDefaultSkills).toBe(true);
    });

    test('an entry that lists no skills, or whose source is not the root, scans the default as usual', () => {
      expect(merge({ source: '.' }).scanDefaultSkills).toBe(true);
      expect(merge({ skills: ['./s/'] }).scanDefaultSkills).toBe(true);
    });
  });
});
