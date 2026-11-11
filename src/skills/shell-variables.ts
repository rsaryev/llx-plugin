import { type SubstitutionSurface } from '../loading/resolve/index.ts';
import type { SkillShell } from '../format/skill-types.ts';
import { substitutePass, type SkillVariables } from './variables.ts';
import { shellExports } from '../loading/resolve/shell-exports.ts';
import { surfacePolicy } from '../loading/resolve/surfaces.ts';

/**
 * The text the shell receives for a skill's `!` command (skills.md, "Available string
 * substitutions"; "How injected commands run"). The permission check reads the same command as
 * skill content, its paths written in (`substituteVariables`).
 */

/** What the shell receives for one `!` command. */
export interface ShellCommandText {
  readonly text: string;
  /** The values of the references `text` holds, for the command's environment. */
  readonly environment: Readonly<Record<string, string>>;
}

/** The surface whose policy each shell's text is substituted under. */
const SHELL_SURFACE: { readonly [S in SkillShell]: SubstitutionSurface } = {
  bash: 'skill-bash',
  powershell: 'skill-powershell',
};

/**
 * `${CLAUDE_*}` in a `!` command as its shell receives it: under the scope's `shellPaths`, each path
 * a reference the shell expands from the environment returned with it (judgment, spec/judgments.md,
 * `shellPaths`), or written in when the host asks for `pasted`.
 */
export async function substituteShellCommand(
  text: string,
  vars: SkillVariables,
  shell: SkillShell,
): Promise<ShellCommandText> {
  const policy = surfacePolicy(SHELL_SURFACE[shell], vars.scope);
  const done = await substitutePass(text, vars, policy, '');
  return {
    text: done.text,
    environment: await shellExports(done.referenced, vars.scope, done.variable),
  };
}
