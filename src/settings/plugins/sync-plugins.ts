import type { PolicyKey } from '../../protocol/settings-keys.ts';
import type { PolicyScope } from '../layers.ts';
import type { PolicyView } from '../view.ts';

/** What `syncClaudeAiPlugins` asks the host to do; the host does the I/O. */
export interface SyncDecision {
  /** `false`: do not download the plugins enabled on the claude.ai account. */
  readonly download: boolean;
  /** `false`: do not load the plugins already in `~/.claude/plugins/synced/`. */
  readonly loadSynced: boolean;
  /** Move the already synced plugins to `~/.claude/plugins/.trash/`. */
  readonly moveToTrash: boolean;
}

/** The two keys that stop the claude.ai sync; they read the same way (settings.md, "Exceptions"). */
export type SyncKey = Extract<PolicyKey, 'syncClaudeAiPlugins' | 'syncClaudeAiSkills'>;

/** The files whose `false` also moves the synced plugins (settings-reference.md: "user or managed"). */
const MOVES: readonly PolicyScope[] = ['user', 'managed'];

/**
 * Whether Claude Code syncs and loads the plugins of the claude.ai account. Only `false` counts: `true`
 * is the same as unset. A `false` the key's scope line admits (user, local, managed, `--settings`)
 * stops sync wherever it sits, even under a managed `true` (settings.md, "Exceptions to managed
 * settings precedence"). The decision is the key's part only: that a session signs in with a
 * claude.ai account at all (plugins/loading.md, "Sign-in requirements for terminal sync") is the host's.
 *
 * Judgment (spec/judgments.md): one `false` in a user or managed file moves the plugins, even when
 * a higher file only stops the sync.
 */
export function syncDecision(view: PolicyView): SyncDecision {
  return syncDecisionOf(view, 'syncClaudeAiPlugins');
}

/**
 * The reading both sync keys share: `syncClaudeAiSkills` has the same scope line, the same
 * honored-only-`false` rule and the same move to the trash (settings-reference.md, skills.md "How
 * synced skills behave"), only into `~/.claude/skills/.trash/`.
 */
export function syncDecisionOf(view: PolicyView, key: SyncKey): SyncDecision {
  const off = view.eachFromHighest(key).filter((holder) => !holder.value);
  if (off.length === 0) return { download: true, loadSynced: true, moveToTrash: false };
  return {
    download: false,
    loadSynced: false,
    moveToTrash: off.some((holder) => MOVES.includes(holder.scope)),
  };
}
