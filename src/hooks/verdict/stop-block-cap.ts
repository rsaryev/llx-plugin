import { warning } from '../../format/issues.ts';
import type { Environment } from '../../ports/index.ts';
import type { HookEvent } from '../../protocol/official.ts';
import type { HookOutcome } from '../outcome.ts';

/**
 * The cap on a Stop hook that keeps blocking (env-vars.md, `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`):
 * "Maximum number of consecutive times a Stop or SubagentStop hook may block the turn from ending
 * before Claude Code overrides it and ends the turn anyway (default: 8). Set to `0` to disable the
 * cap." hooks.md ("Stop decision control") names the same loop protection, "the `stop_hook_active`
 * input and the 8-consecutive-continuation cap", for `additionalContext` that keeps the
 * conversation going too, so both kinds of continuation count.
 *
 * The count is the engine's state: one counter per session (and per subagent for `SubagentStop`),
 * which a Stop that does not hold the turn back, and a Stop that starts a fresh turn
 * (`stop_hook_active` is not `true`), reset.
 *
 * Judgments (spec/judgments.md): a value that is not a whole number of at least 0 is the default;
 * the block that exceeds the cap is the one overridden (the first 8 count), and the override leaves
 * a warning issue, since the docs describe no message for it.
 */

export const DEFAULT_STOP_BLOCK_CAP = 8;
const VARIABLE = 'CLAUDE_CODE_STOP_HOOK_BLOCK_CAP';

/** The events the cap guards: the ones whose "block" keeps Claude working. */
const GUARDED: ReadonlySet<HookEvent> = new Set<HookEvent>(['Stop', 'SubagentStop']);

/** The cap in force: `0` is "no cap". */
export function stopBlockCap(environment: Environment): number {
  const text = environment.get(VARIABLE)?.trim();
  return text !== undefined && /^\d+$/.test(text) ? Number(text) : DEFAULT_STOP_BLOCK_CAP;
}

const textOf = (facts: object, key: string): string | undefined => {
  const found = Object.entries(facts).find(([name]) => name === key)?.[1];
  return typeof found === 'string' ? found : undefined;
};

/** One counter per session; a subagent's stops are counted apart from the main agent's. */
const counterKey = (event: HookEvent, sessionId: string, facts: object): string =>
  `${event}:${sessionId}:${textOf(facts, 'agent_id') ?? ''}`;

const isFreshTurn = (facts: object): boolean =>
  !Object.entries(facts).some(([name, value]) => name === 'stop_hook_active' && value === true);

const holdsTurn = (outcome: HookOutcome<HookEvent>): boolean =>
  outcome.block !== undefined || outcome.effects.continuesTurn === true;

/** The outcome with the hold on the turn lifted: the turn ends. */
function overridden<E extends HookEvent>(outcome: HookOutcome<E>, cap: number): HookOutcome<E> {
  const { block: _held, ...rest } = outcome;
  const { continuesTurn: _continues, ...effects } = outcome.effects;
  const message = `A ${outcome.event} hook held the turn back ${cap} times in a row; Claude Code ends the turn anyway (${VARIABLE}).`;
  return {
    ...rest,
    proceed: true,
    effects,
    issues: [...outcome.issues, warning(`hooks.${outcome.event}`, message)],
  };
}

export interface StopBlockCap {
  /** Counts this dispatch and overrides the hold once it exceeds the cap. */
  apply<E extends HookEvent>(
    outcome: HookOutcome<E>,
    where: { readonly sessionId: string; readonly facts: object },
    environment: Environment,
  ): HookOutcome<E>;
}

export function createStopBlockCap(): StopBlockCap {
  const counts = new Map<string, number>();
  return {
    apply(outcome, { sessionId, facts }, environment) {
      if (!GUARDED.has(outcome.event)) return outcome;
      const key = counterKey(outcome.event, sessionId, facts);
      if (!holdsTurn(outcome)) {
        counts.delete(key);
        return outcome;
      }
      const cap = stopBlockCap(environment);
      const count = (isFreshTurn(facts) ? 0 : (counts.get(key) ?? 0)) + 1;
      if (cap === 0 || count <= cap) {
        counts.set(key, count);
        return outcome;
      }
      counts.delete(key);
      return overridden(outcome, cap);
    },
  };
}
