import { loadNameIssues, validationNameIssues } from '../format/marketplace/marketplace-names.ts';
import {
  downloadFolderIssues,
  type RegisteredMarketplace,
} from '../format/marketplace/marketplace-names.ts';
import type { MarketplaceSource } from '../format/marketplace/types.ts';
import { declaredSourceRefusal } from '../marketplace/declared-source.ts';
import { idPartRefusal } from '../marketplace/add-failures.ts';
import { installClosure, type InstallPlan } from '../marketplace/dependency-install-plan.ts';
import type { GraphFacts } from '../marketplace/dependency-graph.ts';
import {
  parseMarketplaceInput,
  type MarketplaceInputOptions,
} from '../marketplace/marketplace-input.ts';
import {
  marketplaceFailure,
  marketplaceSuccess,
  noResultLine,
  usageError,
  type CommandOutput,
} from './result.ts';
import { chooseScope, type ConfigScope } from './scope.ts';

/**
 * `claude plugin marketplace add <source>` as two decisions around the host's fetch
 * (plugins/cli-reference.md, "plugin marketplace add", "JSON result for marketplace commands";
 * plugins/marketplace-reference.md, "Reserved names"): `startMarketplaceAdd` reads the arguments and
 * says what to fetch, or what the command ends with; `concludeMarketplaceAdd` takes what the fetch
 * found and says what to declare, what to install and what to print. The source forms, the
 * unrecognized-source and bare-host messages and `--sparse` are `parseMarketplaceInput`'s. What the
 * docs leave open is in spec/judgments.md.
 */

export interface AddArguments {
  readonly source: string;
  /** The raw `--scope` value. */
  readonly scope?: string;
  /** `--sparse`. */
  readonly sparse?: readonly string[];
  /** `--claudeai`: `source` is the name of a marketplace hosted on claude.ai. */
  readonly claudeai?: boolean;
  /** `--json`. */
  readonly json?: boolean;
  readonly platform?: 'posix' | 'windows';
}

export type AddStart =
  | {
      readonly kind: 'fetch';
      readonly source: MarketplaceSource;
      readonly scope: ConfigScope;
      /** The host prints the JSON line (`--json`). */
      readonly json: boolean;
    }
  /** "`--json` ... has no effect with `--claudeai`": the human line is printed. */
  | { readonly kind: 'claudeai'; readonly name: string; readonly json: false }
  | { readonly kind: 'done'; readonly output: CommandOutput };

/** "`plugin marketplace add` and `plugin marketplace remove` can print no result line" for this name. */
export const RESERVED_QUIET_NAME = 'anthropic-plugin-directory';

/** The argument is the reserved name once surrounding whitespace is dropped (spec/judgments.md). */
export const isReservedName = (argument: string): boolean =>
  argument.trim() === RESERVED_QUIET_NAME;

const done = (output: CommandOutput): AddStart => ({ kind: 'done', output });

const invalidSource = (message: string): AddStart =>
  done(marketplaceFailure('marketplace-add', undefined, message, 'invalid_source'));

function claudeAiStart(args: AddArguments): AddStart {
  if (args.scope !== undefined)
    return done(usageError('--claudeai cannot be combined with --scope'));
  if (args.sparse !== undefined)
    return done(usageError('--claudeai cannot be combined with --sparse'));
  return { kind: 'claudeai', name: args.source.trim(), json: false };
}

/** The source the text stands for, or what ends the command: `--sparse` on a source that takes none is a flag problem. */
function sourceOf(
  args: AddArguments,
): { readonly source: MarketplaceSource } | { readonly end: AddStart } {
  const options: MarketplaceInputOptions =
    args.platform === undefined ? {} : { platform: args.platform };
  const parsed = parseMarketplaceInput(args.source, {
    ...options,
    ...(args.sparse === undefined ? {} : { sparse: args.sparse }),
  });
  if ('kind' in parsed) return { source: parsed };
  const plain = parseMarketplaceInput(args.source, options);
  return {
    end: 'kind' in plain ? done(usageError(parsed.message)) : invalidSource(parsed.message),
  };
}

/** What to fetch, or what the command ends with before any fetch. */
export function startMarketplaceAdd(args: AddArguments): AddStart {
  if (isReservedName(args.source)) {
    return done(noResultLine(`"${RESERVED_QUIET_NAME}" is a reserved marketplace name`));
  }
  if (args.claudeai === true) return claudeAiStart(args);
  const scope = chooseScope('marketplace-add', args.scope);
  if ('reason' in scope) return done(scope);
  const found = sourceOf(args);
  if ('end' in found) return found.end;
  return { kind: 'fetch', source: found.source, scope: scope.scope, json: args.json === true };
}

