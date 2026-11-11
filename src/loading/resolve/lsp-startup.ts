import { error, type PluginIssue } from '../../format/issues.ts';
import type { CommandSpec } from '../../ports/index.ts';
import type { ResolvedLspServer } from './lsp.ts';

export interface LspProcessPlan {
  readonly spec: CommandSpec;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly transport: 'stdio';
  readonly startupTimeoutMs?: number;
  readonly shutdownTimeoutMs?: number;
}

export interface LspStartupPlan {
  readonly process?: LspProcessPlan;
  readonly issues: readonly PluginIssue[];
}

/** Process lookup is a host fact. The kit never downloads or starts the binary. */
export function planLspStartup(
  server: ResolvedLspServer,
  facts: { readonly executableAvailable: boolean; readonly cwd: string },
): LspStartupPlan {
  if (!facts.executableAvailable) {
    return {
      issues: [error(server.name, `Executable not found in $PATH: ${server.command}`)],
    };
  }
  return {
    process: {
      spec: { form: 'exec', command: server.command, args: server.args },
      cwd: facts.cwd,
      env: { ...server.env, ...server.environment },
      transport: server.transport,
      ...(server.startupTimeoutMs !== undefined && { startupTimeoutMs: server.startupTimeoutMs }),
      ...(server.shutdownTimeoutMs !== undefined && {
        shutdownTimeoutMs: server.shutdownTimeoutMs,
      }),
    },
    issues: [],
  };
}
