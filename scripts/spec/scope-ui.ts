/** The workflows, themes, output styles and channels pages of the audit (scripts/spec/scope.ts). */
import { NAVIGATION, type PageScope } from './scope.ts';

export const UI_SCOPES: readonly PageScope[] = [
  {
    page: 'workflows.md',
    category: 'workflows',
    slug: 'behavior',
    skip: [
      ['When to use a workflow', 'advice'],
      [
        /^(Run a bundled workflow|Watch the run|Ask for a workflow in your prompt|Dismiss or turn off the keyword|Where the keyword works|Approve the plan before it runs)$/,
        'ui',
      ],
      ['Bundled workflows', 'builtin'],
      ['Let Claude decide with ultracode', 'model'],
      [
        /^(Example workflow prompts|Audit many files for the same issue|Keep fixing until a check passes|Migrate many files in parallel|Review every changed file and write one summary|Research a topic across many sources|Find issues until the list stops growing)$/,
        'tutorial',
      ],
      ['Prompt caching in a fan-out', 'model'],
      ['Cost', 'advice'],
      NAVIGATION,
    ],
  },
  {
    page: 'terminal-config.md',
    category: 'themes',
    slug: 'config',
    skip: [
      [
        /^(Enter multiline prompts|Enable Option key shortcuts on macOS|Fix Backspace deleting a whole word on Windows|Configure tmux)$/,
        'machine',
      ],
      [
        /^(Get a terminal bell or notification|See session status in your terminal|Switch to fullscreen rendering|Cap response width in wide terminals|Edit prompts with Vim keybindings)$/,
        'ui',
      ],
      [
        /^(Paste large content|How Claude treats pasted text|Delete and restore a collapsed paste|Recall a prompt that had pasted text)$/,
        'ui',
      ],
      ['Play a sound with a Notification hook', 'tutorial'],
      NAVIGATION,
    ],
  },
  {
    page: 'output-styles.md',
    category: 'output-styles',
    slug: 'behavior',
    skip: [
      [/^(Built-in output styles|Default|Proactive|Concise|Explanatory|Learning)$/, 'builtin'],
      ['Choose between an output style and other features', 'advice'],
      NAVIGATION,
    ],
  },
  {
    page: 'channels.md',
    category: 'channels',
    slug: 'overview',
    routes: [
      { category: 'policy', parent: /^Enterprise controls$/ },
      { category: 'policy', heading: /^Enterprise controls$/ },
    ],
    skip: [
      ['Supported channels', 'builtin'],
      ['Quickstart', 'tutorial'],
      ['Research preview', 'advice'],
      ['How channels compare', 'advice'],
      NAVIGATION,
    ],
  },
  {
    page: 'channels-reference.md',
    category: 'channels',
    slug: 'reference',
    skip: [
      ['Overview', 'advice'],
      ['Example: build a webhook receiver', 'tutorial'],
      ['Test during the research preview', 'tooling'],
      [/^(Add relay to a chat bridge|Full example)$/, 'tutorial'],
      NAVIGATION,
    ],
  },
];
