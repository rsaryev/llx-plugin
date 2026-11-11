/** The plugin pages of the audit (scripts/spec/scope.ts): loading, installing, marketplaces. */
import { NAVIGATION, type PageScope } from './scope.ts';

export const PLUGIN_SCOPES: readonly PageScope[] = [
  {
    page: 'plugins/loading.md',
    category: 'install',
    routes: [
      {
        category: 'updates',
        heading:
          /^(Versions and updates|How Claude Code computes the version|When Claude Code refreshes a marketplace before an install|When auto-update runs|Which marketplaces and plugins auto-update|When a command source re-runs)$/,
      },
      {
        category: 'trust',
        heading:
          /^(Plugins shared through a repository|Trust check and component limits for repository plugins|Check why a repository plugin didn't load)$/,
      },
      { category: 'policy', heading: /^Skills-directory plugins blocked by managed settings$/ },
    ],
    skip: [
      [
        /^(Plugins synced from claude\.ai|Sync timing in cloud Cowork sessions|Sync timing in terminal sessions|Sign-in requirements for terminal sync|Control which synced plugins load)$/,
        'service',
      ],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/dependencies.md',
    category: 'dependencies',
    slug: 'guide',
    skip: [['Dependencies when your plugin loads from claude.ai', 'service'], NAVIGATION],
  },
  {
    page: 'plugins/host-marketplace.md',
    category: 'marketplace',
    slug: 'hosting',
    routes: [
      {
        category: 'updates',
        heading:
          /^(Keep users up to date|Turn on auto-update|Release a new version|Hold users on one version|Change the command of a command source|Run release channels|Rename or remove a plugin|Migrate users with a renames map|Uninstall removed plugins from users' machines)$/,
      },
      {
        category: 'policy',
        heading: /^(Distribute through organization settings|Roll out to a whole company)$/,
      },
    ],
    skip: [
      ['Distribute through organization settings', 'service'],
      ['Roll out to a whole company', 'advice'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/manifest-reference.md',
    category: 'manifest',
    slug: 'rule',
    routes: [
      {
        category: 'user-config',
        heading:
          /^(Limit a field to fixed options|Where values are stored|Reference a saved value)$/,
      },
      { category: 'environment', heading: /^Quoting and path separators$/ },
      {
        category: 'marketplace',
        heading:
          /^(Marketplace entries and the manifest|How entry fields combine with plugin\.json|Metadata precedence)$/,
      },
      { category: 'cli', heading: /^Validate the manifest$/ },
    ],
    skip: [NAVIGATION],
  },
  {
    page: 'plugins/marketplace-reference.md',
    category: 'marketplace',
    slug: 'rule',
    routes: [
      {
        category: 'policy',
        heading: /^(Source values valid only in policy lists|Source objects in settings)$/,
      },
    ],
    skip: [NAVIGATION],
  },
  {
    page: 'plugins/cli-reference.md',
    category: 'cli',
    slug: 'plugin',
    routes: [
      {
        category: 'install',
        heading:
          /^(\/reload-plugins|Reload summary|Reloads that change MCP tools|Sessions without an interactive terminal|Flags that load a plugin for one session)$/,
      },
    ],
    skip: [
      ['/plugin in a session', 'ui'],
      [/^plugin (?:eval(?: init)?|init|test)$/, 'tooling'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/install.md',
    category: 'install',
    slug: 'guide',
    routes: [
      {
        category: 'updates',
        heading:
          /^(Keep plugins updated|Turn auto-update on or off for a marketplace|Update plugins now|Auto-update from a private marketplace)$/,
      },
    ],
    skip: [
      [
        /^(Plugins from your claude\.ai account|Add a marketplace from claude\.ai|Manage plugins synced from claude\.ai)$/,
        'service',
      ],
      ['Find plugins you no longer use', 'ui'],
      ['See what an installed plugin adds to your sessions', 'ui'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/create.md',
    category: 'install',
    slug: 'develop',
    skip: [
      ['Decide when to use a plugin', 'advice'],
      ['Create your first plugin', 'tutorial'],
      ['Share your plugin', 'tutorial'],
      ['Convert an existing .claude/ setup', 'tutorial'],
      [
        /^(A component path isn't found|--plugin-dir at a marketplace root doesn't load the plugins under plugins\/|The plugin loads but its skills are missing|The userConfig dialog never appears|Check that the plugin changes Claude's behavior)$/,
        'duplicate',
      ],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/create-marketplace.md',
    category: 'marketplace',
    slug: 'create',
    skip: [
      ['Create a marketplace', 'tutorial'],
      ['Add plugin entries', 'tutorial'],
      ['Host your marketplace', 'duplicate'],
      NAVIGATION,
    ],
  },
];