/** What the host's fetch found. */
export interface AddFetched {
  /** The `name` of the marketplace's own manifest. */
  readonly name: string;
  /** A copy of it is already on disk. */
  readonly alreadyOnDisk: boolean;
  /** The marketplaces already registered, for the download-folder rule. */
  readonly registered: readonly RegisteredMarketplace[];
  /** The plugin graph with this marketplace's catalog read; absent when the host has no installed plugins to check. */
  readonly graph?: GraphFacts;
  /** The source a user or managed `extraKnownMarketplaces` entry lists for this name; absent when none does. */
  readonly declared?: MarketplaceSource;
}

export interface AddConclusion {
  readonly output: CommandOutput;
  /** The `extraKnownMarketplaces` entry to write; absent when nothing is declared (a failure, a claude.ai marketplace). */
  readonly declare?: {
    readonly scope: ConfigScope;
    readonly name: string;
    readonly source: MarketplaceSource;
  };
  /** The dependency installs of installed plugins the new catalog can now satisfy, one plan per plugin. */
  readonly dependencies: readonly InstallPlan[];
}

const NO_DEPENDENCIES: readonly InstallPlan[] = [];

/**
 * "After you add it, Claude Code installs any dependencies that your installed plugins were
 * missing": the install plan of every installed plugin the catalogs list that declares dependencies,
 * keeping the plans that install something or are refused. Judgment: a refused plan is reported, not
 * a failure of the add.
 */
function missingDependencies(graph: GraphFacts | undefined): readonly InstallPlan[] {
  if (graph === undefined) return NO_DEPENDENCIES;
  return graph.installed
    .filter((record) => record.dependencies.length > 0 && record.id in graph.catalog)
    .map((record) =>
      installClosure({ root: record.id, scope: record.scope, operation: 'marketplace-add' }, graph),
    )
    .filter((plan) => plan.steps.length > 0 || !plan.ok);
}

const settingsLabel = (scope: ConfigScope): string => `${scope} settings`;

/** The first reason the name is refused, or `undefined`; `plugin install --marketplace` runs the same check. */
export function nameRefusal(
  found: Pick<AddFetched, 'name' | 'registered'>,
  source: MarketplaceSource | undefined,
): string | undefined {
  const grammar = idPartRefusal(found.name);
  if (grammar !== undefined) return grammar;
  const issues = [
    ...validationNameIssues(found.name),
    ...loadNameIssues(
      found.name,
      source === undefined ? { hostedOnClaudeAi: true } : { origin: source },
    ),
    ...downloadFolderIssues(found.name, found.registered),
  ];
  return issues.find((issue) => issue.severity === 'error')?.message;
}

function concludeFetch(
  start: Extract<AddStart, { kind: 'fetch' }>,
  found: AddFetched,
): AddConclusion {
  const refusal =
    nameRefusal(found, start.source) ??
    declaredSourceRefusal({
      name: found.name,
      given: start.source,
      ...(found.declared === undefined ? {} : { declared: found.declared }),
    });
  if (refusal !== undefined) {
    return {
      output: marketplaceFailure('marketplace-add', found.name, refusal, 'invalid_name'),
      dependencies: NO_DEPENDENCIES,
    };
  }
  const where = settingsLabel(start.scope);
  const message = found.alreadyOnDisk
    ? `Marketplace '${found.name}' already on disk — declared in ${where}`
    : `Successfully added marketplace: ${found.name} (declared in ${where})`;
  return {
    output: marketplaceSuccess('marketplace-add', found.name, message),
    declare: { scope: start.scope, name: found.name, source: start.source },
    dependencies: missingDependencies(found.graph),
  };
}

/** A marketplace "hosted for your account, not declared in a settings file" (judgment: the line). */
function concludeClaudeAi(
  _start: Extract<AddStart, { kind: 'claudeai' }>,
  found: AddFetched,
): AddConclusion {
  const refusal = nameRefusal(found, undefined);
  if (refusal !== undefined) {
    return {
      output: marketplaceFailure('marketplace-add', found.name, refusal, 'invalid_name'),
      dependencies: NO_DEPENDENCIES,
    };
  }
  return {
    output: marketplaceSuccess(
      'marketplace-add',
      found.name,
      `Successfully added marketplace: ${found.name}`,
    ),
    dependencies: missingDependencies(found.graph),
  };
}

/** The starts that wait for the host's fetch. */
export type PendingAdd = Extract<AddStart, { kind: 'fetch' | 'claudeai' }>;

type Concluder<K extends PendingAdd['kind']> = (
  start: Extract<PendingAdd, { kind: K }>,
  found: AddFetched,
) => AddConclusion;

const CONCLUDERS: { readonly [K in PendingAdd['kind']]: Concluder<K> } = {
  fetch: concludeFetch,
  claudeai: concludeClaudeAi,
};

const conclude = <K extends PendingAdd['kind']>(
  start: Extract<PendingAdd, { kind: K }>,
  found: AddFetched,
): AddConclusion => CONCLUDERS[start.kind](start, found);

/** What the add ends with once the marketplace is fetched. */
export const concludeMarketplaceAdd = (start: PendingAdd, found: AddFetched): AddConclusion =>
  conclude(start, found);
