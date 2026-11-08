/** Hook integration, policy delivery and tool-permission contracts, not Claude's session engine. */
import { NAVIGATION, under, type PageScope } from './scope.ts';

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
    page: 'server-managed-settings.md',
    category: 'policy',
    slug: 'server',
    skip: [
      ['Fetch and caching behavior', 'service'],
      ["When a machine's apiKeyHelper isn't in effect", 'runtime'],
      ['Approval memory', 'service'],
      ['Environment variables and the approval dialog', 'runtime'],
      ['Security considerations', 'advice'],
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
    page: 'tools-reference.md',
    category: 'tools',
    slug: 'behavior',
    skip: [
      [
        /^(AskUserQuestion tool behavior|Bash tool behavior|Edit tool behavior|EndConversation tool behavior|EnterWorktree tool behavior|Glob tool behavior|Grep tool behavior|LSP tool behavior|Monitor tool|NotebookEdit tool behavior|Read tool behavior|Task tool availability|WebFetch tool behavior|WebSearch tool behavior|Write tool behavior)$/,
        'runtime',
      ],
      [
        under(
          /^(AskUserQuestion tool behavior|Bash tool behavior|Edit tool behavior|EndConversation tool behavior|EnterWorktree tool behavior|Glob tool behavior|Grep tool behavior|LSP tool behavior|Monitor tool|NotebookEdit tool behavior|Read tool behavior|Task tool availability|WebFetch tool behavior|WebSearch tool behavior|Write tool behavior)$/,
        ),
        'runtime',
      ],
      ['PowerShell tool', 'runtime'],
      [
        under(
          /^PowerShell tool$/,
          /^(Bash deny rules also turn off the PowerShell tool|Shell selection in settings, hooks, and skills)$/,
        ),
        'runtime',
      ],
      [/^SendFeedback tool behavior$/, 'service'],
      [under(/^SendFeedback tool behavior$/), 'service'],
      ['Check which tools are available', 'ui'],
      NAVIGATION,
    ],
  },
];
