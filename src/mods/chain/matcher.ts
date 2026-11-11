import { createBudget } from '../../foundation/index.ts';
import type { Clock } from '../../ports/index.ts';
import type { ModMatcherValue, ModMatcher } from '../../protocol/mods-events.ts';
import type { MatcherEngine, MatcherPattern } from '../ports.ts';
import type { SkipKind } from '../types.ts';
import { fieldOf, localTest, patternOf, toList } from './match-local.ts';

export { acceptsField, isUnfiltered } from './match-local.ts';

/**
 * A matcher (events.md, "Filter which events a hook handles"): an object whose fields are compared
 * with the event's, and the hook runs only when every field matches. A field is a value, an array
 * of allowed values, or a regular expression.
 *
 * Judgments (spec/judgments.md): a regular expression is tested, unanchored, against string fields
 * only; a field the event lacks matches nothing; a field set to `undefined` is not a filter; a
 * `g` or `y` flag is ignored so a mod's expression never carries state between events. With a
 * `MatcherEngine` a regular expression is tested there, under a limit, and a test the engine
 * refuses or does not answer in time is no match plus a skipped-hook line.
 */

/** What a test of a regular expression needs: time, and the event's own abort. */
export interface MatcherRun {
  readonly clock: Clock;
  readonly signal: AbortSignal;
  /** How long the engine has for one test. */
  readonly ms: number;
}

/** A test the engine refused or did not answer: why, and under which kind the skipped hook is reported. */
export interface MatchFault {
  readonly kind: SkipKind;
  readonly reason: string;
}

export interface MatchVerdict {
  readonly matched: boolean;
  /** The first test of this matcher that failed; the hook is then skipped and the line is reported. */
  readonly fault?: MatchFault;
}

export interface CompiledMatcher {
  readonly test: (event: unknown, run: MatcherRun) => Promise<MatchVerdict>;
}

/** How long the engine has to test one pattern against one value (judgment: the docs give no limit for a matcher). */
export const MATCHER_MS = 100;

/** A test's answer: yes, no, or why it could not be told. */
type Answer = boolean | MatchFault;
type Probe = (actual: unknown, run: MatcherRun, field: string) => Answer | Promise<Answer>;

const TIMED_OUT = { timedOut: true } as const;

/** Asks the engine, giving up once `run.ms` has passed: a pattern that never answers cannot hold the chain. */
async function askEngine(
  pattern: MatcherPattern,
  value: string,
  run: MatcherRun,
  field: string,
): Promise<Answer> {
  const budget = createBudget(run.clock, run.ms);
  const stop = new AbortController();
  try {
    const answer = await Promise.race([
      Promise.resolve().then(() =>
        pattern.test(value, { ms: run.ms, signal: AbortSignal.any([run.signal, stop.signal]) }),
      ),
      budget.expired.then(() => TIMED_OUT),
    ]);
    if (answer !== TIMED_OUT) return answer === true;
    stop.abort(new Error(`the matcher for "${field}" ran over its ${run.ms} ms limit`));
    return {
      kind: 'timeout',
      reason: `the matcher for "${field}" ran over its ${run.ms} ms limit`,
    };
  } catch (thrown) {
    const why = thrown instanceof Error ? thrown.message : String(thrown);
    return {
      kind: 'throw',
      reason: `the matcher for "${field}" was refused by the engine: ${why}`,
    };
  } finally {
    budget.dispose();
  }
}

/** The test of one allowed value: in `engine` when it is a regular expression and there is one. */
function valueTest(allowed: ModMatcherValue, engine: MatcherEngine | undefined): Probe {
  const source = engine ? patternOf(allowed) : undefined;
  if (!engine || source === undefined) return localTest(allowed);
  const pattern = engine.compile(...source);
  return (actual, run, field) =>
    typeof actual === 'string' ? askEngine(pattern, actual, run, field) : false;
}

interface FieldTest {
  readonly name: string;
  readonly alternatives: readonly Probe[];
}

/**
 * Whether any allowed value of the field answers yes. A value whose test failed counts as no and the
 * others still get their say; the fault is kept only when none of them said yes (the hook runs then,
 * so no hook is skipped, which is what the line would say).
 */
async function anyAllowed(
  field: FieldTest,
  actual: unknown,
  run: MatcherRun,
): Promise<MatchVerdict> {
  let fault: MatchFault | undefined;
  for (const probe of field.alternatives) {
    const answer = await probe(actual, run, field.name);
    if (answer === true) return { matched: true };
    if (typeof answer === 'object') fault ??= answer;
  }
  return { matched: false, ...(fault ? { fault } : {}) };
}

/**
 * The matcher ready to test events, or the reason a field of it cannot be (a malformed regular
 * expression). Given an `engine`, every regular expression is compiled there.
 */
export function compileMatcher(
  matcher: ModMatcher | undefined,
  engine?: MatcherEngine,
): CompiledMatcher | { readonly problem: string } {
  const fields: FieldTest[] = [];
  for (const [name, field] of Object.entries(matcher ?? {})) {
    if (field === undefined) continue;
    try {
      fields.push({ name, alternatives: toList(field).map((value) => valueTest(value, engine)) });
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return { problem: `matcher field "${name}" is not a valid regular expression: ${why}` };
    }
  }
  return {
    async test(event, run) {
      for (const field of fields) {
        const verdict = await anyAllowed(field, fieldOf(event, field.name), run);
        if (!verdict.matched) return verdict;
      }
      return { matched: true };
    },
  };
}
