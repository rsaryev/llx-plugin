import { readBundledSkill, type BundledSkillHead } from '../format/bundled-skill.ts';
import { error, type PluginIssue } from '../format/issues.ts';
import type { BodyReader } from '../format/skill-types.ts';
import { skillSettingsOf } from './session-skill-expand.ts';
import { placeOf, type Entry } from './session-skill-entries.ts';
import type { SessionOptions } from './session-types.ts';
import type { HostState } from './state.ts';

/**
 * A skill the host supplies itself (`SessionOptions.hostSkills`): one built into the host, or one its
 * extension mechanism registers at run time. Claude Code's counterpart is a bundled skill (skills.md,
 * "Bundled skills"), and the kit applies the docs' rules for one: a folder skill of its name replaces
 * it, a synced skill's short name yields to it, `disableBundledSkills` and
 * `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` remove it, `skillOverrides` applies to it, and neither
 * `disableSkillShellExecution`, `allowManagedPermissionRulesOnly` nor the plugin-only lock touches it.
 * A skill that should behave as a plugin's belongs in a plugin (`SessionOptions.plugins`), as the
 * Agent SDK adds skills (`plugins: [{ type: 'local', path }]`).
 */
export interface HostSkill extends BundledSkillHead {
  /** The Markdown after the frontmatter, or a reader the session calls at each expansion and preload. */
  readonly body: string | BodyReader;
}

export interface HostSkillEntries {
  readonly entries: readonly Entry[];
  readonly issues: readonly PluginIssue[];
}

const readerOf = (body: string | BodyReader): BodyReader =>
  typeof body === 'string' ? () => Promise.resolve(body) : body;

const NONE: HostSkillEntries = { entries: [], issues: [] };

const READ = new WeakMap<readonly HostSkill[], HostSkillEntries>();

/**
 * The entries of the host's list, read once per list: the getter that returns the same array returns
 * the same entries, so a catalog read calls no reader and a run-time change is a new array. Judgment
 * (spec/judgments.md): a second skill of one name is an issue and the first stays.
 */
export function hostEntriesOf(list: readonly HostSkill[] | undefined): HostSkillEntries {
  if (list === undefined || list.length === 0) return NONE;
  const cached = READ.get(list);
  if (cached !== undefined) return cached;
  const entries: Entry[] = [];
  const issues: PluginIssue[] = [];
  const seen = new Set<string>();
  for (const skill of list) {
    const read = readBundledSkill(skill, typeof skill.body === 'string' ? skill.body : '');
    issues.push(...read.issues);
    const { invocable } = read;
    if (invocable === undefined) continue;
    if (seen.has(invocable.command)) {
      issues.push(
        error(
          `hostSkills.${skill.name}`,
          'a host skill of this name came first; this one is not used',
        ),
      );
      continue;
    }
    seen.add(invocable.command);
    entries.push({
      invocable,
      names: [invocable.command],
      readBody: readerOf(skill.body),
      source: { kind: 'host' },
      ...placeOf(invocable),
    });
  }
  const read = { entries, issues };
  READ.set(list, read);
  return read;
}

/**
 * The host skills in force: none while `disableBundledSkills` or `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`
 * removes them (skills.md, "Remove a skill"); the issues of the list stay either way.
 */
export function hostSkillsOf(state: HostState, options: SessionOptions): HostSkillEntries {
  const read = hostEntriesOf(options.hostSkills?.());
  if (read.entries.length === 0 || !skillSettingsOf(state, options).bundled().disabled) return read;
  return { entries: [], issues: read.issues };
}
