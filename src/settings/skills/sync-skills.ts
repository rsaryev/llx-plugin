import { syncDecisionOf, type SyncDecision } from '../plugins/sync-plugins.ts';
import type { PolicyView } from '../view.ts';

/**
 * Whether Claude Code syncs and loads the skills of the claude.ai account (settings-reference.md,
 * `syncClaudeAiSkills`; settings.md, "Exceptions to managed settings precedence"). Only `false`
 * counts, from user, local, managed and `--settings` files, also over a managed `true`; in user or
 * managed settings it also moves the synced skills to `~/.claude/skills/.trash/`. That a session signs
 * in with a claude.ai account, and the skills lock of `strictPluginOnlyCustomization`, are not this
 * key's (skills.md, "Where synced skills load").
 */
export const syncSkillsDecision = (view: PolicyView): SyncDecision =>
  syncDecisionOf(view, 'syncClaudeAiSkills');
