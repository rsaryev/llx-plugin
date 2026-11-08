import type { Clock } from '../../ports/index.ts';
import { createBudget } from '../../foundation/index.ts';
import type { AnyModEventName, StreamEventName } from '../../protocol/mods-events.ts';
import type { ChunkOf, DispatchOptions, EventOf, ModChain, ResultOf } from '../types.ts';
import { GROUP_MS, type Context } from './context.ts';
import type { Stream } from './downstream.ts';
import { runFrom } from './invoke.ts';
import { createRegistry } from './registry.ts';
import { deepFreeze } from '../../foundation/index.ts';

export interface ModChainOptions {
  readonly clock: Clock;
  /** The wrong shape a hook's result has for an event, from the events part of mods; none until it lands. */
  readonly shapeProblem?: (event: string, result: unknown) => string | undefined;
}

/* oxlint-disable typescript/no-unsafe-type-assertion -- the chain carries `unknown`; the events part of mods fixes what each event answers */
const resultOf = <N extends AnyModEventName>(value: unknown): ResultOf<N> => value as ResultOf<N>;
const chunksOf = <N extends StreamEventName>(
  stream: Stream,
): AsyncGenerator<ChunkOf<N>, ResultOf<N>> => stream as AsyncGenerator<ChunkOf<N>, ResultOf<N>>;
/* oxlint-enable typescript/no-unsafe-type-assertion */

async function collect(stream: Stream): Promise<unknown> {
  for (let step = await stream.next(); ; step = await stream.next()) {
    if (step.done) return step.value;
  }
}

/** The chains of hooks, one per event, and what runs them (events.md, "How a hook handles an event"). */
export function createModChain(options: ModChainOptions): ModChain {
  const registry = createRegistry();
  const shapeProblem = options.shapeProblem ?? (() => undefined);

  async function* stream(name: string, input: unknown, opts: DispatchOptions): Stream {
    const groupMs = opts.groupMs ?? GROUP_MS[name];
    const ctx: Context = {
      name,
      options: opts,
      clock: options.clock,
      chain: registry.chainFor(name),
      shapeProblem,
      ...(groupMs === undefined
        ? {}
        : {
            group: { budget: createBudget(options.clock, groupMs, { paused: true }), event: name },
          }),
    };
    try {
      return yield* runFrom(ctx, 0, deepFreeze(input));
    } finally {
      ctx.group?.budget.dispose();
    }
  }

  return {
    register: (plugin, tier, hooks) => registry.register(plugin, tier, hooks),
    unregister: (plugin) => registry.unregister(plugin),
    dispatch: async <N extends AnyModEventName>(
      name: N,
      input: EventOf<N>,
      opts: DispatchOptions,
    ) => resultOf<N>(await collect(stream(name, input, opts))),
    dispatchStream: <N extends StreamEventName>(
      name: N,
      input: EventOf<N>,
      opts: DispatchOptions,
    ) => chunksOf<N>(stream(name, input, opts)),
  };
}
