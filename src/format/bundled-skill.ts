import { commandNameIssues } from './command.ts';
import { warning, type PluginIssue } from './issues.ts';
import { directoryOf } from './skill.ts';
import { readInvocable } from './skill-fields.ts';
import type { InvocableHead, SkillOrigin } from './skill-types.ts';

/**
 * A skill the host supplies itself: Claude Code's bundled skills ("Bundled skills": "You invoke a
 * bundled skill the same way as any other skill", skills.md). It arrives as data, not a file the kit
 * reads, so its head is read here from the name and the frontmatter the host gives.
 */
export interface BundledSkillHead {
  /** The command, as typed without the slash: `review`, `code-review`. */
  readonly name: string;
  /** The frontmatter as a skill's YAML would hold it (`description`, `allowed-tools`, any key). */
  readonly frontmatter?: Readonly<Record<string, unknown>>;
  /** The skill's `SKILL.md`, absolute, when it has one: it is then a skill with a folder. */
  readonly file?: string;
}

export interface BundledSkillRead {
  /** Absent when the name is refused: an error issue says why. */
  readonly invocable?: InvocableHead;
  readonly issues: readonly PluginIssue[];
}

const BUNDLED: SkillOrigin = { kind: 'bundled' };

/**
 * Judgment (spec/judgments.md): the name is the command as given, refused as a command name is
 * (`commandNameIssues`: an empty name, a character a command name can't hold, `anthropic-skills`),
 * and the frontmatter is read as a skill's, `name` aside (the host's `name` is the command). With a
 * `file` it is a skill whose folder is the file's directory; without one, a command without a
 * folder. `body` is the text when the host gave text, for the `description` fallback.
 */
export function readBundledSkill(head: BundledSkillHead, body: string): BundledSkillRead {
  const at = `hostSkills.${head.name}`;
  const refused = commandNameIssues(at, [head.name], BUNDLED);
  if (refused.length > 0) return { issues: refused };
  const { frontmatter, problems } = readInvocable(head.frontmatter ?? {}, body, ['name']);
  const issues = problems.map((found) => warning(at, `${found.key} ${found.reason}`));
  const named = { ...frontmatter, name: head.name, command: head.name, origin: BUNDLED };
  const invocable: InvocableHead =
    head.file === undefined
      ? { ...named, kind: 'command' }
      : { ...named, kind: 'skill', path: head.file, dir: directoryOf(head.file) };
  return { invocable, issues };
}
