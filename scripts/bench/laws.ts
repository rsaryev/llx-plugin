/**
 * The growth laws of the meter (docs/TESTING.md, "Benchmarks"): what each measurement's counts must
 * do as its scenario's size doubles. Read off the counts alone, so the test and `bun run bench:update`
 * apply the same check. Under every law a measurement reads no file twice and lists no directory twice
 * (`files.reread`, `files.relist`): what one call needs of a file it reads once. A measurement that
 * repeats an earlier call (`Scenario.repeats`) builds no regular expression (`cpu.RegExp`): what the
 * first call compiled is kept.
 */
import type { AllCounts } from './measure.ts';
import type { Counts } from './meter/tally.ts';
import { SCENARIOS, type Law } from './scenarios/index.ts';

/** Counters of a call that leaves the process: a session that claims to read nothing makes none. */
const IO = /^(files|folders|commands|http|models)\./;
const AGAIN = new Set(['files.reread', 'files.relist']);

const valueOf = (counts: Counts | undefined, name: string): number => counts?.[name] ?? 0;

/** `[N, 2N, 4N]` values of one counter: affine (the two steps agree), or flat. */
type Check = (values: readonly number[], name: string) => string | undefined;

const CHECKS: Readonly<Record<Law, Check>> = {
  constant: (values) =>
    values.every((value) => value === values[0]) ? undefined : `not constant: ${values.join(', ')}`,
  linear: (values) => {
    const steps = values.slice(1).map((value, index) => value - (values[index] ?? 0));
    const [first = 0, ...rest] = steps;
    // Equal steps per doubling are affine in N: each doubling adds as much as the size added.
    const ok = rest.every((step, index) => step === first * 2 ** (index + 1));
    return ok ? undefined : `not linear: ${values.join(', ')}`;
  },
  'no-io': (values, name) =>
    IO.test(name) && values.some((value) => value !== 0)
      ? `does I/O: ${values.join(', ')}`
      : CHECKS.constant(values, name),
  nothing: (values) =>
    values.some((value) => value !== 0) ? `counts: ${values.join(', ')}` : undefined,
};

const checkOf =
  (law: Law, repeat: boolean): Check =>
  (values, name) => {
    const counted = values.some((value) => value !== 0);
    if (AGAIN.has(name) && counted) return `the same path again: ${values.join(', ')}`;
    if (repeat && name === 'cpu.RegExp' && counted) return `compiled again: ${values.join(', ')}`;
    return CHECKS[law](values, name);
  };

/** Every broken law, as `<scenario> <measurement> <counter>: <why>`. */
export function brokenLaws(all: AllCounts): string[] {
  return SCENARIOS.flatMap((scenario) => {
    const sizes = scenario.sizes.map(String);
    const bySize = sizes.map((size) => all[scenario.id]?.counts[size]);
    return Object.entries(scenario.laws).flatMap(([measurement, law]) => {
      const names = new Set(bySize.flatMap((counts) => Object.keys(counts?.[measurement] ?? {})));
      return [...names].toSorted().flatMap((name) => {
        const values = bySize.map((counts) => valueOf(counts?.[measurement], name));
        const repeat = scenario.repeats?.includes(measurement) === true;
        const why = checkOf(law, repeat)(values, name);
        return why === undefined ? [] : [`${scenario.id} ${measurement} ${name}: ${why}`];
      });
    });
  });
}
