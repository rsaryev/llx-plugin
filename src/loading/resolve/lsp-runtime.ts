import { warning, type PluginIssue } from '../../format/issues.ts';
import type { LspServer } from '../../format/lsp-config.ts';
import { LSP_DEFAULTS } from './lsp.ts';

/**
 * The parts of an LSP server's runtime the kit decides as pure functions over data
 * (plugins/manifest-reference.md, "lspServers"; plugins/components.md, "LSP servers"). Starting,
 * stopping and timing the process, and speaking the protocol, are the host's LSP client.
 */

export type RestartDecision = 'restart' | 'stay-stopped';

/**
 * Whether a crashed server is restarted. `restartOnCrash` false "leave[s] a crashed server stopped";
 * `maxRestarts` is the "restart attempts before giving up, zero or more". `restartsSoFar` counts the
 * attempts already made for this server (judgment: not the crash in hand, so with `maxRestarts: 2`
 * the first two crashes restart and the third does not). With `maxRestarts` unset, restarts are
 * unbounded (judgment J-L2: the docs name no default).
 */
export function lspRestartDecision(
  server: Pick<LspServer, 'restartOnCrash' | 'maxRestarts'>,
  restartsSoFar: number,
): RestartDecision {
  const enabled = server.restartOnCrash ?? LSP_DEFAULTS.restartOnCrash;
  const withinLimit = server.maxRestarts === undefined || restartsSoFar < server.maxRestarts;
  return enabled && withinLimit ? 'restart' : 'stay-stopped';
}

/**
 * The part of the `initialize` request params this config decides: "Options sent in the initialize
 * request". The host adds its own (process ID, root, capabilities) around it.
 */
export function initializeOptionsOf(server: Pick<LspServer, 'initializationOptions'>): {
  initializationOptions?: unknown;
} {
  return server.initializationOptions === undefined
    ? {}
    : { initializationOptions: server.initializationOptions };
}

export interface DidChangeConfiguration {
  readonly method: 'workspace/didChangeConfiguration';
  readonly params: { readonly settings: unknown };
}

/**
 * The notification that carries `settings` ("Settings sent by `workspace/didChangeConfiguration`").
 * Judgment: a server without `settings` is sent none.
 */
export const didChangeConfigurationOf = (
  server: Pick<LspServer, 'settings'>,
): DidChangeConfiguration | undefined =>
  server.settings === undefined
    ? undefined
    : { method: 'workspace/didChangeConfiguration', params: { settings: server.settings } };

type Routed = Pick<LspServer, 'extensionToLanguage'>;

export interface LanguageRoute {
  readonly server: string;
  readonly languageId: string;
}

const lastSegment = (filePath: string): string => filePath.split(/[/\\]/).at(-1) ?? filePath;

/**
 * The server and language ID for a file: "each file extension gets one server" and "the first
 * registered handles those files". `servers` is in registration order (the order of the record) and
 * its key must be unique across every plugin, so qualify it (`plugin:server`): two plugins that
 * each declare `go` would otherwise collide in the record and one would vanish.
 * Judgment: extensions match as written (case-sensitive) at the end of the last path segment, a name
 * that is only the extension (`.ts`) has none, and the longest matching extension wins (`.d.ts` over
 * `.ts`), the first registered server among equals.
 */
export function languageIdFor(
  servers: Readonly<Record<string, Routed>>,
  filePath: string,
): LanguageRoute | undefined {
  const name = lastSegment(filePath);
  const matches = Object.entries(servers).flatMap(([server, config]) =>
    Object.entries(config.extensionToLanguage)
      .filter(([extension]) => name.length > extension.length && name.endsWith(extension))
      .map(([extension, languageId]) => ({ server, languageId, length: extension.length })),
  );
  const best = matches.reduce<(typeof matches)[number] | undefined>(
    (found, each) => (found === undefined || each.length > found.length ? each : found),
    undefined,
  );
  return best && { server: best.server, languageId: best.languageId };
}

/**
 * The warning components.md quotes for a server that loses an extension to an earlier one:
 * `LSP server "<name>" is not used for <ext> files`. One per server and extension. `<name>` is the
 * record key, so it is plugin-qualified (`plugin:server`) when the servers come from several plugins.
 */
export function lspExtensionConflicts(servers: Readonly<Record<string, Routed>>): PluginIssue[] {
  const owner = new Map<string, string>();
  return Object.entries(servers).flatMap(([name, config]) =>
    Object.keys(config.extensionToLanguage).flatMap((extension) => {
      const first = owner.get(extension);
      if (first === undefined) {
        owner.set(extension, name);
        return [];
      }
      return [warning(name, `LSP server "${name}" is not used for ${extension} files`)];
    }),
  );
}
