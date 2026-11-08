/** The skills, subagents and hooks pages of the audit (scripts/spec/scope.ts). */
import { NAVIGATION, type PageScope } from './scope.ts';

export const CORE_SCOPES: readonly PageScope[] = [
  {
    page: 'skills.md',
    category: 'skills',
    slug: 'behavior',
    phrases: ['Resolve skills that share a name'],
    skip: [
      [
        /^(Bundled skills|Check your setup with \/doctor|Run and verify your app|Run your checks before each commit|Work on Claude API projects)$/,
        'builtin',
      ],
      [/^(Getting started|Create your first skill)$/, 'tutorial'],
      [
        /^(Use skills in Cowork and cloud sessions|Skills synced from claude\.ai|Where synced skills load|When a synced skill name matches another command|Names reserved for synced skills|How Claude Code handles the frontmatter of a synced skill|How Claude Code handles the body of a synced skill)$/,
        'service',
      ],
      ['Types of skill content', 'advice'],
      ['Find unused skills', 'ui'],
      [/^(Evaluate and iterate on a skill|Run evals with skill-creator)$/, 'tooling'],
      ['Share skills', 'advice'],
      ['Generate visual output', 'tutorial'],
      [
        /^(Skill not triggering|Skill triggers too often|Claude stops following a skill)$/,
        'advice',
      ],
      NAVIGATION,
    ],
  },
  {
    page: 'sub-agents.md',
    category: 'agents',
    slug: 'behavior',
    skip: [
      [
        /^(API errors in subagents|Subagent output scanning|Run subagents in foreground or background|Which subagents run in the background|Let Claude wait for a subagent|Tools, permissions, and results of background subagents|Concurrent subagent limit|Manage subagent context|What loads at startup|Resume subagents|Auto-compaction|Fork the current conversation|How forks differ from other subagents|Turn fork mode off|Enable persistent memory)$/,
        'runtime',
      ],
      ['Quickstart: create your first subagent', 'tutorial'],
      ['Understand automatic delegation', 'advice'],
      ['Choose between subagents and main conversation', 'advice'],
      [/^(Isolate high-volume operations|Run parallel research|Chain subagents)$/, 'tutorial'],
      [
        /^(Example subagents|Code reviewer|Debugger|Data scientist|Database query validator)$/,
        'tutorial',
      ],
      ['Finished subagents in the panel and task list', 'ui'],
      ['Observe and steer running forks', 'ui'],
      NAVIGATION,
    ],
  },
  {
    page: 'hooks.md',
    category: 'hooks',
    slug: 'behavior',
    whole: [
      /^(Hook lifecycle|Prompt-based hooks|Decision control|Match MCP tools|How if patterns match Bash commands|Hook handler fields)$/,
    ],
    routes: [
      { category: 'trust', heading: /^(Workspace trust)$/ },
      {
        category: 'environment',
        heading: /^(Persist environment variables|Reload skills that a hook installs)$/,
      },
    ],
    skip: [
      ['The /hooks menu', 'ui'],
      [/^(Run tests after file changes|Check multiple conditions before stopping)$/, 'tutorial'],
      [/^(Disclaimer|Security best practices|Debug hooks)$/, 'advice'],
    ],
  },
];
