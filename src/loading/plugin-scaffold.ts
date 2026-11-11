/**
 * The files `claude plugin init` writes (plugins/create.md, "Scaffold the plugin with `claude plugin
 * init`" and "Share the plugin through a repository"; plugins/cli-reference.md, "plugin init"): a
 * pure plan, the host writes. The command "creates `~/.claude/skills/my-tool/` with a
 * `.claude-plugin/plugin.json` and a root `SKILL.md`"; `--with skills` also scaffolds a skill under
 * `skills/`. To share a plugin through one repository "create the same layout yourself at
 * `<project>/.claude/skills/<name>/`".
 */
import type { PluginIssue } from '../format/issues.ts';
import { nameLoadIssues } from '../format/names.ts';

/** Where the plugin folder goes: the personal skills directory, or a project's. */
export const SCAFFOLD_SCOPES = ['user', 'project'] as const;
export type ScaffoldScope = (typeof SCAFFOLD_SCOPES)[number];

const SKILLS_DIRECTORY: { readonly [S in ScaffoldScope]: string } = {
  user: '~/.claude/skills',
  project: '.claude/skills',
};

export interface ScaffoldFile {
  /** Relative to the plugin folder. */
  readonly path: string;
  readonly content: string;
}

export interface ScaffoldPlan {
  /** The plugin folder: `~/.claude/skills/<name>` or `.claude/skills/<name>` (relative to the project). */
  readonly directory: string;
  readonly files: readonly ScaffoldFile[];
  /** `✔ Created plugin "<name>" at <directory>`. */
  readonly created: string;
  /** `It will auto-load next session as <name>@skills-dir. Run /reload-plugins to load it now.` */
  readonly loadsAs: string;
}

export interface ScaffoldInput {
  readonly name: string;
  readonly scope: ScaffoldScope;
  /** `--with skills`: also scaffold a skill under `skills/`. */
  readonly withSkills?: boolean;
}

const EXAMPLE_SKILL = 'example';

/**
 * Judgment (spec/judgments.md): the docs name the files, not their text. The manifest holds the
 * name `claude plugin init <name>` gives ("the plugin's `name` in its manifest"); each `SKILL.md` has a
 * `description`, which Claude needs to know when to use a skill, and a line to replace.
 */
const skillFile = (path: string, description: string): ScaffoldFile => ({
  path,
  content: `---\ndescription: ${description}\n---\n\nReplace this with the instructions Claude should follow.\n`,
});

/** The plan, or why the name cannot be a plugin's. */
export function planPluginScaffold(
  input: ScaffoldInput,
): { readonly plan: ScaffoldPlan } | { readonly issues: readonly PluginIssue[] } {
  const issues = nameLoadIssues(input.name);
  if (issues.length > 0) return { issues };
  const directory = `${SKILLS_DIRECTORY[input.scope]}/${input.name}`;
  const files: ScaffoldFile[] = [
    {
      path: '.claude-plugin/plugin.json',
      content: `${JSON.stringify({ name: input.name }, null, 2)}\n`,
    },
    skillFile('SKILL.md', `Use when the user asks for ${input.name}`),
    ...(input.withSkills
      ? [skillFile(`skills/${EXAMPLE_SKILL}/SKILL.md`, `An example skill of ${input.name}`)]
      : []),
  ];
  return {
    plan: {
      directory,
      files,
      created: `✔ Created plugin "${input.name}" at ${directory}`,
      loadsAs: `It will auto-load next session as ${input.name}@skills-dir. Run /reload-plugins to load it now.`,
    },
  };
}
