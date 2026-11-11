import { applyParentRules, type ParentSettingsContext } from '../managed/parent.ts';
import type { SyncDecision } from '../plugins/sync-plugins.ts';
import type { PolicyView } from '../view.ts';
import { bundledSkills, type BundledSkillsDecision } from './bundled.ts';
import { skillVisibility, type SkillSubject, type SkillVisibility } from './overrides.ts';
import { shellVerdict, type ShellOrigin, type ShellVerdict } from './shell.ts';
import { syncSkillsDecision } from './sync-skills.ts';

/** What the host tells the skill policy besides the layers. */
export interface SkillPolicyContext extends ParentSettingsContext {
  /** The host's environment as data (`CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`); the kit reads no `process.env`. */
  readonly env: Readonly<Record<string, string | undefined>>;
}

/** The skill keys of the settings as one object over a view (docs/API.md, "Settings"). */
export interface SkillSettingsPolicy {
  visibility(skillName: string, subject?: SkillSubject): SkillVisibility;
  bundled(): BundledSkillsDecision;
  readonly bundledSkillsDisabled: boolean;
  shell(origin: ShellOrigin): ShellVerdict;
  syncClaudeAiSkills(): SyncDecision;
}

/**
 * `disableSkillShellExecution: true` in the SDK's `managedSettings` takes effect, but parent settings
 * are ignored where an administrator deploys managed settings (claude-apps-gateway.md): the shell
 * verdict reads the view under the parent rules.
 */
export function createSkillSettingsPolicy(
  view: PolicyView,
  context: SkillPolicyContext,
): SkillSettingsPolicy {
  const effective = applyParentRules(view, context);
  const bundled = bundledSkills(view, context.env);
  return {
    visibility: (name, subject) => skillVisibility(view, name, subject),
    bundled: () => bundled,
    bundledSkillsDisabled: bundled.disabled,
    shell: (origin) => shellVerdict(effective, origin),
    syncClaudeAiSkills: () => syncSkillsDecision(view),
  };
}
