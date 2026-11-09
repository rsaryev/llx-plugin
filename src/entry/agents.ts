/** `@rsaryev/claude-plugin-kit/agents`: Sub-agents, their catalog and workflows (docs/API.md, "Sub-agents", "Workflows"). */
export * from '../agents/index.ts';
export * from '../format/workflow-meta.ts';
export * from '../format/workflow-meta-rewrite.ts';
export * from '../format/workflow-script.ts';
export * from '../agents/workflow/index.ts';
export * from '../agents/catalog/index.ts';

// File readers retain their unqualified public names; setting readers stay in settings/general.
export type { FailureCause as WorkflowFailureCause } from '../agents/workflow/attempts.ts';
