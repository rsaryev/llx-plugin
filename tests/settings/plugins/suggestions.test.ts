/**
 * settings-reference.md § `pluginSuggestionMarketplaces` (Scope "Managed"; Type "array of
 * marketplace names"; Default "unset, so no marketplace-declared suggestions surface"; "A name takes
 * effect only when the marketplace is registered on the machine and its registered source is also
 * declared in the same managed settings, either as the `extraKnownMarketplaces` entry for that name
 * or as an entry of `strictKnownMarketplaces`. Claude Code ignores a marketplace registered from a
 * different source under an allowlisted name. The official marketplace is exempt from the source
 * requirement: allowlisting its name alone suffices"), plugins/relevance.md § Enable suggestions in
 * managed settings (the two JSON examples; "On a machine where the marketplace isn't registered, or is
 * registered under the allowlisted name from a different source, no suggestions from it appear"),
 * plugins/org.md § Recommend plugins.
 */
import { describe, expect, test } from 'bun:test';
import { suggestionMarketplaces } from '../../../src/settings/plugins/index.ts';
import { git, github } from '../../support/marketplace-sources.ts';
import { viewOf, type Source } from '../../support/plugin-settings.ts';
import { spec } from '../../support/spec.ts';

const yours = github('your-org/your-marketplace');
const official = github('anthropics/claude-plugins-official');

const docsExample: Source = [
  'managed',
  {
    extraKnownMarketplaces: { 'your-marketplace': { source: yours } },
    pluginSuggestionMarketplaces: ['your-marketplace'],
  },
];

const effective = (
  sources: readonly Source[],
  registered: Parameters<typeof suggestionMarketplaces>[1],
): readonly string[] => suggestionMarketplaces(viewOf(...sources), registered);

const allowlisted = (...entries: unknown[]): Source => [
  'managed',
  { strictKnownMarketplaces: entries, pluginSuggestionMarketplaces: ['your-marketplace'] },
];

