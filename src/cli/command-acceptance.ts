import type { Sha256 } from '../ports/marketplace.ts';
import { usageError, type UsageError } from './result.ts';

/**
 * Accepting a marketplace-declared command before `claude plugin install` or `update` runs it
 * (plugins/cli-reference.md, "plugin install": `-y, --yes`, `--accept-command <sha256>`, the lines
 * `Aborted.` and `Aborted — the command was not run.`; "Accept a displayed install command";
 * plugins/host-marketplace.md, "How users accept a headersHelper command"). "Claude Code first prints
 * the command and asks `Run this command now? [y/N]`"; `-y` accepts it "Ignored when the command runs
 * inside a Claude Code session"; `--accept-command` "Can't be combined with `-y`" and "has no effect
 * inside a Claude Code session"; "The `sha256` counts as acceptance for exactly that command, plugin,
 * and marketplace catalog. If any of them changed since the command was displayed, Claude Code
 * doesn't accept the `sha256` and shows the command again. A change that the run's own marketplace
 * refresh fetches also counts as such a change." Judgments (spec/judgments.md): what the digest
 * covers (`digestOf`), that a `--accept-command` that does not match never prompts, and the line a
 * command source gets when it cannot be confirmed without a terminal.
 */

/** What the entry asks Claude Code to run. A `headersHelper` wins when an entry has both. */
export type CommandOrigin = 'command-source' | 'headers-helper';

export interface DisplayedCommand {
  readonly command: string;
  /** The plugin id the command belongs to. */
  readonly plugin: string;
  readonly origin: CommandOrigin;
}

export interface AcceptanceFlags {
  readonly yes?: boolean;
  readonly acceptCommand?: string;
}

/** "Can't be combined with `-y`": a flag problem, nothing is printed but the reason. */
export function exclusiveAcceptFlags(flags: AcceptanceFlags): UsageError | undefined {
  return flags.yes === true && flags.acceptCommand !== undefined
    ? usageError('--accept-command cannot be combined with -y')
    : undefined;
}

/** The object a `--json` run's `failed` result carries when it displays a command and does not run it. */
export interface ShownCommand {
  readonly command: string;
  readonly plugin: string;
  readonly sha256: string;
  /** Present when `--accept-command` was passed: whether its value is the digest of the command now displayed. */
  readonly acceptCommandMatched?: boolean;
}

export interface AcceptanceRequest {
  readonly shown: DisplayedCommand;
  /** The marketplace catalog the run read, after its own refresh: a change the refresh fetched changes the digest. */
  readonly catalog: string;
  readonly flags: AcceptanceFlags;
  /** The command runs inside a Claude Code session (the Bash tool, a hook). */
  readonly session: boolean;
  /** Both stdin and stdout are a terminal. */
  readonly tty: boolean;
  /** The answer to `Run this command now? [y/N]`, once the host has asked. */
  readonly answer?: boolean;
}

export const PROMPT = 'Run this command now? [y/N]';
const ABORTED = 'Aborted.';
const ABORTED_NOT_RUN = 'Aborted — the command was not run.';
/** What a command source gets without a terminal and without `-y` or `--accept-command`: "the command was only displayed". */
const ONLY_DISPLAYED =
  'The install command was only displayed, not run. Pass -y, or --accept-command with the sha256 of the displayed command, to run it.';

export type CommandAcceptance =
  | { readonly run: true }
  /** The host prints the command, asks `prompt` and calls again with the answer. */
  | {
      readonly run: false;
      readonly ask: true;
      readonly prompt: string;
      readonly shownCommand: ShownCommand;
    }
  | {
      readonly run: false;
      readonly ask: false;
      readonly line: string;
      readonly shownCommand: ShownCommand;
    };

/** The digest `--accept-command` names: SHA-256 of the command, the plugin and the catalog it came from (judgment: the docs do not say how it is built). */
export async function digestOf(
  shown: DisplayedCommand,
  catalog: string,
  sha256: Sha256,
): Promise<string> {
  const text = JSON.stringify({ command: shown.command, plugin: shown.plugin, catalog });
  return sha256.hex(new TextEncoder().encode(text));
}

const DECLINED: { readonly [O in CommandOrigin]: string } = {
  'command-source': ABORTED,
  'headers-helper': ABORTED_NOT_RUN,
};

const UNCONFIRMED: { readonly [O in CommandOrigin]: string } = {
  'command-source': ONLY_DISPLAYED,
  'headers-helper': ABORTED_NOT_RUN,
};

const refused = (line: string, shownCommand: ShownCommand): CommandAcceptance => ({
  run: false,
  ask: false,
  line,
  shownCommand,
});

/** Without `-y` or a matching digest: ask at a terminal, refuse without one. */
function confirm(request: AcceptanceRequest, shownCommand: ShownCommand): CommandAcceptance {
  const { origin } = request.shown;
  if (!request.tty) return refused(UNCONFIRMED[origin], shownCommand);
  if (request.answer === undefined) return { run: false, ask: true, prompt: PROMPT, shownCommand };
  return request.answer ? { run: true } : refused(DECLINED[origin], shownCommand);
}

/**
 * Whether the displayed command runs. Inside a session neither `-y` nor `--accept-command` counts.
 * A digest that does not match the command now displayed is shown again with
 * `acceptCommandMatched: false` and never prompts.
 */
export async function decideAcceptance(
  request: AcceptanceRequest,
  sha256: Sha256,
): Promise<CommandAcceptance> {
  const digest = await digestOf(request.shown, request.catalog, sha256);
  const base = { command: request.shown.command, plugin: request.shown.plugin, sha256: digest };
  const given = request.session ? undefined : request.flags.acceptCommand;
  if (given !== undefined) {
    if (given === digest) return { run: true };
    return refused(DECLINED[request.shown.origin], { ...base, acceptCommandMatched: false });
  }
  if (!request.session && request.flags.yes === true) return { run: true };
  return confirm(request, base);
}
