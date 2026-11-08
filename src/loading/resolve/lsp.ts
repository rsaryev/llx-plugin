import type { PluginIssue } from '../../format/issues.ts';
import type { LspServer } from '../../format/lsp-config.ts';
import { exportedEnvironment } from './exported-environment.ts';
import { fieldOf, fieldRunner, when } from './field-runner.ts';
import type { SubstitutionScope } from './scope.ts';
import { substituter } from './substitute.ts';

/**
 * What Claude Code does when a field is unset (plugins/manifest-reference.md, "lspServers"):
 * `requestTimeout` 60000 milliseconds, `restartOnCrash` true, `diagnostics` true. The docs name no
 * default for `startupTimeout` or `maxRestarts`, and "when unset, no timeout applies" for
 * `shutdownTimeout`: those stay unset in the resolved server.
 */
export const LSP_DEFAULTS = {
  requestTimeoutMs: 60000,
  restartOnCrash: true,
  diagnostics: true,
} as const;

/**
 * An LSP server config resolved for this host. The kit never starts a language server: the host's
 * LSP client reads this (command line, environment, timeouts, restart policy, the two payloads) and
 * runs it. The decisions the kit owns are in `lsp-runtime.ts`.
 */
export interface ResolvedLspServer {
  /** The key as the plugin wrote it. */
  readonly name: string;
  /** `command` with `${...}` substituted. */
  readonly command: string;
  readonly args: readonly string[];
  /** The server's own `env`, substituted; empty when it declares none. */
  readonly env: Readonly<Record<string, string>>;
  /** The variables the process receives besides `env`: the three path variables. */
  readonly environment: Readonly<Record<string, string>>;
  readonly workspaceFolder?: string;
  /** Always `stdio`: "Claude Code accepts `socket` but runs every server over stdio". */
  readonly transport: 'stdio';
  readonly extensionToLanguage: Readonly<Record<string, string>>;
  /** Not substituted: `${...}` does not resolve there (the table of fields lists four). */
  readonly initializationOptions?: unknown;
  readonly settings?: unknown;
  readonly startupTimeoutMs?: number;
  /** Undefined means no timeout: the host waits for a graceful shutdown. */
  readonly shutdownTimeoutMs?: number;
  readonly requestTimeoutMs: number;
  readonly restartOnCrash: boolean;
  /** Undefined means unbounded (judgment J-L2). */
  readonly maxRestarts?: number;
  readonly diagnostics: boolean;
}

export interface LspResolution {
  readonly resolved: ResolvedLspServer;
  readonly issues: readonly PluginIssue[];
}

/** Keeps a key out of the object when the declaration has no value for it. */
const optional = <V>(key: string, value: V | undefined): Record<string, V> =>
  value === undefined ? {} : { [key]: value };

/**
 * Resolves one server of a plugin (plugins/manifest-reference.md, "Where each variable resolves"):
 * `command`, `args`, `env` and `workspaceFolder` are substituted, the process gets the three path
 * variables (and the data folder is created for it), every other field is handed over as written
 * with the documented defaults applied.
 *
 * Judgment: `${user_config.KEY}` is read only in those four fields, although the page also says
 * "substituted in ... LSP server config": its table of fields where `${...}` resolves is the finer
 * statement, and `initializationOptions` and `settings` are data for the server, not the kit's text.
 */
export async function resolveLspServer(
  name: string,
  server: LspServer,
  scope: SubstitutionScope,
): Promise<LspResolution> {
  const run = fieldRunner(substituter(scope), `lspServers.${name}`);
  const [command, args, env, workspaceFolder, environment] = await Promise.all([
    run.one('lsp', server.command, 'command'),
    when(server.args, (each) => run.list('lsp', each, 'args')),
    when(server.env, (each) => run.table('lsp', each, 'env')),
    when(server.workspaceFolder, (each) => run.one('lsp', each, 'workspaceFolder')),
    exportedEnvironment('lsp', scope),
  ]);
  return {
    resolved: {
      name,
      command: command.value,
      args: args?.value ?? [],
      env: env?.value ?? {},
      environment,
      ...fieldOf(workspaceFolder, 'workspaceFolder'),
      transport: 'stdio',
      extensionToLanguage: server.extensionToLanguage,
      ...optional('initializationOptions', server.initializationOptions),
      ...optional('settings', server.settings),
      ...optional('startupTimeoutMs', server.startupTimeout),
      ...optional('shutdownTimeoutMs', server.shutdownTimeout),
      requestTimeoutMs: server.requestTimeout ?? LSP_DEFAULTS.requestTimeoutMs,
      restartOnCrash: server.restartOnCrash ?? LSP_DEFAULTS.restartOnCrash,
      ...optional('maxRestarts', server.maxRestarts),
      diagnostics: server.diagnostics ?? LSP_DEFAULTS.diagnostics,
    },
    issues: [command, args, env, workspaceFolder].flatMap((part) => part?.issues ?? []),
  };
}
