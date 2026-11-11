import { ENGINE_ORIGIN } from '../../protocol/mods-events.ts';
import type { EventRuleBook, HookReport, ModChain, RegisteredHook } from '../types.ts';
import type { ModUses } from './scan/uses.ts';
import { isRecord } from '../../protocol/is-record.ts';

/**
 * `plugin.register` (plugins/mods/reference.md, "Other mods"; admin.md, "Enforce a policy with a mod
 * of your own"): fired each time a hooks module is about to load. `e.uses` lists its events, mods
 * API calls, environment variables and state as `claude plugin validate` prints them, the calls
 * without the `$.` prefix; `e.tier` is where the mod would run. A hook answers `{ refuse: reason }`
 * or `next(e)`; a refusal returned after `next` resolved still holds (events.md).
 */

const REGISTER_EVENT = 'plugin.register';

export type RegisterEvent = {
  /** The mod about to load. */
  readonly plugin: string;
  readonly tier: string;
  readonly uses: ModUses;
};

/** The reason a result refuses the mod, or `undefined` when it lets it load. */
const refusalOf = (result: unknown): string | undefined =>
  isRecord(result) && typeof result.refuse === 'string' ? result.refuse : undefined;

/**
 * The rule of `plugin.register`: `{ refuse: reason }` with a string reason, or the result of
 * `next(e)` (judgment: the docs name no other answer, so another shape fails the hook like a throw).
 */
export const REGISTER_RULES: EventRuleBook = {
  [REGISTER_EVENT]: {
    shapeProblem(result) {
      if (!isRecord(result))
        return `${REGISTER_EVENT} result: expected { refuse: reason } or next(e)`;
      return result.refuse === undefined || typeof result.refuse === 'string'
        ? undefined
        : `${REGISTER_EVENT} result: refuse must be a string`;
    },
  },
};

/** Who answered each refusal: the hook that returned a reason first (an inner hook finishes before the hooks around it) is the refuser. */
export interface RefusalBook {
  readonly refusers: Map<string, string>;
}

/** `hook` that notes, in `book`, the mod whose hook returned a refusal first. */
export function tagRefusals(
  hook: RegisteredHook,
  plugin: string,
  book: RefusalBook,
): RegisteredHook {
  if (hook.event !== REGISTER_EVENT) return hook;
  const note = (result: unknown): unknown => {
    const reason = refusalOf(result);
    if (reason !== undefined && !book.refusers.has(reason)) book.refusers.set(reason, plugin);
    return result;
  };
  const { catchRun } = hook;
  return {
    ...hook,
    run: (api, e, next) => Promise.resolve(hook.run(api, e, next)).then(note),
    ...(catchRun === undefined
      ? {}
      : { catchRun: (api, e, next) => Promise.resolve(catchRun(api, e, next)).then(note) }),
  };
}

export interface Refusal {
  readonly by: string;
  readonly reason: string;
}

/** Asks the mods loaded so far whether `event.plugin` may load. */
export async function askToLoad(
  input: {
    readonly chain: ModChain;
    readonly book: RefusalBook;
    readonly signal: AbortSignal;
    readonly report: (report: HookReport) => void;
    readonly debug: (line: string) => void;
  },
  event: RegisterEvent,
): Promise<Refusal | undefined> {
  input.book.refusers.clear();
  const result = await input.chain.dispatch(REGISTER_EVENT, event, {
    origin: ENGINE_ORIGIN,
    signal: input.signal,
    core: () => Promise.resolve({}),
    report: input.report,
    debug: input.debug,
  });
  const reason = refusalOf(result);
  return reason === undefined
    ? undefined
    : { by: input.book.refusers.get(reason) ?? 'a mod', reason };
}
