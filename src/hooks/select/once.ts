import type { HookSourceKind, RegisteredHandler } from '../contracts.ts';

/**
 * hooks.md, "Common fields": `once` is "Only honored for hooks declared in skill frontmatter;
 * ignored in settings files and agent frontmatter" (and so in a plugin's hooks file, which is
 * neither).
 */
const HONORS_ONCE: { readonly [K in HookSourceKind]: boolean } = {
  skill: true,
  settings: false,
  agent: false,
  plugin: false,
  session: false,
};

/**
 * Whether the session removes this handler after the run: `once` is set, the source honors it, and
 * the run succeeded. "A run that fails, blocks with exit code 2, or times out leaves the hook in
 * place, so it runs again on the next matching event."
 */
export const consumedByRun = (entry: RegisteredHandler, succeeded: boolean): boolean =>
  succeeded && entry.handler.once === true && HONORS_ONCE[entry.source.kind];
