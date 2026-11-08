/**
 * Marketplace fixtures: the `marketplace.json` shapes the docs print, as raw JSON values the
 * readers take and as the parsed contract values they must produce. Every example is copied from
 * the page named beside it; where a page only describes a field, the value is built from the
 * field's own table row and says so. Built with builders, never heredocs, so a test changes one
 * field and keeps the rest.
 */
import type {
  Marketplace,
  MarketplaceEntry,
  MarketplaceSourceKind,
  MarketplaceSourceOf,
  PluginSourceKind,
  PluginSourceOf,
} from '../../src/format/marketplace/types.ts';

type PluginSourceExample = {
  readonly [Kind in PluginSourceKind]: {
    readonly raw: unknown;
    readonly parsed: PluginSourceOf<Kind>;
  };
};

/** marketplace-reference.md § Plugin sources: one example per kind, from each kind's own section. */
export const PLUGIN_SOURCES: PluginSourceExample = {
  relative: {
    raw: './plugins/my-first-plugin',
    parsed: { kind: 'relative', path: 'plugins/my-first-plugin', bare: false },
  },
  github: {
    raw: {
      source: 'github',
      repo: 'your-org/formatter',
      ref: 'v2.0.0',
      sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
    },
    parsed: {
      kind: 'github',
      repo: 'your-org/formatter',
      ref: 'v2.0.0',
      sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
    },
  },
  url: {
    raw: { source: 'url', url: 'https://gitlab.example.com/your-group/formatter.git', ref: 'main' },
    parsed: {
      kind: 'url',
      url: 'https://gitlab.example.com/your-group/formatter.git',
      ref: 'main',
    },
  },
  'git-subdir': {
    raw: {
      source: 'git-subdir',
      url: 'https://github.com/your-org/monorepo.git',
      path: 'tools/formatter',
    },
    parsed: {
      kind: 'git-subdir',
      url: 'https://github.com/your-org/monorepo.git',
      path: 'tools/formatter',
    },
  },
  npm: {
    raw: {
      source: 'npm',
      package: '@your-org/formatter',
      version: '^2.0.0',
      registry: 'https://npm.example.com',
    },
    parsed: {
      kind: 'npm',
      package: '@your-org/formatter',
      version: '^2.0.0',
      registry: 'https://npm.example.com',
    },
  },
  archive: {
    raw: {
      source: 'archive',
      url: 'https://artifacts.example.com/formatter-2.0.0.zip',
      sha256: '6bfa50e3d2e00c052b46abe51fff89346ac803e45771f76dcf6df1ab74cca5e1',
    },
    parsed: {
      kind: 'archive',
      url: 'https://artifacts.example.com/formatter-2.0.0.zip',
      sha256: '6bfa50e3d2e00c052b46abe51fff89346ac803e45771f76dcf6df1ab74cca5e1',
    },
  },
  // The docs' example sets `timeout` only: `mode` defaults to copy; the parsed value has both.
  command: {
    raw: { source: 'command', command: 'my-tool claude-plugin-path', timeout: 120 },
    parsed: {
      kind: 'command',
      command: 'my-tool claude-plugin-path',
      timeoutSeconds: 120,
      mode: 'copy',
    },
  },
};

type MarketplaceSourceExample = {
  readonly [Kind in MarketplaceSourceKind]: {
    readonly raw: unknown;
    readonly parsed: MarketplaceSourceOf<Kind>;
  };
};

/**
 * marketplace-reference.md § Marketplace sources. `git` (§ Source objects in settings), `github`
 * with `owner/*` and `hostPattern` (§ the policy-list example) are the page's own examples; the
 * others are built from the "Fields by type" table, with the defaults it states.
 */
