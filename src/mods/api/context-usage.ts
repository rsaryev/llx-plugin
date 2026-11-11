import type { JsonObject } from '../../foundation/index.ts';

/**
 * The `context` of `$.session.usage()` and of a `session.measure` event: `{ tokens, window, percent }`
 * (plugins/mods/reference.md, "Mods API methods": "`context` has `tokens`, `window`, and `percent`").
 * `tokens` and `percent` are left out while the host has not measured the window. Judgment: the docs
 * name the three fields and not how `percent` is rounded, so it is the whole percent nearest to
 * `tokens / window` (spec/judgments.md).
 */
export function contextUsage(context: {
  readonly tokens?: number | undefined;
  readonly window: number;
}): JsonObject {
  const { tokens, window } = context;
  return {
    window,
    ...(tokens === undefined ? {} : { tokens }),
    ...(tokens === undefined || window <= 0
      ? {}
      : { percent: Math.round((tokens / window) * 100) }),
  };
}
