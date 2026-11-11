import type { PolicyView } from '../view.ts';

/** Where a skill or custom command comes from, for the one question inline shell asks. */
export const SHELL_ORIGINS = ['user', 'project', 'plugin', 'addDir', 'bundled', 'managed'] as const;
export type ShellOrigin = (typeof SHELL_ORIGINS)[number];

/** The text that takes the place of an inline command (settings-reference.md, `disableSkillShellExecution`). */
export const SHELL_DISABLED_MARKER = '[shell command execution disabled by policy]';

export type ShellVerdict =
  | { readonly run: true }
  | { readonly run: false; readonly replacement: typeof SHELL_DISABLED_MARKER };

/**
 * Whether the setting reaches an origin: "skills and custom commands from user, project, plugin, or
 * additional-directory sources"; "Bundled skills and skills deployed through managed settings are
 * unaffected". A registry typed over the union.
 */
const REACHED: { readonly [O in ShellOrigin]: boolean } = {
  user: true,
  project: true,
  plugin: true,
  addDir: true,
  bundled: false,
  managed: false,
};

/**
 * `disableSkillShellExecution` after precedence: a `true` in managed settings "can't be overridden by
 * `false` elsewhere"; otherwise the highest file that sets it decides. Unset means inline shell runs.
 */
function shellDisabled(view: PolicyView): boolean {
  const holders = view.eachFromHighest('disableSkillShellExecution');
  if (holders.some((holder) => holder.scope === 'managed' && holder.value)) return true;
  return holders[0]?.value === true;
}

/**
 * What the skills expansion does with the `` !`cmd` `` and ` ```! ` blocks of a skill from `origin`.
 * Replacing the blocks themselves is the skills expansion's; this is its verdict.
 */
export function shellVerdict(view: PolicyView, origin: ShellOrigin): ShellVerdict {
  if (REACHED[origin] && shellDisabled(view)) {
    return { run: false, replacement: SHELL_DISABLED_MARKER };
  }
  return { run: true };
}
