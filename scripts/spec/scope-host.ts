/** The pages that describe how a host runs a session, loads memory, worktrees and settings. */
import { NAVIGATION, under, type PageScope, type Skip } from './scope.ts';

/** A troubleshooting section and every symptom under it: guidance, no rule. */
export const TROUBLESHOOTING: readonly Skip[] = [
  ['Troubleshooting', 'advice'],
  [under(/^Troubleshooting$/), 'advice'],
];

/** A page that restates tables other pages own: each section stays one requirement. */
const EVERY_SECTION = (): boolean => true;

export const HOST_SCOPES: readonly PageScope[] = [
  {
    page: 'hooks-guide.md',
    category: 'hooks',
    slug: 'guide',
    whole: [EVERY_SECTION],
    skip: [
      ['Set up your first hook', 'tutorial'],
      [under(/^What you can automate$/), 'tutorial'],
      [
        /^(Hook not firing|Hook error in output|\/hooks shows no hooks configured|Fields at the wrong level|Check what a hook did)$/,
        'advice',
      ],
      ['Learn more', 'navigation'],
    ],
  },
  {
    page: 'claude-directory.md',
    category: 'layout',
    slug: 'directory',
    skip: [
      ['Explore the directory', 'ui'],
      ['Choose the right file', 'advice'],
      ['Troubleshoot configuration', 'advice'],
      ['Clear local data', 'advice'],
      ['Related resources', 'navigation'],
    ],
  },
  {
    page: 'memory.md',
    category: 'layout',
    slug: 'memory',
    skip: [
      ['CLAUDE.md vs auto memory', 'advice'],
      [
        /^(When to add to CLAUDE\.md|Write effective instructions|Audit your instruction files)$/,
        'advice',
      ],
      [/^(Set up a project CLAUDE\.md|Migrate instructions from other tools)$/, 'tutorial'],
      [
        /^(Share one file with other coding tools|Remove an earlier AGENTS\.md workaround)$/,
        'advice',
      ],
      [/^View and edit with/, 'ui'],
      ['Audit and edit your memory', 'ui'],
      ['Troubleshoot memory issues', 'advice'],
      [under(/^Troubleshoot memory issues$/), 'advice'],
      ['Related resources', 'navigation'],
    ],
  },
  {
    page: 'statusline.md',
    category: 'settings',
    slug: 'statusline',
    skip: [
      [/^Use the \/statusline command$/, 'ui'],
      ['Build a status line step by step', 'tutorial'],
      [under(/^Examples$/), 'tutorial'],
      ['Tips', 'advice'],
      [
        /^(Status line not appearing|Status line shows -- or empty values|Context percentage shows unexpected values|OSC 8 links not clickable|Display glitches with escape sequences|Script errors or hangs|Notifications share the status line row)$/,
        'advice',
      ],
    ],
  },
  {
    page: 'worktrees.md',
    category: 'environment',
    slug: 'worktrees',
    skip: [
      [/^Claude has no EnterWorktree tool$/, 'advice'],
      ['Manage worktrees manually', 'machine'],
      ...TROUBLESHOOTING,
      ['See also', 'navigation'],
    ],
  },
  {
    page: 'headless.md',
    category: 'cli',
    slug: 'headless',
    skip: [
      [/^(Pipe data through Claude|Add Claude to a build script|Create a commit)$/, 'tutorial'],
      NAVIGATION,
    ],
  },
  {
    page: 'plugin-evals.md',
    category: 'cli',
    slug: 'evals',
    skip: [
      ['Create your first eval suite', 'tutorial'],
      ['Write a case manually', 'tutorial'],
      ['Choose graders that give a stable signal', 'advice'],
      ['HTML report', 'ui'],
      ...TROUBLESHOOTING,
      NAVIGATION,
    ],
  },
  {
    page: 'server-managed-settings.md',
    category: 'policy',
    slug: 'server',
    skip: [
      ['Requirements', 'service'],
      ['Choose between server-managed and endpoint-managed settings', 'advice'],
      ['Configure server-managed settings', 'service'],
      ['Verify settings delivery', 'ui'],
      ['Access control', 'service'],
      ['Platform availability', 'service'],
      ['Audit logging', 'service'],
      NAVIGATION,
    ],
  },
  {
    page: 'model-config.md',
    category: 'settings',
    slug: 'models',
    whole: [EVERY_SECTION],
    skip: [
      ['Work with Fable', 'builtin'],
      ['Fable and usage credits', 'service'],
      ['A new session starts on a different model than you picked', 'advice'],
      ['Mantle model IDs', 'runtime'],
      ['Security research and biology workloads', 'model'],
      ['Choose an effort level', 'advice'],
      ['Adaptive reasoning and fixed thinking budgets', 'model'],
      [/^Haiku 5\.5 context window and pricing$/, 'model'],
      ['Checking your current model', 'ui'],
      ['Prompt caching configuration', 'model'],
      ['Version history', 'navigation'],
    ],
  },
  {
    page: 'debug-your-config.md',
    category: 'cli',
    slug: 'debug',
    skip: [
      ['See what loaded into context', 'ui'],
      ['Check MCP servers', 'advice'],
      ['Check common causes', 'advice'],
      NAVIGATION,
    ],
  },
  {
    page: 'commands.md',
    category: 'commands',
    slug: 'builtin',
    whole: [/^All commands$/],
    skip: [['Commands across a typical workflow', 'tutorial'], NAVIGATION],
  },
  {
    page: 'agent-teams.md',
    category: 'agents',
    slug: 'teams',
    skip: [
      ['When to use agent teams', 'advice'],
      ['Compare with subagents', 'advice'],
      ['Start your first agent team', 'tutorial'],
      ['Choose a display mode', 'ui'],
      ['Talk to teammates directly', 'ui'],
      ['Token usage', 'advice'],
      ['Use case examples', 'tutorial'],
      [under(/^Use case examples$/), 'tutorial'],
      ['Best practices', 'advice'],
      [under(/^Best practices$/), 'advice'],
      ...TROUBLESHOOTING,
      NAVIGATION,
    ],
  },
  {
    page: 'goal.md',
    category: 'hooks',
    slug: 'goal',
    skip: [
      ['Compare ways to keep a session running', 'advice'],
      ['Write an effective condition', 'advice'],
      ['Check status', 'ui'],
      ['Evaluation model and cost', 'model'],
      NAVIGATION,
    ],
  },
  {
    page: 'scheduled-tasks.md',
    category: 'skills',
    slug: 'scheduling',
    skip: [
      ['Compare scheduling options', 'advice'],
      ['Run the built-in maintenance prompt', 'builtin'],
      ['Detach without stopping a loop', 'ui'],
      ['Manage session-scoped scheduled tasks', 'ui'],
    ],
  },
  {
    page: 'auto-mode-config.md',
    category: 'permissions',
    slug: 'autoMode',
    skip: [
      ['Common boundaries', 'advice'],
      ['Add a human checkpoint', 'tutorial'],
      [/^What \/auto-mode-setup reads$/, 'model'],
      [/^Review and save the draft$/, 'ui'],
      [/^\/auto-mode-setup returns "Unknown command"$/, 'advice'],
      ['Review denials', 'ui'],
      ['Fix a denial with an allow rule, an environment entry, or a retry', 'advice'],
      ['Fix repeated denials', 'advice'],
      NAVIGATION,
    ],
  },
  {
    page: 'tools-reference.md',
    category: 'tools',
    slug: 'behavior',
    skip: [
      [/^SendFeedback tool behavior$/, 'service'],
      [under(/^SendFeedback tool behavior$/), 'service'],
      ['Check which tools are available', 'ui'],
      NAVIGATION,
    ],
  },
];
