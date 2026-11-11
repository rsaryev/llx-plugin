import type { GraphFacts } from '../marketplace/dependency-graph.ts';
import { planPrune, type PruneOutcome } from '../marketplace/dependency-prune.ts';
import { commandSucceeded, type CommandOutput } from './result.ts';
import { chooseScope, type ConfigScope } from './scope.ts';

/**
 * `claude plugin prune` as a plan (plugins/cli-reference.md, "plugin prune"): the orphaned
 * auto-installed dependencies at one scope (`user` by default), listed, asked about, or removed by
 * the flags and the terminal. The decision is `planPrune`'s (marketplace); this adds the scope, the
 * result a host prints and the answer to the prompt. "The exit code is `0` whatever you answer at
 * the prompt": a refusal without a terminal exits `0` too (spec/judgments.md).
 */

export interface PruneArguments {
  readonly scope?: string;
  readonly dryRun?: boolean;
  readonly yes?: boolean;
}

export interface PruneFacts {
  readonly graph: GraphFacts;
  /** Both stdin and stdout are a terminal. */
  readonly tty: boolean;
}

/** The question the host asks, with what it removes if the answer is yes. */
export interface PruneQuestion {
  readonly prompt: string;
  readonly orphans: readonly string[];
}

export interface PrunePlan {
  readonly output: CommandOutput;
  /** The scope pruned. */
  readonly scope: ConfigScope;
  /** The plugin ids the host uninstalls from `scope`. */
  readonly remove: readonly string[];
  /** Set when the host asks first; `answerPrune` turns the answer into the final plan. */
  readonly ask?: PruneQuestion;
}

const NOTHING_REMOVED = 'Nothing removed';

const printed = (message: string) => commandSucceeded('prune', message);

type Handler<K extends PruneOutcome['kind']> = (
  outcome: Extract<PruneOutcome, { kind: K }>,
  scope: ConfigScope,
) => PrunePlan;

const shown = (message: string, scope: ConfigScope): PrunePlan => ({
  output: printed(message),
  scope,
  remove: [],
});

/** What each outcome of the decision prints and removes. */
const HANDLERS: { readonly [K in PruneOutcome['kind']]: Handler<K> } = {
  nothing: (outcome, scope) => shown(outcome.message, scope),
  listed: (outcome, scope) => shown(outcome.message, scope),
  refused: (outcome, scope) => shown(outcome.message, scope),
  removed: (outcome, scope) => ({
    output: printed(outcome.message),
    scope,
    remove: outcome.orphans,
  }),
  ask: (outcome, scope) => ({
    output: printed(`${outcome.orphans.join(', ')}\n${outcome.prompt}`),
    scope,
    remove: [],
    ask: { prompt: outcome.prompt, orphans: outcome.orphans },
  }),
};

function handle<K extends PruneOutcome['kind']>(
  outcome: Extract<PruneOutcome, { kind: K }>,
  scope: ConfigScope,
): PrunePlan {
  return HANDLERS[outcome.kind](outcome, scope);
}

/** What `claude plugin prune` shows and removes, before any answer. */
export function planPruneCommand(args: PruneArguments, facts: PruneFacts): PrunePlan {
  const chosen = chooseScope('prune', args.scope);
  if ('reason' in chosen) return { output: chosen, scope: 'user', remove: [] };
  const { scope } = chosen;
  const outcome = planPrune(facts.graph, scope, {
    ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun }),
    ...(args.yes === undefined ? {} : { yes: args.yes }),
    tty: facts.tty,
  });
  return handle(outcome, scope);
}

/** The plan once the user has answered `Remove? [y/N]`; a plan that asked nothing is returned as it is. */
export function answerPrune(plan: PrunePlan, yes: boolean): PrunePlan {
  if (plan.ask === undefined) return plan;
  const { orphans } = plan.ask;
  if (!yes) return { output: printed(NOTHING_REMOVED), scope: plan.scope, remove: [] };
  return {
    output: printed(`Removed ${orphans.length} auto-installed plugins: ${orphans.join(', ')}`),
    scope: plan.scope,
    remove: orphans,
  };
}
