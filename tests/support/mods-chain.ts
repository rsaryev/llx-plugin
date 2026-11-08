import { MODS_API } from '../../src/protocol/mods-api-names.ts';
import { ENGINE_ORIGIN, type HookOrigin, type ModMatcher } from '../../src/protocol/mods-events.ts';
import { createModChain } from '../../src/mods/chain/index.ts';
import type { PluginIssue } from '../../src/format/index.ts';
import type {
  DispatchOptions,
  HookReport,
  ModCatchNext,
  ModChain,
  ModNext,
  ModsApi,
  ReentryInfo,
  RegisterTier,
  RegisteredHook,
} from '../../src/mods/types.ts';
import { fixedClock } from './clock.ts';

/** An event in a test: plain data with whatever fields the test needs. */
export type Ev = Record<string, unknown>;
type Out = Promise<unknown> | AsyncGenerator<unknown, unknown>;
type Method = (...args: unknown[]) => unknown;

const isObject = (value: unknown): value is Ev => typeof value === 'object' && value !== null;

/** `value` as an object, or a failing test: the test says what it expects and the type follows. The same object, not a copy. */
export function record(value: unknown): Ev {
  if (!isObject(value)) throw new Error(`not an object: ${String(value)}`);
  return value;
}

/** A fresh promise with its resolver: a test holds a call open until it releases it. */
export const deferred = (): PromiseWithResolvers<void> => Promise.withResolvers<void>();

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** A value that nests exactly `count` arrays deep. */
export function levels(count: number): unknown {
  let value: unknown = 'leaf';
  for (let level = 0; level < count; level += 1) value = [value];
  return value;
}

const failing =
  (namespace: string, method: string): Method =>
  () =>
    Promise.reject(new Error(`no implementation for ${namespace}.${method}`));

/** A `$` whose every method fails until a test gives it one: `overrides` maps `ns.method` to an implementation. */
function fakeApi(name: string, overrides: Readonly<Record<string, Method>> = {}): ModsApi {
  const namespaces = Object.entries(MODS_API).map(([namespace, methods]) => {
    const members = methods.map((method): [string, unknown] => [
      method,
      overrides[`${namespace}.${method}`] ?? failing(namespace, method),
    ]);
    const own: [string, unknown][] =
      namespace === 'plugin'
        ? [
            ['name', name],
            ['root', `/plugins/${name}`],
          ]
        : [];
    return [namespace, Object.fromEntries([...members, ...own])] as const;
  });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fake builds every namespace of the table, which is what `ModsApi` is
  return Object.freeze(Object.fromEntries(namespaces)) as unknown as ModsApi;
}

export type FnHook = ($: ModsApi, e: Ev, next: ModNext<Ev, Promise<unknown>>) => unknown;
export type CatchHook = ($: ModsApi, e: Ev, next: ModCatchNext<Ev, Promise<unknown>>) => unknown;
export type GenHook = (
  $: ModsApi,
  e: Ev,
  next: ModNext<Ev, AsyncGenerator<unknown, unknown>>,
) => unknown;

export type GenCatchHook = (
  $: ModsApi,
  e: Ev,
  next: ModCatchNext<Ev, AsyncGenerator<unknown, unknown>>,
) => unknown;

export interface HookOptions {
  readonly matcher?: ModMatcher;
  readonly handler?: CatchHook;
}

/** A hook that is an async function. */
export const fn = (event: string, run: FnHook, options: HookOptions = {}): RegisteredHook => ({
  event,
  isGenerator: false,
  ...(options.matcher ? { matcher: options.matcher } : {}),
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a function hook's `next` gives promises; the chain hands it exactly that
  run: (api, e, next) => run(api, record(e), next as ModNext<Ev, Promise<unknown>>),
  ...(options.handler
    ? {
        catchRun: (api, e, next) =>
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the same, for a handler
          options.handler?.(api, record(e), next as ModCatchNext<Ev, Promise<unknown>>),
      }
    : {}),
});

/** A hook that is an async generator, as a hook on `turn.step` is. */
export const gen = (
  event: string,
  run: GenHook,
  options: { readonly matcher?: ModMatcher; readonly handler?: GenCatchHook } = {},
): RegisteredHook => ({
  event,
  isGenerator: true,
  ...(options.matcher ? { matcher: options.matcher } : {}),
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a generator hook's `next` gives streams; the chain hands it exactly that
  run: (api, e, next) => run(api, record(e), next as ModNext<Ev, AsyncGenerator<unknown, unknown>>),
  ...(options.handler
    ? {
        catchRun: (api, e, next) =>
          options.handler?.(
            api,
            record(e),
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the same, for a generator hook's handler
            next as ModCatchNext<Ev, AsyncGenerator<unknown, unknown>>,
          ),
      }
    : {}),
});

export interface FireOptions {
  readonly core?: (e: unknown) => Out;
  readonly origin?: HookOrigin;
  readonly signal?: AbortSignal;
  readonly reentry?: ReentryInfo;
  readonly groupMs?: number;
}

type Raw = {
  dispatch(name: string, input: Ev, options: DispatchOptions): Promise<unknown>;
  dispatchStream(
    name: string,
    input: Ev,
    options: DispatchOptions,
  ): AsyncGenerator<unknown, unknown>;
};

/** A chain on a clock that stands still, with the reports it was given and the events Claude Code's own behaviour saw. */
export function harness(shapeProblem?: (event: string, result: unknown) => string | undefined) {
  const clock = fixedClock();
  const chain: ModChain = createModChain({ clock, ...(shapeProblem ? { shapeProblem } : {}) });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a test fires events by name, without the typed event tables
  const raw = chain as unknown as Raw;
  const reports: HookReport[] = [];
  const coreSeen: unknown[] = [];
  const mod = (
    name: string,
    tier: RegisterTier,
    hooks: readonly RegisteredHook[],
    api: Readonly<Record<string, Method>> = {},
  ): readonly PluginIssue[] => chain.register({ name, api: fakeApi(name, api) }, tier, hooks);
  const options = (given: FireOptions): DispatchOptions => ({
    origin: given.origin ?? ENGINE_ORIGIN,
    signal: given.signal ?? new AbortController().signal,
    core:
      given.core ??
      ((e) => {
        coreSeen.push(e);
        return Promise.resolve({ core: e });
      }),
    report: (report) => reports.push(report),
    ...(given.reentry ? { reentry: given.reentry } : {}),
    ...(given.groupMs === undefined ? {} : { groupMs: given.groupMs }),
  });
  const fire = (name: string, input: Ev = {}, given: FireOptions = {}): Promise<unknown> =>
    raw.dispatch(name, input, options(given));
  const fireStream = (name: string, input: Ev = {}, given: FireOptions = {}) =>
    raw.dispatchStream(name, input, options(given));
  return { clock, chain, reports, coreSeen, mod, fire, fireStream };
}

/** Lets every promise that can settle settle; time does not move. */
export async function flush(): Promise<void> {
  for (let turn = 0; turn < 50; turn += 1) await Promise.resolve();
}

/** The chunks and result of a stream. */
export async function consume(
  stream: AsyncGenerator<unknown, unknown>,
): Promise<{ readonly chunks: unknown[]; readonly result: unknown }> {
  const chunks: unknown[] = [];
  for (let step = await stream.next(); ; step = await stream.next()) {
    if (step.done) return { chunks, result: step.value };
    chunks.push(step.value);
  }
}
