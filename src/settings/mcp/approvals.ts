import type { PolicyLayer, PolicyScope } from '../layers.ts';
import { createPolicyView } from '../view.ts';

/**
 * What the host knows about the folder (mcp.md, "Project server approvals and workspace trust"). The
 * kit runs no git and reads no trust dialog result: the host answers these.
 */
export interface McpTrust {
  /** The user accepted the workspace trust dialog for this folder. */
  readonly folderTrusted: boolean;
  /** The folder is "your own configuration home: your home directory, or a directory whose `.claude` you've set as `CLAUDE_CONFIG_DIR`". */
  readonly configHome?: boolean;
  /** git tracks `.claude/settings.local.json`; the docs exempt only an "untracked" one (judgment). */
  readonly localTracked?: boolean;
}

/**
 * Two of the statuses `claude mcp list` and `claude mcp get` print without connecting (mcp.md,
 * "Server status"): `pending approval` shows in both commands, `rejected` only in `claude mcp get`.
 * `✘ Blocked by enterprise managed policy` is a third such status; a policy decision is not an
 * approval decision, so it is out of scope here (spec/judgments.md).
 */
export const PROJECT_SERVER_STATUSES = ['approved', 'pending approval', 'rejected'] as const;
export type ProjectServerStatus = (typeof PROJECT_SERVER_STATUSES)[number];

/** What decided a server's status; absent while it is pending. */
export type ApprovalVia =
  | 'disabledMcpjsonServers'
  | 'enableAllProjectMcpServers'
  | 'enabledMcpjsonServers'
  | 'session';

export interface ProjectServerApproval {
  readonly name: string;
  readonly status: ProjectServerStatus;
  readonly via?: ApprovalVia;
}

/** Whether the session can show the approval prompt (`canPromptForProjectServers`). */
export interface ApprovalSession {
  readonly prompts: boolean;
}

type Honours = (trust: McpTrust) => boolean;

const always: Honours = () => true;
const never: Honours = () => false;

/**
 * The files whose approvals count. User settings, managed settings and `--settings` count in an
 * untrusted folder; the shared project file counts once the folder is trusted; an untracked
 * `.claude/settings.local.json` counts in a trusted folder or the configuration home. The parent
 * settings of an embedding host and `--add-dir` directories approve nothing (judgment, spec/judgments.md):
 * `--add-dir` settings carry two keys only (permissions.md) and parent settings keep "only the host's
 * values that restrict" (managed-settings.md); the settings key registry admits no MCP approval key
 * from either, so their `disabledMcpjsonServers` does not reject either.
 */
const HONOURS: { readonly [S in PolicyScope]: Honours } = {
  managed: always,
  flag: always,
  user: always,
  project: (trust) => trust.folderTrusted,
  local: (trust) =>
    trust.folderTrusted || (trust.configHome === true && trust.localTracked !== true),
  parent: never,
  addDir: never,
};

/**
 * `enableAllProjectMcpServers`: "In a trusted folder, a `false` in a higher-precedence file overrides
 * a `true` in a lower one; in a folder you haven't trusted, a `true` in any honored file is enough."
 */
function approvesAll(honoured: readonly PolicyLayer[], trust: McpTrust): boolean {
  const holders = createPolicyView(honoured).eachFromHighest('enableAllProjectMcpServers');
  return trust.folderTrusted ? holders[0]?.value === true : holders.some((holder) => holder.value);
}

const approved = (name: string, via: ApprovalVia): ProjectServerApproval => ({
  name,
  status: 'approved',
  via,
});

/**
 * The status of each server of a project's `.mcp.json` (`servers` are its names, in the order to
 * report). A server is pending until `enableAllProjectMcpServers` or `enabledMcpjsonServers` approves
 * it; a `disabledMcpjsonServers` entry in any file, honoured or not, rejects it and takes precedence.
 * A session that cannot prompt (`claude -p`, Agent SDK, cloud) loads a pending server without asking.
 */
export function projectServerApproval(
  servers: readonly string[],
  layers: readonly PolicyLayer[],
  trust: McpTrust,
  session: ApprovalSession = { prompts: true },
): readonly ProjectServerApproval[] {
  const honoured = layers.filter((layer) => HONOURS[layer.scope](trust));
  const named = new Set(createPolicyView(honoured).get('enabledMcpjsonServers'));
  const rejected = new Set(createPolicyView(layers).get('disabledMcpjsonServers'));
  const all = approvesAll(honoured, trust);
  return servers.map((name): ProjectServerApproval => {
    if (rejected.has(name)) return { name, status: 'rejected', via: 'disabledMcpjsonServers' };
    if (all) return approved(name, 'enableAllProjectMcpServers');
    if (named.has(name)) return approved(name, 'enabledMcpjsonServers');
    return session.prompts ? { name, status: 'pending approval' } : approved(name, 'session');
  });
}

/** Where `skipDangerousModePermissionPrompt` counts for this: "your user settings or ... managed settings". */
const SKIPS_PROMPT_FROM: { readonly [S in PolicyScope]: boolean } = {
  managed: true,
  user: true,
  flag: false,
  local: false,
  project: false,
  parent: false,
  addDir: false,
};

export interface PromptSession {
  /** An interactive session; `claude -p`, Agent SDK and cloud sessions "can't show that prompt". */
  readonly interactive: boolean;
  /** The session runs in `bypassPermissions` mode. */
  readonly bypassPermissions: boolean;
}

/**
 * Whether the session shows the approval prompt (mcp.md, "Project scope"): interactive sessions do,
 * except one in `bypassPermissions` mode with `skipDangerousModePermissionPrompt` set in user or
 * managed settings.
 */
export function canPromptForProjectServers(
  session: PromptSession,
  layers: readonly PolicyLayer[],
): boolean {
  const skips = layers.some(
    (layer) =>
      SKIPS_PROMPT_FROM[layer.scope] && layer.settings.skipDangerousModePermissionPrompt === true,
  );
  return session.interactive && !(session.bypassPermissions && skips);
}
