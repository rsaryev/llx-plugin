/**
 * What "Yes, and don't ask again" does after a prompt (permissions.md, "Permission system", the last
 * column of the table), per type of tool: how long the approval lasts and what it is keyed to. A
 * saved approval is a rule the host writes to `.claude/settings.local.json` at the root of the git
 * repository (resolved through worktrees to the main checkout); the host decides where it can.
 */
export const TOOL_TYPES = [
  'read-only',
  'bash',
  'file-modification',
  'web-fetch',
  'web-search',
] as const;
export type ToolType = (typeof TOOL_TYPES)[number];

/** How long an approval lasts. */
export type ApprovalLifetime = 'none' | 'session' | 'repository';

export interface ApprovalMemory {
  readonly lifetime: ApprovalLifetime;
  /** What a saved approval names: a command prefix, a domain, or the whole tool. */
  readonly keyedBy: 'command' | 'domain' | 'tool' | 'none';
}

/** The table's last column, one row per tool type. */
export const APPROVAL_MEMORY: { readonly [T in ToolType]: ApprovalMemory } = {
  // "N/A": a read inside the working directories needs no approval to remember.
  'read-only': { lifetime: 'none', keyedBy: 'none' },
  // "Permanently per repository and command"
  bash: { lifetime: 'repository', keyedBy: 'command' },
  // "Until session end": "A file-modification approval isn't saved to the file".
  'file-modification': { lifetime: 'session', keyedBy: 'none' },
  // "Permanently per repository and domain"
  'web-fetch': { lifetime: 'repository', keyedBy: 'domain' },
  // "Permanently per repository"
  'web-search': { lifetime: 'repository', keyedBy: 'tool' },
};

/**
 * The type of tool a built-in tool belongs to in that table: file reads and searches, shell
 * execution (`Bash` and `PowerShell`, the shells this table's "Shell execution" row names by its
 * example, spec/judgments.md), file modification, WebFetch and WebSearch. Any other tool is not in the table.
 */
const TYPE_OF: ReadonlyMap<string, ToolType> = new Map<string, ToolType>([
  ['Read', 'read-only'],
  ['Grep', 'read-only'],
  ['Glob', 'read-only'],
  ['Bash', 'bash'],
  ['PowerShell', 'bash'],
  ['Edit', 'file-modification'],
  ['Write', 'file-modification'],
  ['NotebookEdit', 'file-modification'],
  ['WebFetch', 'web-fetch'],
  ['WebSearch', 'web-search'],
]);

export const toolTypeOf = (toolName: string): ToolType | undefined => TYPE_OF.get(toolName);

/** What choosing "Yes, and don't ask again" does for a tool; `undefined` for a tool the table does not list. */
export function approvalMemory(toolName: string): ApprovalMemory | undefined {
  const type = TYPE_OF.get(toolName);
  return type === undefined ? undefined : APPROVAL_MEMORY[type];
}
