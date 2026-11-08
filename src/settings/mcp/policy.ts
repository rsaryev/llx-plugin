import type { PolicyContext, PolicyEnv } from '../context.ts';
import type { PolicyLayer } from '../layers.ts';
import type { PolicyView } from '../view.ts';
import { createMcpServerPolicy, type McpServerPolicy } from './allow-deny.ts';
import {
  projectServerApproval,
  type ApprovalSession,
  type McpTrust,
  type ProjectServerApproval,
} from './approvals.ts';
import { mcpLoadPlan, type McpLoadInput, type McpLoadPlan } from './exclusive.ts';
import { readMcpLoadSettings, type McpLoadSettings } from './load-settings.ts';
import type { ManagedMcpFile } from './managed-file.ts';
import { readManagedMcpServers, type ProvidedServers } from './managed-servers.ts';
import type { ManagedServerOptions } from './managed.ts';

/** The MCP keys of the settings policy: the approval of a project's `.mcp.json` servers and the allow and deny lists. */
export interface McpSettingsPolicy {
  /**
   * The status of each server name of the folder's `.mcp.json`. The folder's trust is the context's
   * (`isFolderTrusted('project')`); a host that knows more (the configuration home, a git-tracked
   * `settings.local.json`) passes it in `trust`.
   */
  projectServerApproval(
    servers: readonly string[],
    trust?: Partial<McpTrust>,
    session?: ApprovalSession,
  ): readonly ProjectServerApproval[];
  /**
   * `allowedMcpServers`, `deniedMcpServers` and `allowManagedMcpServersOnly` over one server. A policy
   * entry expands in the context's environment; the server's own `${VAR}` expands in `live` (default:
   * the same environment).
   */
  serverPolicy(live?: PolicyEnv): McpServerPolicy;
  /** The switches `mcpLoadPlan` reads: the two allow keys, `disableClaudeAiConnectors` and the `mcp` lock. */
  loadSettings(): McpLoadSettings;
  /** `managedMcpServers` of the managed layers, each entry checked (docs/API.md, "MCP settings"). */
  providedServers(options?: ManagedServerOptions): ProvidedServers;
  /**
   * `mcpLoadPlan` over the view: the provided servers, the settings and the lists are the policy's;
   * the host adds the file it read, the servers of the other scopes and the session.
   */
  loadPlan(facts: McpPlanFacts): McpLoadPlan;
}

export interface McpPlanFacts {
  /** `readManagedMcpFile(...).file`; omit it when no file is deployed or it cannot be read. */
  readonly managedFile?: ManagedMcpFile;
  readonly candidates: McpLoadInput['candidates'];
  readonly session: McpLoadInput['session'];
  readonly toggles?: McpLoadInput['toggles'];
  /** A Claude Desktop session that supplies its own servers: no `managedMcpServers` entry is read. */
  readonly desktopManaged?: ManagedServerOptions['desktopManaged'];
}

/** What a host adds to the view: facts no settings file holds. */
export interface McpPolicyExtras {
  /** `strictPluginOnlyCustomization` locks the `mcp` surface (the customization policy knows). */
  readonly pluginOnlyMcp?: boolean;
  /** The managed layers of the device itself (MDM, HKLM, system `managed-settings.json`). */
  readonly deviceManaged?: readonly PolicyLayer[];
}

export function createMcpSettingsPolicy(
  view: PolicyView,
  context: PolicyContext,
  extras: McpPolicyExtras = {},
): McpSettingsPolicy {
  const loadSettings = (): McpLoadSettings =>
    readMcpLoadSettings(view, {
      env: context.env,
      deviceManaged: extras.deviceManaged ?? [],
      pluginOnlyMcp: extras.pluginOnlyMcp ?? false,
    });
  const serverPolicy = (live = context.env) =>
    createMcpServerPolicy(view, { startup: context.env, live });
  const providedServers = (options?: ManagedServerOptions) =>
    readManagedMcpServers(view.layers, options);
  return {
    projectServerApproval: (servers, trust, session) =>
      projectServerApproval(
        servers,
        view.layers,
        { folderTrusted: context.isFolderTrusted('project'), ...trust },
        session,
      ),
    serverPolicy,
    loadSettings,
    providedServers,
    loadPlan: (facts) =>
      mcpLoadPlan({
        managedFile: facts.managedFile,
        managedServers: providedServers(
          facts.desktopManaged === undefined ? {} : { desktopManaged: facts.desktopManaged },
        ).servers,
        candidates: facts.candidates,
        settings: loadSettings(),
        policy: serverPolicy(),
        session: facts.session,
        toggles: facts.toggles,
      }),
  };
}
