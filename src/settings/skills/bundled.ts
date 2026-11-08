import type { PolicyView } from '../view.ts';

/** What turned the bundled skills off. */
export type BundledOffBy = 'setting' | 'env';

export interface BundledSkillsDecision {
  /** Bundled skills and workflows are removed entirely. */
  readonly disabled: boolean;
  /** Both when both are on: whichever turns them off, the other cannot turn them back on. */
  readonly decidedBy: readonly BundledOffBy[];
  /** Built-in commands such as `/init` stay typable but are hidden from the model when disabled. */
  readonly builtInCommandsListedToModel: boolean;
  /**
   * Built-in commands, `/doctor` included, stay typable whatever this decides: the setting hides
   * them from the model only. Hiding `/doctor` takes `DISABLE_DOCTOR_COMMAND`, which is not this key.
   */
  readonly builtInCommandsTypable: true;
}

/** The variable's documented value (env-vars.md: "Set to `1`"). */
const ENV_ON = '1';

/** `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`, the name of the variable the host's environment carries. */
export const BUNDLED_SKILLS_ENV = 'CLAUDE_CODE_DISABLE_BUNDLED_SKILLS';

/**
 * `disableBundledSkills` and `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` (settings-reference.md,
 * `disableBundledSkills`: "whichever of the two turns them off, the other can't turn them back
 * on"). The setting is the one the files combine to; `env` is the host's environment as data.
 */
export function bundledSkills(
  view: PolicyView,
  env: Readonly<Record<string, string | undefined>>,
): BundledSkillsDecision {
  const decidedBy: BundledOffBy[] = [];
  if (view.get('disableBundledSkills') === true) decidedBy.push('setting');
  if (env[BUNDLED_SKILLS_ENV] === ENV_ON) decidedBy.push('env');
  const disabled = decidedBy.length > 0;
  return {
    disabled,
    decidedBy,
    builtInCommandsListedToModel: !disabled,
    builtInCommandsTypable: true,
  };
}