spec(
  [
    'settings.key.pluginSuggestionMarketplaces',
    'policy.org.Control matrix.pluginSuggestionMarketplaces',
    'policy.org.Recommend plugins',
    'policy.relevance.Enable suggestions in managed settings',
  ],
  () => {
    describe('the default', () => {
      test('unset: no marketplace-declared suggestion surfaces, whatever is registered', () => {
        expect(effective([], { 'your-marketplace': yours })).toEqual([]);
        expect(
          effective(
            [['managed', { extraKnownMarketplaces: { 'your-marketplace': { source: yours } } }]],
            {
              'your-marketplace': yours,
            },
          ),
        ).toEqual([]);
      });

      test('an empty list names no marketplace', () => {
        expect(
          effective([['managed', { pluginSuggestionMarketplaces: [] }]], { x: yours }),
        ).toEqual([]);
      });
    });

    describe('declared as the extraKnownMarketplaces entry of that name', () => {
      test('the docs example: the registered marketplace takes effect', () => {
        expect(effective([docsExample], { 'your-marketplace': yours })).toEqual([
          'your-marketplace',
        ]);
      });

      test('a marketplace that is not registered on the machine does not', () => {
        expect(effective([docsExample], {})).toEqual([]);
        expect(effective([docsExample], { other: yours })).toEqual([]);
      });

      test('a marketplace registered under the name from a different source is ignored', () => {
        const lookalike = github('attacker/your-marketplace');
        expect(effective([docsExample], { 'your-marketplace': lookalike })).toEqual([]);
        expect(
          effective([docsExample], { 'your-marketplace': git('https://git.example.com/m.git') }),
        ).toEqual([]);
      });

      test('a different ref is a different source', () => {
        const pinned: Source = [
          'managed',
          {
            extraKnownMarketplaces: {
              'your-marketplace': { source: github('your-org/m', { ref: 'v2' }) },
            },
            pluginSuggestionMarketplaces: ['your-marketplace'],
          },
        ];
        expect(
          effective([pinned], { 'your-marketplace': github('your-org/m', { ref: 'v2' }) }),
        ).toEqual(['your-marketplace']);
        expect(
          effective([pinned], { 'your-marketplace': github('your-org/m', { ref: 'v1' }) }),
        ).toEqual([]);
      });

      test('a declared marketplace the list does not name has no suggestions', () => {
        const unlisted: Source = [
          'managed',
          {
            extraKnownMarketplaces: {
              'your-marketplace': { source: yours },
              other: { source: github('your-org/other') },
            },
            pluginSuggestionMarketplaces: ['your-marketplace'],
          },
        ];
        const registered = { 'your-marketplace': yours, other: github('your-org/other') };
        expect(effective([unlisted], registered)).toEqual(['your-marketplace']);
      });
    });

    describe('declared as an entry of strictKnownMarketplaces', () => {
      test('an entry that admits the registered source: the name takes effect', () => {
        expect(effective([allowlisted(yours)], { 'your-marketplace': yours })).toEqual([
          'your-marketplace',
        ]);
      });

      test('an owner wildcard entry admits a repository of that owner', () => {
        const entry = { source: 'github', repo: 'your-org/*' };
        expect(effective([allowlisted(entry)], { 'your-marketplace': yours })).toEqual([
          'your-marketplace',
        ]);
      });

      test('a hostPattern entry admits a git marketplace on that host', () => {
        const entry = { source: 'hostPattern', hostPattern: '^git\\.example\\.com$' };
        const registered = git('https://git.example.com/team/m.git');
        expect(effective([allowlisted(entry)], { 'your-marketplace': registered })).toEqual([
          'your-marketplace',
        ]);
      });

      test('an allowlist that does not admit the registered source: ignored', () => {
        expect(
          effective([allowlisted(github('someone/else'))], { 'your-marketplace': yours }),
        ).toEqual([]);
        expect(effective([allowlisted()], { 'your-marketplace': yours })).toEqual([]);
      });
    });

    describe('the official marketplace', () => {
      const nameOnly: Source = [
        'managed',
        { pluginSuggestionMarketplaces: ['claude-plugins-official'] },
      ];

      test('allowlisting its name alone suffices once it is registered', () => {
        expect(effective([nameOnly], { 'claude-plugins-official': official })).toEqual([
          'claude-plugins-official',
        ]);
      });

      test('it still has to be registered on the machine', () => {
        expect(effective([nameOnly], {})).toEqual([]);
      });

      test('any other name still needs its source declared, with the official one listed beside it', () => {
        const both: Source = [
          'managed',
          { pluginSuggestionMarketplaces: ['claude-plugins-official', 'your-marketplace'] },
        ];
        const registered = { 'claude-plugins-official': official, 'your-marketplace': yours };
        expect(effective([both], registered)).toEqual(['claude-plugins-official']);
      });
    });

    describe('managed scope only', () => {
      const registered = { 'your-marketplace': yours };

      test('the list in user, project, local or --settings files is ignored', () => {
        for (const scope of ['user', 'project', 'local', 'flag'] as const) {
          const list: Source = [scope, { pluginSuggestionMarketplaces: ['your-marketplace'] }];
          const declared: Source = [
            'managed',
            { extraKnownMarketplaces: { 'your-marketplace': { source: yours } } },
          ];
          expect(effective([declared, list], registered)).toEqual([]);
        }
      });

      test('a source declared outside the managed settings is not "the same managed settings"', () => {
        const list: Source = ['managed', { pluginSuggestionMarketplaces: ['your-marketplace'] }];
        for (const scope of ['user', 'project', 'local', 'flag'] as const) {
          const declared: Source = [
            scope,
            { extraKnownMarketplaces: { 'your-marketplace': { source: yours } } },
          ];
          expect(effective([list, declared], registered)).toEqual([]);
        }
      });
    });
  },
);

describe('suggestionMarketplaces judgments', () => {
  test('a parent\'s allowlist does not declare the source: it is not "the same managed settings"', () => {
    const list: Source = ['managed', { pluginSuggestionMarketplaces: ['your-marketplace'] }];
    const parentList: Source = ['parent', { strictKnownMarketplaces: [yours] }];
    const registered = { 'your-marketplace': yours };
    expect(effective([list, parentList], registered)).toEqual([]);
    expect(effective([list, allowlisted(yours)], registered)).toEqual(['your-marketplace']);
  });

  test('the names come in the order the list gives them, each once', () => {
    const view: Source = [
      'managed',
      {
        extraKnownMarketplaces: {
          a: { source: github('o/a') },
          b: { source: github('o/b') },
        },
        pluginSuggestionMarketplaces: ['b', 'a', 'b'],
      },
    ];
    const registered = { a: github('o/a'), b: github('o/b') };
    expect(effective([view], registered)).toEqual(['b', 'a']);
  });

  test('an extraKnownMarketplaces entry that cannot register a marketplace declares nothing', () => {
    const view: Source = [
      'managed',
      {
        extraKnownMarketplaces: { x: { source: { source: 'hostPattern', hostPattern: '.*' } } },
        pluginSuggestionMarketplaces: ['x'],
      },
    ];
    expect(effective([view], { x: github('any/where') })).toEqual([]);
  });
});
