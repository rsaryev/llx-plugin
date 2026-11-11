import type { RegisteredHook } from '../types.ts';

/** The hook a mods API call comes from: what the chain's async slot holds while that hook runs. */
export interface HookFrame {
  readonly plugin: string;
  readonly hook: RegisteredHook;
}

/**
 * The hooks of each mod that are running now: their own code, or waiting on their `next` or a `$`
 * call. A mod's call skips "the calling hook alone" (claude-code/index.d.ts:7298, :5014). With the
 * host's `AsyncContext` the chain knows the calling hook (`HookFrame`) and this is not asked; without
 * one it cannot tell which of a mod's running hooks made a call, so it skips every one running (never
 * the wrong way: the calling hook never sees its own call). A call while none runs is the mod's code
 * outside its hooks, and skips them all (reference.md, "The hook function", `next.error`).
 */
export interface Frames {
  /** Marks `hook` of `plugin` as running until the returned function is called. */
  enter(plugin: string, hook: RegisteredHook): () => void;
  /** Whether a call by `plugin` skips its `hook`. */
  skips(plugin: string, hook: RegisteredHook): boolean;
}

export function createFrames(): Frames {
  const running = new Map<string, Map<RegisteredHook, number>>();
  const of = (plugin: string): Map<RegisteredHook, number> => {
    const known = running.get(plugin) ?? new Map<RegisteredHook, number>();
    running.set(plugin, known);
    return known;
  };
  return {
    enter(plugin, hook) {
      const hooks = of(plugin);
      hooks.set(hook, (hooks.get(hook) ?? 0) + 1);
      let left = false;
      return () => {
        if (left) return;
        left = true;
        const count = (hooks.get(hook) ?? 1) - 1;
        if (count > 0) hooks.set(hook, count);
        else hooks.delete(hook);
        if (hooks.size === 0) running.delete(plugin);
      };
    },
    skips(plugin, hook) {
      const hooks = running.get(plugin);
      return hooks === undefined || hooks.has(hook);
    },
  };
}
