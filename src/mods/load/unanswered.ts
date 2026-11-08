import type { ModChain } from '../types.ts';

/**
 * A chain whose mods API calls fail when nothing answers them: the test kit's rule that a call with
 * no stub rejects with `no implementation for <name>` (plugins/mods/test.md, "Look up what a stub
 * returns"). Only a call a mod makes is changed; what Claude Code fires still ends in its own
 * behaviour.
 */
export function withUnanswered(
  chain: ModChain,
  reasonOf: (name: string) => string | undefined,
): ModChain {
  return {
    ...chain,
    register: (plugin, tier, hooks) => chain.register(plugin, tier, hooks),
    unregister: (plugin) => chain.unregister(plugin),
    dispatch: (name, input, options) => {
      const reason = options.caller === undefined ? undefined : reasonOf(name);
      return chain.dispatch(
        name,
        input,
        reason === undefined
          ? options
          : { ...options, core: () => Promise.resolve({ deny: reason }) },
      );
    },
    dispatchStream: (name, input, options) => chain.dispatchStream(name, input, options),
  };
}
