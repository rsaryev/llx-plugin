import { MODS_API } from '../../protocol/mods-api-names.ts';
import { ENGINE_ORIGIN } from '../../protocol/mods-events.ts';
import type { ModsApi } from '../types.ts';
import { type Deps } from './call.ts';
import type { CallContext, Scope } from './scope.ts';
import { isRecord } from '../../protocol/is-record.ts';

type Method = (...args: readonly unknown[]) => unknown;
const isMethod = (value: unknown): value is Method => typeof value === 'function';
type ApiOwner = Pick<Deps, 'plugin' | 'scope'>;

/** The scopes of the other loaded mods, which a lent method's calls run in the caller's context. */
export type ScopeBook = Map<string, Scope>;

export interface ModApiSettlementOptions extends ApiOwner {
  readonly scopes: ScopeBook;
  readonly canWithhold: boolean;
}

/** Runs `run` with `context` as the current one in every scope of `scopes`, until it settles. */
function inAll<T>(
  scopes: readonly Scope[],
  context: CallContext,
  run: () => Promise<T>,
): Promise<T> {
  const [first, ...rest] = scopes;
  return first ? first.within(context, () => inAll(rest, context, run)) : run();
}

/**
 * A method another mod added to this mod's `$` (reference.md, "Other mods"): "your method's `$`
 * calls run in that hook's context until every hook on that event returns". Judgment: the method
 * cannot tell whose `$` it closes over, so while it runs, every other loaded mod's calls run in the
 * caller's context (its working directory, its origin, and its re-entry), and a call that
 * starts a turn rejects. Calls that overlap from two mods can cross contexts.
 */
function lend(method: Method, deps: ApiOwner, book: ScopeBook): Method {
  return (...args) => {
    const caller = deps.scope.current();
    const context: CallContext = {
      origin: caller.origin,
      reentry: { plugin: caller.reentry.plugin },
      ...(caller.cwd === undefined ? {} : { cwd: caller.cwd }),
      lentTo: caller.reentry.plugin,
    };
    const others = [...book].filter(([plugin]) => plugin !== deps.plugin).map(([, scope]) => scope);
    return inAll(others, context, async () => method(...args));
  };
}

const lendNamespace = (value: unknown, deps: ApiOwner, book: ScopeBook): unknown =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).map(([name, member]) => [
          name,
          isMethod(member) ? lend(member, deps, book) : member,
        ]),
      )
    : value;

/**
 * The mods API a hook on `engine.create` changed: a namespace it added is kept (its methods lent),
 * one it changed replaces the built one, and one it left out comes back unless the answering mod may
 * withhold it ("A mod outside the `user` tier can also withhold one"). Judgment: an answer that is
 * not an object is no change, and which mod answered is the host's to say (`canWithhold`).
 */
export function settleModApi(
  built: ModsApi,
  answered: unknown,
  options: ModApiSettlementOptions,
): ModsApi {
  if (!isRecord(answered)) return built;
  const builtIn: ReadonlySet<string> = new Set(Object.keys(MODS_API));
  const kept = Object.entries(built).filter(([name]) => name in answered || !options.canWithhold);
  const added = Object.entries(answered)
    .filter(([name]) => !builtIn.has(name))
    .map(([name, value]) => [name, lendNamespace(value, options, options.scopes)]);
  const changed = Object.entries(answered).filter(([name]) => builtIn.has(name));
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the namespaces of the built API, with a hook's changes and additions
  return Object.freeze({
    ...Object.fromEntries(kept),
    ...Object.fromEntries(changed),
    ...Object.fromEntries(added),
  }) as ModsApi;
}

/** Fires `engine.create` for the mod being built: the event the hooks of other mods may change the API with. */
export async function fireEngineCreate(
  deps: Deps,
  built: ModsApi,
  options: { readonly book: ScopeBook; readonly canWithhold: boolean },
): Promise<ModsApi> {
  const answer = await deps.chain.dispatch(
    'engine.create',
    { plugin: deps.plugin },
    {
      origin: ENGINE_ORIGIN,
      signal: deps.signal,
      report: deps.report,
      core: () => Promise.resolve(built),
    },
  );
  return settleModApi(built, answer, {
    plugin: deps.plugin,
    scope: deps.scope,
    scopes: options.book,
    canWithhold: options.canWithhold,
  });
}
