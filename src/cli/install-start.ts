import type { MarketplaceSource } from '../format/marketplace/types.ts';
import {
  parseMarketplaceInput,
  type MarketplaceInputOptions,
} from '../marketplace/marketplace-input.ts';
import type { Clock } from '../ports/clock.ts';
import type { Environment } from '../ports/environment.ts';
import {
  refreshBeforeInstall,
  type KnownMarketplace,
  type RefreshDecision,
} from '../updates/refresh-before-install.ts';
import { exclusiveAcceptFlags } from './command-acceptance.ts';
import { parseConfigFlags } from './install-config.ts';
import { parsePluginRef } from './plugin-ref.ts';
import { commandFailed, usageError, type CommandOutput } from './result.ts';
import { chooseScope, type ConfigScope } from './scope.ts';

/**
 * The first half of `claude plugin install <plugin>` (plugins/cli-reference.md, "plugin install"):
 * what the arguments mean and what the host does before it looks the plugin up: add the
 * `--marketplace` source first, refresh the marketplace the install names (plugins/loading.md, "When
 * Claude Code refreshes a marketplace before an install", through `refreshBeforeInstall`). The rest
 * is `planInstall`. A marketplace added by `--marketplace` is "declared in your user settings even
 * when you pass `--scope project`" (plugins/install.md, "Add and install from your shell"); it was
 * just fetched, so no refresh follows it (judgment, spec/judgments.md).
 */

export interface InstallArguments {
  /** `name`, or `name@marketplace`; the bare name alone with `--marketplace`. */
  readonly plugin: string;
  readonly scope?: string;
  /** Each `--config` flag as written, `key=value`. */
  readonly config?: readonly string[];
  readonly json?: boolean;
  readonly yes?: boolean;
  readonly acceptCommand?: string;
  /** `--marketplace <source>`. */
  readonly marketplace?: string;
  readonly platform?: 'posix' | 'windows';
}

export interface InstallContext {
  readonly marketplaces: readonly KnownMarketplace[];
  readonly env: Environment;
  readonly clock: Clock;
  /** The command runs inside a Claude Code session. */
  readonly session: boolean;
  /** Both stdin and stdout are a terminal. */
  readonly tty: boolean;
}

/** What the host does before the lookup. */
export interface PendingInstall {
  readonly plugin: string;
  readonly scope: ConfigScope;
  readonly json: boolean;
  readonly given: Readonly<Record<string, string>>;
  readonly yes: boolean;
  readonly acceptCommand?: string;
  readonly session: boolean;
  readonly tty: boolean;
  /** Add this marketplace first, to the user settings. */
  readonly addMarketplace?: { readonly source: MarketplaceSource; readonly scope: 'user' };
  readonly refresh: RefreshDecision;
}

export type InstallStart =
  | { readonly kind: 'done'; readonly output: CommandOutput }
  | { readonly kind: 'prepare'; readonly pending: PendingInstall };

const done = (output: CommandOutput): InstallStart => ({ kind: 'done', output });

/** The source `--marketplace` names, or what ends the command. */
function marketplaceSource(
  args: InstallArguments,
): { readonly source: MarketplaceSource } | { readonly end: CommandOutput } {
  if (args.marketplace === undefined) return { end: usageError('no --marketplace') };
  if (parsePluginRef(args.plugin)?.marketplace !== undefined) {
    return {
      end: usageError('--marketplace needs the plugin name by itself, without @marketplace'),
    };
  }
  const options: MarketplaceInputOptions =
    args.platform === undefined ? {} : { platform: args.platform };
  const parsed = parseMarketplaceInput(args.marketplace, options);
  if ('kind' in parsed) return { source: parsed };
  return {
    end: commandFailed('install', parsed.message, { failureCode: 'invalid_source' }),
  };
}

/** The refresh decision of the install: none for a marketplace that was just added. */
const refreshOf = (args: InstallArguments, context: InstallContext): RefreshDecision =>
  args.marketplace === undefined
    ? refreshBeforeInstall({
        ref: args.plugin,
        command: 'claude plugin install',
        marketplaces: context.marketplaces,
        lookupMissed: false,
        env: context.env,
        clock: context.clock,
      })
    : { outcome: 'skip', reason: 'marketplace-unknown' };

interface Parsed {
  readonly scope: ConfigScope;
  readonly given: Readonly<Record<string, string>>;
  readonly added?: { readonly source: MarketplaceSource; readonly scope: 'user' };
}

/** The flags the install reads, or the output that ends the command before anything else happens. */
function parseArguments(args: InstallArguments): Parsed | { readonly end: CommandOutput } {
  const chosen = chooseScope('install', args.scope);
  if ('reason' in chosen) return { end: chosen };
  const exclusive = exclusiveAcceptFlags({
    ...(args.yes === undefined ? {} : { yes: args.yes }),
    ...(args.acceptCommand === undefined ? {} : { acceptCommand: args.acceptCommand }),
  });
  if (exclusive !== undefined) return { end: exclusive };
  const config = parseConfigFlags(args.config ?? []);
  if (!('given' in config)) return { end: config };
  if (args.marketplace === undefined) return { scope: chosen.scope, given: config.given };
  const added = marketplaceSource(args);
  if ('end' in added) return added;
  return {
    scope: chosen.scope,
    given: config.given,
    added: { source: added.source, scope: 'user' },
  };
}

const pendingOf = (
  args: InstallArguments,
  context: InstallContext,
  parsed: Parsed,
  refresh: RefreshDecision,
): PendingInstall => ({
  plugin: args.plugin,
  scope: parsed.scope,
  json: args.json === true,
  given: parsed.given,
  yes: args.yes === true,
  ...(args.acceptCommand === undefined ? {} : { acceptCommand: args.acceptCommand }),
  session: context.session,
  tty: context.tty,
  ...(parsed.added === undefined ? {} : { addMarketplace: parsed.added }),
  refresh,
});

/** Reads the arguments and says what to do before the lookup, or what the command ends with. */
export function startInstall(args: InstallArguments, context: InstallContext): InstallStart {
  const parsed = parseArguments(args);
  if ('end' in parsed) return done(parsed.end);
  const refresh = refreshOf(args, context);
  if ('issue' in refresh) {
    return done(
      commandFailed('install', refresh.issue.message, { failureCode: 'marketplace_blocked' }),
    );
  }
  return { kind: 'prepare', pending: pendingOf(args, context, parsed, refresh) };
}
