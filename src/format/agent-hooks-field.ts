import type { HooksSettings } from '../protocol/hook-config.ts';
import type { AgentCoercer } from './agent-scalars.ts';
import { readHooksSettings } from './hooks-settings.ts';
import { warning } from './issues.ts';

/**
 * `hooks` (sub-agents.md, "Frontmatter reference": "Lifecycle hooks scoped to this subagent"): the
 * settings' hook format, an event map, and "All hook events are supported". What is wrong is
 * reported as a warning and no hook is kept, so a half-read file never runs half its hooks; the
 * agent still loads. A plugin agent never gets here: the registry marks the field ignored.
 */
export const hooks: AgentCoercer<HooksSettings> = (path, key, raw) => {
  if (raw === undefined || raw === null) return { value: undefined, issues: [] };
  const read = readHooksSettings(raw);
  const issues = read.issues.map((issue) =>
    warning(path, `Invalid "${key}": ${issue.message}; the hooks are ignored`),
  );
  return { value: issues.length === 0 ? read.hooks : undefined, issues };
};
