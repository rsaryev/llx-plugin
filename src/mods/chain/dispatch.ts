import type { Clock } from '../../ports/index.ts';
import { createBudget, deepFreeze, frozenCopy } from '../../foundation/index.ts';
import type { AnyModEventName, StreamEventName } from '../../protocol/mods-events.ts';
import type { AsyncContextFactory, MatcherEngine } from '../ports.ts';
import { asyncSlot } from '../async-slot.ts';
import { MATCHER_MS } from './matcher.ts';
import type {
  ChunkOf,
  DispatchOptions,
  EventOf,
  EventRuleBook,
  HookAccess,
  ModChain,
  ResultOf,
} from '../types.ts';
import { GROUP_MS, type Context } from './context.ts';
import type { Stream } from './downstream.ts';
import { runFrom } from './invoke.ts';
import { isAmong } from './only.ts';
import { createFrames, type HookFrame } from './frames.ts';
import { createRegistry } from './registry.ts';
import { ruleOf, ruleRegistry } from './rules.ts';
import { stepsFor, traceOf } from './trace.ts';

export interface ModChainOptions {
  readonly clock: Clock;
  /**
   * What the parts of mods say about the events they own (`EVENT_RULES`, `API_RULES`, `uiRules()`,
   * `REGISTER_RULES`), one book each; an event no book names passes its values through.
   */
  readonly rules?: readonly EventRuleBook[];
  /**
   * Where the regular expressions of matchers run. Without one they run in this thread with the
   * engine's own `RegExp`, which a pattern such as `/^(a+)+$/` can hold for ever.
   */
  readonly matcherEngine?: MatcherEngine;
  /** How long the engine has to test one pattern against one value, in milliseconds (default `MATCHER_MS`). */
  readonly matcherMs?: number;
  readonly admit?: (access: HookAccess) => boolean;
  /**
   * The host's async context (`() => new AsyncLocalStorage()`): with it a mod's call skips exactly
   * the hook that made it (claude-code/index.d.ts:7298); without it, every hook of the mod running.
   */
  readonly asyncContext?: AsyncContextFactory;
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
  const registry = createRegistry(options.matcherEngine);
  const rules = ruleRegistry(...(options.rules ?? []));
  // What the host adds to every dispatch: its admission check.
  const frames = createFrames();
  const running = asyncSlot<HookFrame>(options.asyncContext);
  const hostParts = {
    frames,
    running,
    ...(options.admit === undefined ? {} : { admit: options.admit }),
  };

  async function* stream(name: string, input: unknown, opts: DispatchOptions): Stream {
    const groupMs = opts.groupMs ?? GROUP_MS[name];
    // The host keeps its own object: hooks see a frozen copy.
    const frozen = frozenCopy(input);
    const ctx: Context = {
      name,
      options: {
        ...opts,
        origin: deepFreeze({ ...opts.origin }),
        ...(opts.caller === undefined ? {} : { caller: deepFreeze({ ...opts.caller }) }),
      },
      clock: options.clock,
      chain: registry
        .chainFor(name, opts.caller)
        .filter((entry) => isAmong(opts.only, entry.plugin.name)),
      input: frozen,
      fired: input,
      rule: ruleOf(rules, name),
      matcherMs: options.matcherMs ?? MATCHER_MS,
      ...hostParts,
      calling: { frames, followed: running !== undefined, frame: running?.current() },
      ...stepsFor(opts),
      ...(groupMs === undefined
        ? {}
        : {
            group: { budget: createBudget(options.clock, groupMs, { paused: true }), event: name },
          }),
    };
    try {
      // The managed settings hooks run first; when one answers, no mod's hook runs.
      const first = opts.before === undefined ? undefined : await opts.before(frozen);
      if (first !== undefined) return first;
      return yield* runFrom(ctx, 0, frozen);
    } finally {
      ctx.group?.budget.dispose();
      opts.trace?.(traceOf(ctx));
    }
  }

  return {
    register: (plugin, tier, hooks) => registry.register(plugin, tier, hooks),
    unregister: (plugin) => registry.unregister(plugin),
    hears: (event, only) => registry.hears(event, only),
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
