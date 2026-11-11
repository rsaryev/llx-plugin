import {
  fileChangedWatchList,
  hasRunnableHandler,
  mergeWatchPaths,
  runnableHandlers,
  type HookOutcome,
  type HookSession,
  type HookSource,
  type HookSourceKind,
  type RegisteredHandler,
  type SettledDeliveries,
} from '../hooks/index.ts';
import type { HooksSettings } from '../protocol/hook-config.ts';
import type { HookEvent } from '../protocol/official.ts';
import type { BackgroundListener } from './background-queue.ts';
import { currentOf, type SessionCore } from './session-core.ts';
import { dropRegistration, dropSpent, registerEntries } from './session-registry.ts';
import { registerHooks } from '../hooks/register.ts';

/** Removes one registration; it does nothing once the prefix was registered again or removed. */
export interface HookHandle {
  remove(): void;
}

/** How long hooks added with `addHooks` live: the session, or until the `runScoped` turn ends. */
export type HookLifetime = 'session' | 'turn';

/** Where scoped hooks come from: an agent's frontmatter, a skill, or the host's own run. */
export type ScopedHookSource = Omit<HookSource, 'kind'> & {
  readonly kind: Extract<HookSourceKind, 'agent' | 'session' | 'skill'>;
};

export interface AddHooksOptions {
  /** Default `session`. `turn` needs the view `runScoped` gives, which drops the hooks when it ends. */
  readonly lifetime?: HookLifetime;
  /** The full `name@marketplace` id of the plugin a skill or agent hook belongs to. */
  readonly pluginId?: string;
}

/** The turn-lifetime registrations of one `runScoped`, dropped together when it ends. */
export interface TurnScope {
  readonly handles: HookHandle[];
  /** True once `end` ran: a view kept past the callback registers nothing more with it. */
  readonly ended: boolean;
  end(): void;
}

export function createTurnScope(): TurnScope {
  const handles: HookHandle[] = [];
  let ended = false;
  return {
    handles,
    get ended() {
      return ended;
    },
    end() {
      ended = true;
      handles.splice(0).forEach((handle) => handle.remove());
    },
  };
}

/**
 * What a dispatch leaves in the core: `watchPaths` of a SessionStart, CwdChanged or FileChanged
 * output replaces the dynamic watch list (no other event's output carries the field), the `once`
 * registrations its runs spent go (a background run's when its process ends), and the background
 * promises join the queue `takeBackground` reads.
 */
export function recordOutcome(core: SessionCore, outcome: HookOutcome<HookEvent>): void {
  core.watchPaths.set(mergeWatchPaths(core.watchPaths.get(), outcome.effects.watchPaths));
  dropSpent(core);
  core.background.add(
    outcome.background.map((delivery) =>
      delivery.finally(() => {
        dropSpent(core);
      }),
    ),
  );
}

/** What a lifetime does with the turn scope of the view: `turn` needs one to end it. */
const ATTACH: {
  readonly [L in HookLifetime]: (scope: TurnScope | undefined) => (handle: HookHandle) => void;
} = {
  session: () => () => undefined,
  turn: (scope) => {
    if (scope === undefined) {
      throw new Error('addHooks with lifetime "turn" needs the view of session.runScoped');
    }
    if (scope.ended) {
      throw new Error('addHooks with lifetime "turn" on a view whose session.runScoped has ended');
    }
    return (handle) => {
      scope.handles.push(handle);
    };
  },
};

export interface HookScope {
  /**
   * Adds the hooks of a run, an agent or a skill under `prefix` (the ids of its entries begin with
   * it; two registrations of one session never share one). Registering a prefix again replaces what
   * it registered. The hooks pass the same gates as any: the source decides them.
   */
  addHooks(
    prefix: string,
    hooks: HooksSettings,
    source: ScopedHookSource,
    options?: AddHooksOptions,
  ): HookHandle;
  /** Removes what `prefix` registered; an unknown prefix does nothing. */
  removeHooks(prefix: string): void;
  /** Whether a handler that passes this turn's gates would run for the event (matchers are not read). */
  hasHooks(event: HookEvent): boolean;
  /**
   * The handlers that would run in this turn, in registry order (plugins, settings files, then what
   * was added): each with its event, matcher, official handler object, id and `source` (kind, label,
   * scope, plugin name), for a read-only `/hooks` view (hooks.md, "The `/hooks` menu"). A handler the
   * gates silence (`disableAllHooks`, trust, a disabled plugin, a managed lock) or of a type its
   * event does not support is not listed; a `once` handler that was consumed is gone.
   */
  hookEntries(): readonly RegisteredHandler[];
  /** The literal names of the FileChanged matchers, then the dynamic `watchPaths`, each once. */
  fileChangedWatchList(): readonly string[];
  /** The background deliveries that settled since the last call (docs/API.md, "Background hooks"). */
  takeBackground(): SettledDeliveries;
  /**
   * Calls `listener` with what each background hook delivers as it settles (its `wake`, when it woke
   * Claude) and the session and run it came from, so an idle host learns of a wake without polling. It does not take the delivery:
   * `takeBackground` still returns it. Returns the function that stops the listening.
   */
  onBackground(listener: BackgroundListener): () => void;
}

/**
 * The scoped-hook part of one turn's view over the session's core. `session` is read at each use,
 * so the gates it carries are the current settings'.
 */
export function createHookScope(
  core: SessionCore,
  session: () => HookSession,
  scope: TurnScope | undefined,
): HookScope {
  return {
    addHooks(prefix, hooks, source, options = {}) {
      const seen = currentOf(core);
      const attach = ATTACH[options.lifetime ?? 'session'](scope);
      const entries = registerHooks(hooks, {
        idPrefix: prefix,
        source,
        ...(options.pluginId === undefined ? {} : { pluginId: options.pluginId }),
      });
      const handle = registerEntries(core, seen, prefix, entries);
      attach(handle);
      return handle;
    },
    removeHooks: (prefix) => {
      currentOf(core);
      dropRegistration(core, prefix);
    },
    hasHooks: (event) => {
      const now = session();
      return hasRunnableHandler(core.registry.get().entries, now, event);
    },
    hookEntries: () => runnableHandlers(core.registry.get().entries, session()),
    fileChangedWatchList: () => {
      const now = session();
      return [
        ...new Set([
          ...fileChangedWatchList(core.registry.get().entries, now),
          ...core.watchPaths.get(),
        ]),
      ];
    },
    takeBackground: () => core.background.take(),
    onBackground: (listener) =>
      core.background.listen((delivered, delivery) =>
        listener(delivered, {
          sessionId: session().sessionId,
          handlerId: delivery.handlerId,
          outcome: delivery.outcome,
          ...(delivery.exitCode === undefined ? {} : { exitCode: delivery.exitCode }),
        }),
      ),
  };
}
