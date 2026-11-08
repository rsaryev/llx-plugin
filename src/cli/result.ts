import { toJsonValue } from '../foundation/json-value.ts';
import type { JsonValue } from '../foundation/plain-data.ts';

/**
 * What a `claude plugin` command reports (plugins/cli-reference.md, "claude plugin commands",
 * "JSON result format", "JSON result for marketplace commands"): the human line, the exit code and,
 * with `--json`, one object on the last line of stdout. The kit has no CLI of its own, so a command
 * is a plan whose outcome is one of these values; a host prints `renderCommand`'s lines and exits with its
 * code. The streams a human line goes to, and the exit code of a refusal that prints no result line,
 * are in spec/judgments.md.
 */

export const COMMAND_OUTCOMES = ['ok', 'failed'] as const;
export type CommandOutcome = (typeof COMMAND_OUTCOMES)[number];

/** `0` success, `1` failure, `2` an unexpected error (`validate` only). */
export type ExitCode = 0 | 1 | 2;

/** Fields beyond the three that are always present: `marketplace`, `pluginId`, `scope`… */
export type ResultFields = Readonly<Record<string, JsonValue>>;

export interface PluginCommandResult {
  /** The subcommand that ran, such as `install` or `marketplace-add`. */
  readonly command: string;
  readonly outcome: CommandOutcome;
  /** The human-readable description of the result, the line printed without `--json`. */
  readonly message: string;
  /** Why a command failed, such as `invalid_source`; present only when it applies. */
  readonly failureCode?: string;
  readonly fields?: ResultFields;
}

/**
 * What a command ends with. Only `result` can print the JSON line: a usage error ("an invalid
 * `--scope`"), a name that "can print no result line" and an unexpected error give a reason on
 * stderr alone.
 */
export type CommandOutput =
  | { readonly kind: 'result'; readonly result: PluginCommandResult }
  | { readonly kind: 'usage-error'; readonly reason: string }
  | { readonly kind: 'no-result-line'; readonly reason: string }
  | { readonly kind: 'unexpected-error'; readonly reason: string };

export interface Rendered {
  readonly stdout: readonly string[];
  readonly stderr: readonly string[];
  readonly exitCode: ExitCode;
}

export interface RenderOptions {
  /** `--json`: the last line of stdout is the result object instead of the human line. */
  readonly json: boolean;
  /** What the command printed before its result (a marketplace-declared command, for one). */
  readonly before?: readonly string[];
}

interface Extras {
  readonly failureCode?: string;
  readonly fields?: ResultFields;
}

const withExtras = (base: PluginCommandResult, extras: Extras): PluginCommandResult => ({
  ...base,
  ...(extras.failureCode === undefined ? {} : { failureCode: extras.failureCode }),
  ...(extras.fields === undefined ? {} : { fields: extras.fields }),
});

const resulted = (result: PluginCommandResult): CommandOutput => ({ kind: 'result', result });

export const commandSucceeded = (
  command: string,
  message: string,
  extras: Extras = {},
): CommandOutput => resulted(withExtras({ command, outcome: 'ok', message }, extras));

export const commandFailed = (
  command: string,
  message: string,
  extras: Extras = {},
): CommandOutput => resulted(withExtras({ command, outcome: 'failed', message }, extras));

export type UsageError = Extract<CommandOutput, { kind: 'usage-error' }>;
export const usageError = (reason: string): UsageError => ({ kind: 'usage-error', reason });
export const noResultLine = (reason: string): CommandOutput => ({ kind: 'no-result-line', reason });
export const unexpectedError = (reason: string): CommandOutput => ({
  kind: 'unexpected-error',
  reason,
});

/** The `command` values of the marketplace commands ("`marketplace-add`, `marketplace-remove`, or `marketplace-update`"). */
export const MARKETPLACE_COMMANDS = [
  'marketplace-add',
  'marketplace-remove',
  'marketplace-update',
] as const;
export type MarketplaceCommand = (typeof MARKETPLACE_COMMANDS)[number];

const marketplaceFields = (marketplace: string | undefined): Extras =>
  marketplace === undefined ? {} : { fields: { marketplace } };

export const marketplaceSuccess = (
  command: MarketplaceCommand,
  marketplace: string | undefined,
  message: string,
): CommandOutput => commandSucceeded(command, message, marketplaceFields(marketplace));

export const marketplaceFailure = (
  command: MarketplaceCommand,
  marketplace: string | undefined,
  message: string,
  failureCode: string,
): CommandOutput =>
  commandFailed(command, message, { ...marketplaceFields(marketplace), failureCode });

/** The object of the last line: `command`, `outcome`, the other fields, `failureCode`, `message`. */
function resultObject(found: PluginCommandResult): Readonly<Record<string, JsonValue>> {
  return {
    command: found.command,
    outcome: found.outcome,
    ...found.fields,
    ...(found.failureCode === undefined ? {} : { failureCode: found.failureCode }),
    message: found.message,
  };
}

const EXIT: { readonly [O in CommandOutcome]: ExitCode } = { ok: 0, failed: 1 };

/** The stream a result's human line goes to. */
const HUMAN_STREAM: { readonly [O in CommandOutcome]: 'stdout' | 'stderr' } = {
  ok: 'stdout',
  failed: 'stderr',
};

/** A result's human line goes to stdout on success and stderr on failure; with `--json` both are the last stdout line. */
function renderResult(found: PluginCommandResult, options: RenderOptions): Rendered {
  const before = options.before ?? [];
  const exitCode = EXIT[found.outcome];
  if (options.json) {
    const line = toJsonValue(resultObject(found));
    return { stdout: [...before, JSON.stringify(line)], stderr: [], exitCode };
  }
  const onStderr = HUMAN_STREAM[found.outcome] === 'stderr';
  return {
    stdout: onStderr ? [...before] : [...before, found.message],
    stderr: onStderr ? [found.message] : [],
    exitCode,
  };
}

const reasonOnly = (reason: string, exitCode: ExitCode): Rendered => ({
  stdout: [],
  stderr: [reason],
  exitCode,
});

type Renderer<K extends CommandOutput['kind']> = (
  output: Extract<CommandOutput, { kind: K }>,
  options: RenderOptions,
) => Rendered;

const RENDERERS: { readonly [K in CommandOutput['kind']]: Renderer<K> } = {
  result: (output, options) => renderResult(output.result, options),
  'usage-error': (output) => reasonOnly(output.reason, 1),
  'no-result-line': (output) => reasonOnly(output.reason, 1),
  'unexpected-error': (output) => reasonOnly(output.reason, 2),
};

const renderKind = <K extends CommandOutput['kind']>(
  output: Extract<CommandOutput, { kind: K }>,
  options: RenderOptions,
): Rendered => RENDERERS[output.kind](output, options);

/** What a host prints and exits with for `output`. */
export const renderCommand = (output: CommandOutput, options: RenderOptions): Rendered =>
  renderKind(output, options);
