/**
 * marketplace-reference.md § Reserved names and § Validation messages; errors.md § Marketplace is
 * registered from an untrusted source, § Marketplace name is another spelling of a reserved name;
 * plugins/troubleshooting.md § Cannot add marketplace. The file reader proves these through
 * `readMarketplace`; this file proves the lists and the rules of `marketplace-names.ts` one by one.
 * What the docs leave open (the impersonation heuristic's edges, the wording of messages they do
 * not quote) is tested at the end, outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  ANY_CASING_NAMES,
  COMMUNITY_NAMES,
  DIRECTORY_NAMES,
  OBJECT_MEMBER_NAMES,
  OFFICIAL_NAMES,
} from '../../../src/format/marketplace/marketplace-name-lists.ts';
import {
  downloadFolderIssues,
  loadNameIssues,
  marketplaceNameIssues,
  spellingOf,
  validationNameIssues,
} from '../../../src/format/marketplace/marketplace-names.ts';
import type { MarketplaceSource } from '../../../src/format/marketplace/types.ts';
import { spec } from '../../support/spec.ts';

const anthropicsGithub: MarketplaceSource = {
  kind: 'github',
  repo: 'anthropics/claude-plugins-official',
  path: '.claude-plugin/marketplace.json',
};
const messages = (issues: readonly { readonly message: string }[]): string[] =>
  issues.map((found) => found.message);

const git = (url: string): MarketplaceSource => ({ kind: 'git', url, path: 'm.json' });

const ALL_RESERVED = [...OFFICIAL_NAMES, ...COMMUNITY_NAMES, ...DIRECTORY_NAMES];

spec('marketplace.field.name', () => {
  test('the official, community and directory lists are the ones the docs print', () => {
    expect([...OFFICIAL_NAMES]).toEqual([
      'claude-code-marketplace',
      'claude-code-plugins',
      'claude-plugins-official',
      'anthropic-marketplace',
      'anthropic-plugins',
      'agent-skills',
      'anthropic-agent-skills',
      'life-sciences',
      'knowledge-work-plugins',
      'claude-for-legal',
      'claude-for-financial-services',
      'financial-services-plugins',
      'first-party-plugins',
      'claude-tag-plugins',
    ]);
    expect([...COMMUNITY_NAMES]).toEqual([
      'claude-community',
      'claude-plugins-community',
      'healthcare',
    ]);
    expect([...DIRECTORY_NAMES]).toEqual(['anthropic-plugin-directory', 'claude-plugin-directory']);
  });

  test('each of them is refused with the documented sentence unless the source is github or git under github.com/anthropics/', () => {
    for (const name of ALL_RESERVED) {
      expect(messages(loadNameIssues(name))).toEqual([
        expect.stringContaining(
          `The name '${name}' is reserved for official Anthropic marketplaces.`,
        ),
      ]);
      expect(loadNameIssues(name, { origin: anthropicsGithub })).toEqual([]);
    }
  });

  test('a git or github source elsewhere gets "Only repositories from \'github.com/anthropics/\' can use this name."', () => {
    const origin: MarketplaceSource = { kind: 'github', repo: 'acme/plugins', path: 'm.json' };
    expect(messages(loadNameIssues('claude-community', { origin }))).toEqual([
      "The name 'claude-community' is reserved for official Anthropic marketplaces. Only repositories from 'github.com/anthropics/' can use this name.",
    ]);
    expect(
      messages(
        loadNameIssues('claude-community', { origin: git('https://gitlab.com/acme/plugins.git') }),
      ),
    ).toEqual([
      "The name 'claude-community' is reserved for official Anthropic marketplaces. Only repositories from 'github.com/anthropics/' can use this name.",
    ]);
  });

  test('any other source says "can only be used with GitHub sources from the \'anthropics\' organization"', () => {
    const origins: (MarketplaceSource | undefined)[] = [
      { kind: 'directory', path: '/tmp/m' },
      { kind: 'url', url: 'https://example.com/marketplace.json' },
      undefined,
    ];
    for (const origin of origins) {
      const where = origin === undefined ? {} : { origin };
      expect(messages(loadNameIssues('claude-community', where)).join()).toContain(
        "can only be used with GitHub sources from the 'anthropics' organization",
      );
    }
  });

  test('a git source under github.com/anthropics/ is exempt in every URL form, and only those', () => {
    for (const url of [
      'https://github.com/anthropics/claude-plugins-official.git',
      'https://github.com/anthropics/claude-plugins-official',
      'git@github.com:anthropics/claude-plugins-official.git',
      'ssh://git@github.com/anthropics/claude-plugins-official.git',
    ]) {
      expect(loadNameIssues('claude-plugins-official', { origin: git(url) })).toEqual([]);
    }
    for (const url of [
      'https://gitlab.com/anthropics/claude-plugins-official.git',
      'https://github.com/anthropics-fork/claude-plugins-official.git',
      'https://github.com.evil.example/anthropics/claude-plugins-official.git',
      'https://github.com:x@evil.example/anthropics/claude-plugins-official.git',
      'https://evil.example/github.com/anthropics/claude-plugins-official.git',
    ]) {
      expect(loadNameIssues('claude-plugins-official', { origin: git(url) })).toHaveLength(1);
    }
  });

  test('the exact official names are not an impersonation: validate leaves them alone', () => {
    for (const name of ALL_RESERVED) expect(validationNameIssues(name)).toEqual([]);
  });

  test('names that impersonate: the documented examples, with the documented message', () => {
    for (const name of ['official-claude-plugins', 'claude-plugins-v2', 'anthropic-plugins-v2']) {
      expect(messages(validationNameIssues(name))).toEqual([
        'Marketplace name impersonates an official Anthropic/Claude marketplace',
      ]);
    }
  });

  test('any non-ASCII character impersonates, wherever it is', () => {
    for (const name of ['é', 'plugins-ß', 'tools x', 'my-tools-\u{1f600}']) {
      expect(messages(validationNameIssues(name))).toContain(
        'Marketplace name impersonates an official Anthropic/Claude marketplace',
      );
    }
  });

  test('inline, builtin, skills-dir, synced and claude-plugin-test are reserved, each by its purpose', () => {
    expect(messages(validationNameIssues('inline'))).toEqual([
      'Marketplace name "inline" is reserved for --plugin-dir session plugins',
    ]);
    const reasons: readonly (readonly [string, string])[] = [
      ['builtin', 'is reserved for built-in plugins'],
      ['skills-dir', 'is reserved for plugins auto-loaded from .claude/skills/'],
      ['synced', 'is reserved for plugins synced from your claude.ai account'],
      ['claude-plugin-test', 'is reserved for plugin tests'],
    ];
    for (const [name, reason] of reasons) {
      expect(validationNameIssues(name)).toEqual([
        { severity: 'error', path: 'name', message: `Marketplace name "${name}" ${reason}` },
      ]);
    }
  });

  test('npm, pip, uv, cargo, github and gh are reserved in any casing', () => {
    expect([...ANY_CASING_NAMES].toSorted()).toEqual(['cargo', 'gh', 'github', 'npm', 'pip', 'uv']);
    for (const name of ANY_CASING_NAMES) {
      for (const spelled of [name, name.toUpperCase(), name[0]?.toUpperCase() + name.slice(1)]) {
        expect(messages(validationNameIssues(spelled))).toEqual([
          `Marketplace name "${spelled}" is reserved`,
        ]);
      }
    }
    expect(validationNameIssues('npm-tools')).toEqual([]);
  });

  test('another spelling: a trailing dot or a symbol other than an underscore in place of a hyphen', () => {
    expect(spellingOf('claude.code.plugins')).toBe('claude-code-plugins');
    expect(spellingOf('claude-code-plugins.')).toBe('claude-code-plugins');
    expect(spellingOf('claude+code+plugins')).toBe('claude-code-plugins');
    expect(spellingOf('claude@code@plugins')).toBe('claude-code-plugins');
    expect(spellingOf('claude_code_plugins')).toBeUndefined();
    expect(spellingOf('claude-code-plugins')).toBeUndefined();
    expect(spellingOf('my.tools')).toBeUndefined();
    expect(messages(loadNameIssues('claude.code.plugins'))).toEqual([
      '"claude.code.plugins" is another spelling of "claude-code-plugins", a reserved marketplace name',
    ]);
  });

  test('the JavaScript member names are refused with "Claude Code reserves this name"', () => {
    expect([...OBJECT_MEMBER_NAMES].toSorted()).toEqual(
      [
        'constructor',
        'hasOwnProperty',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'toLocaleString',
        'toString',
        'valueOf',
      ].toSorted(),
    );
    for (const name of OBJECT_MEMBER_NAMES) {
      expect(messages(loadNameIssues(name))).toEqual([
        `Cannot add marketplace "${name}": Claude Code reserves this name and cannot register a marketplace under it. The name is set by "name" in the marketplace's marketplace.json; ask its maintainer to change it.`,
      ]);
    }
    expect(loadNameIssues('tostring')).toEqual([]);
  });

  test('a name starting with "claudeai-" is refused unless the marketplace is hosted on claude.ai', () => {
    expect(messages(loadNameIssues('claudeai-team'))).toEqual([
      'Cannot add marketplace "claudeai-team": names starting with "claudeai-" are reserved for marketplaces hosted on claude.ai',
    ]);
    expect(loadNameIssues('claudeai-team', { hostedOnClaudeAi: true })).toEqual([]);
    expect(loadNameIssues('claudeai')).toEqual([]);
    expect(loadNameIssues('my-claudeai-team')).toEqual([]);
  });

  test('a registered GitHub marketplace reserves its <owner>-<repo> download folder against another one', () => {
    const registered = [
      {
        name: 'x-tools',
        source: { kind: 'github', repo: 'acme/x-tools', path: 'm.json' },
      },
    ] as const;
    expect(messages(downloadFolderIssues('acme-x-tools', registered))).toEqual([
      expect.stringContaining(`Can't use the marketplace name "acme-x-tools"`),
    ]);
  });

  test('the folder is free for the marketplace registered under that very name, and for other names', () => {
    const named = [
      { name: 'acme-x-tools', source: { kind: 'github', repo: 'acme/x-tools', path: 'm.json' } },
    ] as const;
    expect(downloadFolderIssues('acme-x-tools', named)).toEqual([]);
    expect(downloadFolderIssues('other-name', named)).toEqual([]);
  });

  test('only a github source downloads through such a folder', () => {
    const registered = [
      {
        name: 'x-tools',
        source: { kind: 'git', url: 'https://example.com/acme/x-tools.git', path: 'm.json' },
      },
      { name: 'local', source: { kind: 'directory', path: '/acme-x-tools' } },
    ] as const;
    expect(downloadFolderIssues('acme-x-tools', registered)).toEqual([]);
  });
});

describe('how the two entry points split the rules', () => {
  test('marketplaceNameIssues is what validate prints plus what adding or loading refuses', () => {
    const name = 'claude.code.plugins';
    expect(marketplaceNameIssues(name)).toEqual([
      ...validationNameIssues(name),
      ...loadNameIssues(name),
    ]);
    expect(marketplaceNameIssues('claude-community', { origin: anthropicsGithub })).toEqual([]);
  });

  test('an ordinary name draws nothing', () => {
    for (const name of [
      'my-marketplace',
      'acme-tools',
      'tools_2',
      'official',
      'claude',
      'claude-tools',
      'my-agent-skills',
    ]) {
      expect(marketplaceNameIssues(name)).toEqual([]);
    }
  });
});
