/**
 * `dispatch('PreToolUse')` of a Bash call over P plugins of one hook each, with no hook, one hook and
 * every hook matching `Bash`: the first dispatch and the twentieth. A hook that does not match runs
 * no command and reads no file; a matching one runs once per dispatch.
 */
import type { PluginSession } from '../../../src/index.ts';
import {
  hostOver,
  hostPlugins,
  signal,
  SESSION,
  typical,
  type Bench,
  type Law,
  type Scenario,
} from './context.ts';

const SIZES = [4, 8, 16];
const REPEATS = 20;

type Matching = 'none' | 'one' | 'all';

const MATCHER_OF: Readonly<Record<Matching, (index: number) => string>> = {
  none: () => 'Write',
  one: (index) => (index === 0 ? 'Bash' : 'Write'),
  all: () => 'Bash',
};

const bash = (session: PluginSession, index: number) =>
  session.dispatch(
    'PreToolUse',
    { tool_name: 'Bash', tool_input: { command: 'git status' }, tool_use_id: `t${index}` },
    { signal: signal() },
  );

async function dispatches(size: number, bench: Bench, matching: Matching) {
  const plugins = await hostPlugins(bench, size, (name, index) =>
    typical(name, MATCHER_OF[matching](index)),
  );
  const session = hostOver(bench, plugins).openSession(SESSION);
  const first = await bench.tally.measure(() => bash(session, 0));
  for (let index = 1; index < REPEATS - 1; index++) await bash(session, index);
  const twentieth = await bench.tally.measure(() => bash(session, REPEATS - 1));
  return { first, twentieth };
}

/** A dispatch again does only the work of the hooks that match: none, one, or one per plugin. */
const REPEATED: Readonly<Record<Matching, Law>> = {
  none: 'nothing',
  one: 'constant',
  all: 'linear',
};

const scenario = (matching: Matching): Scenario => ({
  id: `dispatch.PreToolUse.${matching}`,
  size: 'P plugins',
  sizes: SIZES,
  laws: { first: 'linear', twentieth: REPEATED[matching] },
  repeats: ['twentieth'],
  run: (size, bench) => dispatches(size, bench, matching),
});

export const HOOKS: readonly Scenario[] = [scenario('none'), scenario('one'), scenario('all')];
