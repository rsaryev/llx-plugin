import type { HookSession, HookSource, HookSourceKind, RegisteredHandler } from '../contracts.ts';

/**
 * What keeps a registered handler from running whatever the event says: `disableAllHooks`, workspace
 * trust and a plugin that is not enabled. Each is the docs' rule, applied to the handler's source.
 */

/**
 * hooks.md, "Disable or remove hooks": `disableAllHooks` left after precedence turns off every hook
 * but the managed ones ("`disableAllHooks` set in user, project, or local settings can't disable
 * those managed hooks. Only `disableAllHooks` set at the managed settings level can").
 */
function hooksEnabled(source: HookSource, session: HookSession): boolean {
  if (session.disableAllHooks.managedLocked) return false;
  return source.managed === true || !session.disableAllHooks.effective;
}

/** A settings-file hook waits for workspace trust; so does a project skill's, by the same rule. */
const settingsTrust = (_source: HookSource, session: HookSession): boolean => session.trusted;
const projectOnly =
  (rule: (session: HookSession) => boolean) =>
  (source: HookSource, session: HookSession): boolean =>
    source.scope !== 'project' || rule(session);
const open = (): boolean => true;

/**
 * Per source kind (hooks.md, "Workspace trust" and "Hooks in skills and agents"):
 * - settings: "Claude Code holds back hooks from every settings file ... until you accept the
 *   workspace trust dialog"; a `-p` or SDK session counts as trusted (`session.trusted`);
 * - a project skill's frontmatter hooks "follow the same workspace trust rule";
 * - a project subagent's frontmatter hooks need the dialog for the folder itself, and "a `-p`
 *   session doesn't count as trusted"; user-level agents are exempt;
 * - a plugin's hooks run "when plugin is enabled".
 */
const SOURCE_GATES: {
  readonly [K in HookSourceKind]: (source: HookSource, session: HookSession) => boolean;
} = {
  settings: settingsTrust,
  skill: projectOnly((session) => session.trusted),
  agent: projectOnly((session) => session.folderTrustAccepted === true),
  plugin: (source, session) =>
    session.enabledPlugins === undefined ||
    (source.pluginName !== undefined && session.enabledPlugins.has(source.pluginName)),
  session: open,
};

/** Whether the handler may run in this session at all. */
export const passesGates = (entry: RegisteredHandler, session: HookSession): boolean =>
  hooksEnabled(entry.source, session) && SOURCE_GATES[entry.source.kind](entry.source, session);