export const MARKETPLACE_SOURCES: MarketplaceSourceExample = {
  url: {
    raw: { source: 'url', url: 'https://example.com/marketplace.json' },
    parsed: { kind: 'url', url: 'https://example.com/marketplace.json' },
  },
  github: {
    raw: { source: 'github', repo: 'your-org/*' },
    parsed: { kind: 'github', repo: 'your-org/*', path: '.claude-plugin/marketplace.json' },
  },
  git: {
    raw: {
      source: 'git',
      url: 'https://git.example.com/your-org/your-marketplace.git',
      ref: 'main',
    },
    parsed: {
      kind: 'git',
      url: 'https://git.example.com/your-org/your-marketplace.git',
      ref: 'main',
      path: '.claude-plugin/marketplace.json',
    },
  },
  npm: {
    raw: { source: 'npm', package: '@your-org/marketplace' },
    parsed: { kind: 'npm', package: '@your-org/marketplace' },
  },
  file: {
    raw: { source: 'file', path: '/srv/market/.claude-plugin/marketplace.json' },
    parsed: { kind: 'file', path: '/srv/market/.claude-plugin/marketplace.json' },
  },
  directory: {
    raw: { source: 'directory', path: '/srv/market' },
    parsed: { kind: 'directory', path: '/srv/market' },
  },
  settings: {
    raw: {
      source: 'settings',
      name: 'your-marketplace',
      plugins: [
        {
          name: 'formatter',
          source: { source: 'github', repo: 'your-org/formatter' },
        },
      ],
    },
    parsed: {
      kind: 'settings',
      name: 'your-marketplace',
      plugins: [
        {
          name: 'formatter',
          source: { kind: 'github', repo: 'your-org/formatter' },
          strict: true,
          components: {},
          display: {},
        },
      ],
    },
  },
  'skills-dir': { raw: { source: 'skills-dir' }, parsed: { kind: 'skills-dir' } },
  hostPattern: {
    raw: { source: 'hostPattern', hostPattern: '^git\\.example\\.com$' },
    parsed: { kind: 'hostPattern', hostPattern: '^git\\.example\\.com$' },
  },
  pathPattern: {
    raw: { source: 'pathPattern', pathPattern: '^/srv/' },
    parsed: { kind: 'pathPattern', pathPattern: '^/srv/' },
  },
};

type Raw = Record<string, unknown>;

/** create-marketplace.md step 2: the smallest marketplace the docs print, with `overrides` laid over it. */
export function rawMarketplace(overrides: Raw = {}): Raw {
  return {
    name: 'my-marketplace',
    description: 'Plugins for my team',
    owner: { name: 'Your Name' },
    plugins: [
      {
        name: 'my-first-plugin',
        source: './plugins/my-first-plugin',
        description: 'A greeting plugin to learn the basics',
      },
    ],
    ...overrides,
  };
}

/** The parsed value of `rawMarketplace()`. */
export function parsedMarketplace(overrides: Partial<Marketplace> = {}): Marketplace {
  const entry: MarketplaceEntry = {
    name: 'my-first-plugin',
    source: PLUGIN_SOURCES.relative.parsed,
    description: 'A greeting plugin to learn the basics',
    strict: true,
    components: {},
    display: {},
  };
  return {
    name: 'my-marketplace',
    description: 'Plugins for my team',
    owner: { name: 'Your Name' },
    plugins: [entry],
    forceRemoveDeletedPlugins: false,
    allowCrossMarketplaceDependenciesOn: [],
    renames: {},
    ...overrides,
  };
}

/** host-marketplace.md § Migrate users with a renames map: `formatter` renamed, `legacy-linter` removed. */
export const RENAMES_MARKETPLACE: Raw = {
  name: 'your-marketplace',
  owner: { name: 'Your Org' },
  plugins: [{ name: 'code-formatter', source: './plugins/code-formatter' }],
  renames: { formatter: 'code-formatter', 'legacy-linter': null },
};

/** relevance.md § Add relevance to a plugin entry. */
export const RELEVANCE_MARKETPLACE: Raw = {
  name: 'your-marketplace',
  owner: { name: 'Your Org' },
  plugins: [
    {
      name: 'terraform-helpers',
      source: './plugins/terraform-helpers',
      description: "Your organization's Terraform conventions and helpers",
      relevance: { topic: 'Terraform', signals: { cli: ['terraform'], filesRead: ['**/*.tf'] } },
    },
  ],
};
