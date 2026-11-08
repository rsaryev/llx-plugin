/** The mods pages of the audit (scripts/spec/scope.ts). */
import { NAVIGATION, type PageScope } from './scope.ts';

export const MOD_SCOPES: readonly PageScope[] = [
  {
    page: 'plugins/mods/overview.md',
    category: 'mods',
    slug: 'overview',
    routes: [{ category: 'policy', heading: /^Control mods for your organization$/ }],
    skip: [
      ['What a mod can do', 'advice'],
      ['Get a mod', 'tutorial'],
      ['Install or update a mod', 'tutorial'],
      ['Try a sample mod', 'tutorial'],
      ['See which mods a session loaded', 'ui'],
      ['List what a mod does before you install one', 'ui'],
      ['Compare mods, settings hooks, skills, and MCP servers', 'advice'],
      ['Read the source of built-in mods', 'builtin'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/mods/admin.md',
    category: 'policy',
    slug: 'mods',
    skip: [
      ['Decide whether to leave mods on', 'advice'],
      ['Review what a mod can do', 'advice'],
      ['Refuse mods when your check fails', 'tutorial'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/mods/api.md',
    category: 'mods',
    slug: 'apiGuide',
    skip: [['Check for cache hits', 'model'], NAVIGATION],
  },
  {
    page: 'plugins/mods/create.md',
    category: 'mods',
    slug: 'create',
    skip: [
      ['Ask Claude for a mod', 'tutorial'],
      ['Use the mod in other sessions', 'tutorial'],
      ['Write a mod yourself', 'tutorial'],
      ['How the example mod works', 'tutorial'],
      ['Change a mod with Claude', 'tutorial'],
      ['Get type definitions for your version', 'tooling'],
      ['Test the mod', 'tooling'],
      ['Share your mod', 'tutorial'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/mods/events.md',
    category: 'mods',
    slug: 'events',
    skip: [NAVIGATION],
  },
  {
    page: 'plugins/mods/gallery.md',
    category: 'mods',
    slug: 'gallery',
    skip: [
      ['Try a sample', 'tutorial'],
      ['Pick an element', 'advice'],
      [
        /^(Text|Markdown|Link|Code|Code as a diff|Box|Button|Input|Select|Raster|Svg|Image and Client|Draw an Image inside tmux)$/,
        'duplicate',
      ],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/mods/interface.md',
    category: 'mods',
    slug: 'interface',
    skip: [
      ['Build a pane with tabs', 'tutorial'],
      ['Take typed input and draw a row for each item', 'tutorial'],
      ['Change hello-tabs to use $.state', 'tutorial'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/mods/test.md',
    category: 'mods',
    slug: 'test',
    skip: [
      [
        /^(Write a test|Stub what Claude Code would answer|Follow the test kit's rules|Look up what a stub returns|Test a timer|Test a drawing|Test a drawing after \/clear|Test a policy mod)$/,
        'tooling',
      ],
      NAVIGATION,
    ],
  },
  {
    page: 'plugins/mods/troubleshoot.md',
    category: 'mods',
    slug: 'troubleshoot',
    skip: [['Find out why a mod does nothing', 'ui'], ['Read the debug log', 'ui'], NAVIGATION],
  },
  {
    page: 'plugins/mods/reference.md',
    category: 'mods',
    slug: 'reference',
    skip: [],
  },
];
