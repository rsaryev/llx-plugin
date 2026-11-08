/**
 * What runs before a folder is trusted (permissions.md, "What runs before you trust a folder"): one
 * row of the docs' table per kind of repository content, with the two situations in which the folder
 * itself is not trusted: only a parent folder was trusted, or `claude -p` or the SDK ran there, which
 * never shows the trust dialog. Pure: the settings and MCP streams ask `contentGate`.
 */

export const REPOSITORY_CONTENT = [
  'settings-hooks',
  'env-and-helper-commands',
  'skill-hooks',
  'skill-allowed-tools',
  'allow-rules',
  'additional-directories',
  'subagent-frontmatter-hooks',
  'skills-dir-plugin',
  'extra-known-marketplaces',
  'subagent-inline-mcp',
  'mcp-json-servers',
  'headers-helper',
] as const;
export type RepositoryContent = (typeof REPOSITORY_CONTENT)[number];

/**
 * What a gate asks of the user before the content takes effect: nothing, the trust dialog (shown
 * again, naming the content), a per-server approval, or never (no dialog is offered).
 */
export type Consent = 'none' | 'trust-dialog' | 'server-approval' | 'never';

export interface ContentGate {
  /** The content takes effect now. */
  readonly applies: boolean;
  readonly consent: Consent;
  /** The line Claude Code prints to stderr, as the docs name it. */
  readonly stderr?: string;
  /** What is used meanwhile. */
  readonly fallback?: 'static-headers';
  /** Whether approvals the repository commits in its own settings count (`.mcp.json` servers). */
  readonly repositoryApprovals?: boolean;
}

/** The columns of the table, and the folder's other states. */
export const TRUST_SITUATIONS = ['trusted', 'parent-trusted', 'non-interactive', 'dialog'] as const;
export type TrustSituation = (typeof TRUST_SITUATIONS)[number];

type Row = { readonly [S in TrustSituation]: ContentGate };

const USED: ContentGate = { applies: true, consent: 'none' };
const WAITS: ContentGate = { applies: false, consent: 'trust-dialog' };
const NEVER: ContentGate = { applies: false, consent: 'never' };

/** A row that is used in a trusted folder and in both columns of the table, and waits for the dialog before. */
const alwaysUsed = (before: ContentGate): Row => ({
  trusted: USED,
  'parent-trusted': USED,
  'non-interactive': USED,
  dialog: before,
});

/** A row not used in either column and never offered a dialog. */
const neverUntilTrusted: Row = {
  trusted: USED,
  'parent-trusted': NEVER,
  'non-interactive': NEVER,
  dialog: WAITS,
};

const ALLOW_RULES: Row = {
  trusted: USED,
  'parent-trusted': WAITS,
  'non-interactive': {
    applies: false,
    consent: 'never',
    stderr: 'this workspace has not been trusted',
  },
  dialog: WAITS,
};

const STATIC_HEADERS = 'static-headers' as const;

/**
 * One row per kind of content. Judgment (spec/judgments.md): the table has no column for a folder
 * that nothing was trusted for in an interactive session (`dialog`), nor for a trusted one; there the
 * content that needs the exact folder waits for the dialog the session shows, hooks of settings
 * files do too (hooks.md, "Workspace trust"), and what the table calls "Used" in both columns, a
 * skill's `allowed-tools` (never gated "in any session"), is used.
 */
export const CONTENT_GATES: { readonly [C in RepositoryContent]: Row } = {
  'settings-hooks': alwaysUsed(WAITS),
  'env-and-helper-commands': alwaysUsed(WAITS),
  'skill-hooks': alwaysUsed(WAITS),
  'skill-allowed-tools': alwaysUsed(USED),
  'allow-rules': ALLOW_RULES,
  'additional-directories': ALLOW_RULES,
  'subagent-frontmatter-hooks': neverUntilTrusted,
  'skills-dir-plugin': neverUntilTrusted,
  'extra-known-marketplaces': neverUntilTrusted,
  'subagent-inline-mcp': neverUntilTrusted,
  'mcp-json-servers': {
    trusted: { applies: false, consent: 'server-approval', repositoryApprovals: true },
    'parent-trusted': { applies: false, consent: 'server-approval', repositoryApprovals: false },
    'non-interactive': { applies: true, consent: 'none' },
    dialog: { applies: false, consent: 'server-approval', repositoryApprovals: false },
  },
  'headers-helper': {
    trusted: USED,
    'parent-trusted': { applies: false, consent: 'trust-dialog', fallback: STATIC_HEADERS },
    'non-interactive': {
      applies: false,
      consent: 'never',
      fallback: STATIC_HEADERS,
      stderr: 'headersHelper not run',
    },
    dialog: { applies: false, consent: 'trust-dialog', fallback: STATIC_HEADERS },
  },
};

export interface TrustSituationFacts {
  /** The trust dialog was accepted for this exact folder. */
  readonly folderTrusted: boolean;
  /** Only a parent folder was trusted. */
  readonly parentTrusted: boolean;
  /** `claude -p` or the SDK. */
  readonly nonInteractive: boolean;
  /** The folder is a git repository nested inside the trusted one (a submodule, a clone). */
  readonly nestedRepository: boolean;
}

/**
 * Which column applies. "The parent-folder column doesn't apply inside a nested repository: in an
 * interactive session Claude Code shows the trust dialog for it, and a `claude -p` or SDK run there
 * follows the `claude -p` column."
 */
export function trustSituation(facts: TrustSituationFacts): TrustSituation {
  if (facts.folderTrusted) return 'trusted';
  if (facts.nonInteractive) return 'non-interactive';
  return facts.parentTrusted && !facts.nestedRepository ? 'parent-trusted' : 'dialog';
}

export const contentGate = (content: RepositoryContent, situation: TrustSituation): ContentGate =>
  CONTENT_GATES[content][situation];

/** The kinds of entry a project settings file's `permissions` holds, and whether each grants capability. */
export const PROJECT_PERMISSION_ENTRIES = [
  'allow',
  'ask',
  'deny',
  'additionalDirectories',
] as const;
export type ProjectPermissionEntry = (typeof PROJECT_PERMISSION_ENTRIES)[number];

const GRANTS: { readonly [E in ProjectPermissionEntry]: boolean } = {
  allow: true,
  ask: false,
  deny: false,
  additionalDirectories: true,
};

/**
 * "`permissions.allow` rules and `permissions.additionalDirectories` entries in a project's
 * `.claude/settings.json` grant capability, so Claude Code applies them only after you accept the
 * workspace trust dialog for that folder ... `deny` and `ask` rules aren't affected, since they only
 * restrict."
 */
export const projectEntryApplies = (
  entry: ProjectPermissionEntry,
  folderTrusted: boolean,
): boolean => !GRANTS[entry] || folderTrusted;

/** What the dialog lists "so you can review them first": the rules and directories the folder would grant. */
export function trustDialogListing(permissions: {
  readonly allow?: readonly string[] | undefined;
  readonly additionalDirectories?: readonly string[] | undefined;
}): { readonly allow: readonly string[]; readonly additionalDirectories: readonly string[] } {
  return {
    allow: permissions.allow ?? [],
    additionalDirectories: permissions.additionalDirectories ?? [],
  };
}
