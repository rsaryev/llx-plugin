import { error, type PluginIssue } from '../format/issues.ts';
import { readHelperHeaders } from '../format/helper-headers.ts';
import { commandTextIssues } from '../format/marketplace/plugin-source-kinds.ts';
import type { CommandResult, CommandRunner } from '../ports/command-runner.ts';
import type { Clock } from '../ports/clock.ts';
import type { Environment } from '../ports/environment.ts';
import type { Locations } from '../ports/locations.ts';
import { SHELLS } from './command-source.ts';
import { withoutCredentials } from './credential-variables.ts';
import { normalizeHeaders } from './header-map.ts';
import {
  stripsCredentials,
  type HeaderLayer,
  type HeaderPlace,
  type HeadersSetting,
} from './header-policy.ts';
import type { ResolvedHeaders } from './types.ts';

/**
 * Running a `headersHelper` command (plugins/host-marketplace.md, "Write the headersHelper
 * command", "When Claude Code skips a headersHelper command or drops its output"): through the
 * `CommandRunner` port, from the configuration directory, under 10 seconds, printing one JSON
 * object of header names and string values. A command that fails means the fetch or download it
 * was run for does not happen: a `PluginIssue`, never a throw.
 */

export interface HeadersHelperPorts {
  readonly runner: CommandRunner;
  /** The environment the command inherits, less the credential variables for a command that was not the user's own. */
  readonly environment: Environment;
  /** `homeDir()` and `joinPath` find the configuration directory (`~/.claude`) when `CLAUDE_CONFIG_DIR` is unset. */
  readonly locations: Locations;
}

const HELPER_TIMEOUT_MS = 10_000;
const CACHE_MS = 60_000;
const problem = (message: string): PluginIssue => error('headersHelper', message);

/** "The working directory is the configuration directory, which is `~/.claude` or `CLAUDE_CONFIG_DIR`." */
function configDirectory(ports: HeadersHelperPorts): string {
  const configured = ports.environment.get('CLAUDE_CONFIG_DIR');
  return configured !== undefined && configured !== ''
    ? configured
    : ports.locations.joinPath(ports.locations.homeDir(), '.claude');
}

function runIssue(result: CommandResult): PluginIssue | undefined {
  if (result.startError !== undefined) {
    return problem(`The headersHelper command could not be run: ${result.startError}`);
  }
  if (result.timedOut) {
    return problem(`The headersHelper command ran longer than ${HELPER_TIMEOUT_MS / 1000} seconds`);
  }
  if (result.exitCode !== 0) {
    return problem('The headersHelper command did not exit 0');
  }
  return undefined;
}

/** "Print one JSON object of header names and string values on stdout." */
function readHeaders(stdout: string): ResolvedHeaders | PluginIssue {
  const read = readHelperHeaders(stdout);
  if ('problem' in read) {
    return problem(
      read.problem === 'not-an-object'
        ? 'The headersHelper command did not print a JSON object'
        : 'The headersHelper command printed a header whose value is not a string',
    );
  }
  return { headers: normalizeHeaders(read.headers) };
}

/** Runs the layer's command and reads what it printed; a layer without a command prints no headers. */
export async function runHeadersHelper(
  layer: HeaderLayer,
  ports: HeadersHelperPorts,
  setting: Pick<HeadersSetting, 'platform'>,
  { signal }: { readonly signal: AbortSignal },
): Promise<ResolvedHeaders | PluginIssue> {
  const command = layer.headersHelper;
  if (command === undefined) return { headers: {} };
  const refused = commandTextIssues(command, 'headersHelper')[0];
  if (refused !== undefined) return refused;
  const inherited = ports.environment.snapshot();
  const result = await ports.runner.run({
    spec: SHELLS[setting.platform === 'windows' ? 'cmd' : 'sh'](command),
    cwd: configDirectory(ports),
    env: {
      ...(stripsCredentials(layer) ? withoutCredentials(inherited) : inherited),
      ...layer.variables,
    },
    timeoutMs: HELPER_TIMEOUT_MS,
    signal,
  });
  return runIssue(result) ?? readHeaders(result.stdout);
}

/** Which places reuse one run: "Claude Code reuses one run's output for up to 60 seconds" (a `url` source's command). */
const REUSED: { readonly [P in HeaderPlace]: boolean } = { 'url-source': true, entry: false };

export interface HelperCache {
  /** The run of `produce` for this layer's command, reused for up to 60 seconds when the place allows; a failure is never kept. */
  remember(
    layer: HeaderLayer,
    produce: () => Promise<ResolvedHeaders | PluginIssue>,
  ): Promise<ResolvedHeaders | PluginIssue>;
}

const keyOf = (layer: HeaderLayer): string =>
  JSON.stringify([layer.origin, layer.headersHelper, layer.variables]);

/** A cache of command runs over the clock (`Clock.now`); keep one per host session. */
export function helperCache(clock: Clock): HelperCache {
  const kept = new Map<
    string,
    { readonly at: number; readonly found: Promise<ResolvedHeaders | PluginIssue> }
  >();
  return {
    remember(layer, produce) {
      if (!REUSED[layer.place]) return produce();
      const key = keyOf(layer);
      const found = kept.get(key);
      if (found !== undefined && clock.now() - found.at < CACHE_MS) return found.found;
      // A run still in flight is shared too: concurrent downloads on one origin run the command once.
      const run = produce();
      const own = { at: clock.now(), found: run };
      kept.set(key, own);
      const forgetFailure = (produced: ResolvedHeaders | PluginIssue): void => {
        if ('severity' in produced && kept.get(key) === own) kept.delete(key);
      };
      return run.then(
        (produced) => {
          forgetFailure(produced);
          return produced;
        },
        (reason: unknown) => {
          if (kept.get(key) === own) kept.delete(key);
          return Promise.reject(reason);
        },
      );
    },
  };
}
