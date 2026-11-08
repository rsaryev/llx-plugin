/** The settings, policy, permission and environment pages of the audit (scripts/spec/scope.ts). */
import type { Heading } from './markdown.ts';
import { NAVIGATION, under, type PageScope, type Skip } from './scope.ts';

const KEYS_KEPT = /^(env|theme|outputStyle|statusLine)$/;
const GROUPS_KEPT =
  /^(Permission settings|MCP|Enterprise and managed settings|Updates and versioning|Agents, sessions, and worktrees|Plugins and skills|Hooks and automation)$/;
const GROUPS_DROPPED =
  /^(Model and responses|Sandbox settings|Memory and context|Interface and terminal|Git and attribution|Remote, desktop, and notifications|Authentication and providers|Tools|Privacy and telemetry|Global config settings)$/;

const inKeptKey = (heading: Heading): boolean =>
  KEYS_KEPT.test(heading.text) || heading.parents.some((parent) => KEYS_KEPT.test(parent));

const settingsReferenceSkips: readonly Skip[] = [
  [
    (h) => h.level === 3 && (KEYS_KEPT.test(h.text) || h.parents.some((p) => GROUPS_KEPT.test(p))),
    'duplicate',
  ],
  [(h) => h.level >= 3 && under(GROUPS_DROPPED)(h) && !inKeptKey(h), 'runtime'],
  NAVIGATION,
];

export const SETTINGS_SCOPES: readonly PageScope[] = [
  {
    page: 'settings.md',
    category: 'settings-merge',
    slug: 'settings',
    skip: [
      ['Share settings with your team', 'advice'],
      ['Check what your organization enforces', 'ui'],
      ['Use the /config menu', 'ui'],
      ['Confirm what loaded', 'ui'],
      [
        /^(Team settings override personal settings|Organization settings override everything|The command line overrides your files for one session|A flag or environment variable sets the same thing)$/,
        'tutorial',
      ],
      ['A change you made in Claude Code is lost in new sessions', 'ui'],
      ['Settings in cloud sessions', 'service'],
      NAVIGATION,
    ],
  },
  {
    page: 'settings-reference.md',
    category: 'settings',
    slug: 'reference',
    routes: [
      { category: 'permissions', parent: /^Permission settings$/ },
      { category: 'mcp-settings', parent: /^MCP$/ },
      { category: 'policy', parent: /^(Enterprise and managed settings|Plugins and skills)$/ },
      { category: 'updates', parent: /^Updates and versioning$/ },
    ],
    skip: settingsReferenceSkips,
  },
  {
    page: 'managed-settings.md',
    category: 'policy',
    slug: 'managed',
    routes: [
      {
        category: 'settings-merge',
        heading:
          /^(How Claude Code combines managed sources|When an admin document counts as present|Keys read from every admin source|Which managed source supplies login keys|Compose every managed source|Split a file-based policy across teams)$/,
      },
    ],
    skip: [
      ['Read the source in /status', 'ui'],
      ['Turn telemetry off for your organization', 'telemetry'],
      NAVIGATION,
    ],
  },
  {
    page: 'permissions.md',
    category: 'permissions',
    slug: 'behavior',
    routes: [
      {
        category: 'trust',
        heading:
          /^(Project allow rules and workspace trust|When your local settings file needs trust|What runs before you trust a folder)$/,
      },
      { category: 'settings-merge', heading: /^Settings precedence$/ },
    ],
    skip: [
      ['Add a comment when you answer a permission prompt', 'ui'],
      ['Manage permissions', 'ui'],
      ['How permissions interact with sandboxing', 'runtime'],
      ['Managed settings', 'duplicate'],
      ['Example configurations', 'tutorial'],
      NAVIGATION,
    ],
  },
  {
    page: 'permission-modes.md',
    category: 'permissions',
    slug: 'modes',
    skip: [
      ['Common setups', 'advice'],
      ['Permission modes with the HIPAA configuration', 'service'],
      ['Switch permission modes', 'ui'],
      ['Review and approve a plan', 'ui'],
      [
        /^(Eliminate permission prompts with auto mode|Auto mode on Bedrock, Agent Platform, or Foundry|Server-side classifier review|Default classifier model|Choose the classifier model|When your model doesn't review|Check which model the classifier used|What the classifier blocks by default|The first read outside the working directories|Boundaries you state in conversation|Approvals you state in conversation|When auto mode falls back|Repeated-block thresholds|How auto mode evaluates actions)$/,
        'model',
      ],
      ['claude agents shows the bypass permissions warning that interactive sessions skip', 'ui'],
      [
        /^(Critical paths|Which paths are critical|Other targets that count as critical paths|Removals inside nested commands and inline scripts|Rewrite a flagged command|The Dangerous rm operation not ruled out prompt|The mounted drive prompt|Paths that get the mounted drive prompt|Turn off the mounted drive prompt|Removals that still prompt with the mounted drive prompt off|Critical-path removals in each permission mode|Time limits and denials in auto and bypassPermissions modes|Turn off the critical-path removal prompt in bypassPermissions mode|Startup notices about the critical-path removal prompt|Why the critical-path removal prompt stays on|Remove-Item in PowerShell)$/,
        'runtime',
      ],
      NAVIGATION,
    ],
  },
  {
    page: 'env-vars.md',
    category: 'environment',
    slug: 'host',
    skip: [
      ['Set variables in your shell', 'machine'],
      [
        /^(Features that need feature-flag fetching|First session after an install or upgrade)$/,
        'runtime',
      ],
      NAVIGATION,
    ],
  },
  {
    page: 'cli-reference.md',
    category: 'cli',
    slug: 'claude',
    skip: [
      [/^(System prompt flags|System prompt flags in resumed conversations)$/, 'model'],
      NAVIGATION,
    ],
  },
];
