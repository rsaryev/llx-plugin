/** Helpers for the tests of `expandSkill`: fake ports, the real rules matcher as the permission answer. */
import { readSkill } from '../../src/format/skill.ts';
import type { Command, Skill, SkillOrigin } from '../../src/format/skill-types.ts';
import type { CommandRun, Environment } from '../../src/ports/index.ts';
import {
  expandSkill,
  type ExpandPorts,
  type ExpandRequest,
  type Expansion,
} from '../../src/skills/expand.ts';
import type { ShellCall, ShellPermission } from '../../src/skills/shell-run.ts';
import { asks, covers, denies } from './bash-rules.ts';
import { fakeEnvironment, locations } from './ports.ts';
import { scriptedRunner, type RunnerReply } from './ports.ts';
import { BASE_DIRECTORY } from '../../src/skills/folder-line.ts';

export const PLUGIN: SkillOrigin = { kind: 'plugin', plugin: 'my-plugin' };

/** A `SKILL.md` of the given origin: its frontmatter lines and body, read through the real reader. */
export function skillFrom(
  frontmatter: string,
  body: string,
  origin: SkillOrigin = { kind: 'project' },
  name = 'pr-summary',
): Skill {
  const text = `---\nname: ${name}\ndescription: A skill\n${frontmatter}\n---\n${body}`;
  const folder = 'plugin' in origin ? `skills/${name}` : `.claude/skills/${name}`;
  return readSkill(`${folder}/SKILL.md`, text, { origin, dirName: name }).skill;
}

/**
 * A custom command of the given origin, with the fields of the same frontmatter the skill reader
 * gives (there is no command reader yet): `/name` runs `body`.
 */
export function commandFrom(
  frontmatter: string,
  body: string,
  origin: SkillOrigin = { kind: 'project' },
  name = 'pr-summary',
): Command {
  // A command is one file, not a folder: it has no `dir`, so no `${CLAUDE_SKILL_DIR}` (oracle).
  const { dir: _folder, ...fields } = skillFrom(frontmatter, body, origin, name);
  return { ...fields, kind: 'command', path: `.claude/commands/${name}.md` };
}

export interface Rules {
  readonly allow?: readonly string[];
  readonly ask?: readonly string[];
  readonly deny?: readonly string[];
}

const matches = (
  rules: readonly string[] | undefined,
  test: (rule: string, command: string) => boolean,
  command: string,
): boolean => (rules ?? []).some((rule) => test(rule, command));

/**
 * The host's answer built from the real rules matcher, as docs/API.md describes: deny rules, then
 * ask rules, then allow rules and the skill's grants ("Deny and ask rules still override
 * `allowed-tools`"); a command nothing matches would prompt (`ask`). Bash only.
 */
function permissionsFrom(rules: Rules = {}, calls: ShellCall[] = []): ShellPermission {
  return (call) => {
    calls.push(call);
    const { command } = call;
    if (matches(rules.deny, denies, command)) return 'deny';
    if (matches(rules.ask, asks, command)) return 'ask';
    const granted = [...call.grants, ...(rules.allow ?? [])];
    return granted.some((rule) => covers('allow', rule, command, { toolName: call.tool }))
      ? 'allow'
      : 'ask';
  };
}

const defaultRequest = (overrides: Partial<ExpandRequest> = {}): ExpandRequest => ({
  arguments: '',
  sessionId: 'sess-42',
  disableShellExecution: false,
  shells: { bash: true, powershell: false },
  context: { interactive: true, trigger: 'user' },
  signal: new AbortController().signal,
  ...overrides,
});

export interface Run {
  readonly expansion: Expansion;
  readonly runs: readonly CommandRun[];
  readonly asked: readonly ShellCall[];
}

export interface RunOptions {
  readonly request?: Partial<ExpandRequest>;
  readonly replies?: readonly RunnerReply[];
  readonly rules?: Rules;
  readonly env?: Readonly<Record<string, string>>;
  /** Wraps the environment the ports get, to observe how it is read. */
  readonly observe?: (environment: Environment) => Environment;
  readonly permissions?: ShellPermission;
}

/** Expand `skill` with fake ports; commands answer from `replies` (default: exit 0, no output). */
export async function expandWith(skill: Skill | Command, options: RunOptions = {}): Promise<Run> {
  const runner = scriptedRunner(...(options.replies ?? Array.from({ length: 20 }, () => ({}))));
  const asked: ShellCall[] = [];
  const ports: ExpandPorts = {
    runner,
    locations: locations(),
    environment: (options.observe ?? ((found) => found))(fakeEnvironment(options.env)),
    permissions: options.permissions ?? permissionsFrom(options.rules, asked),
  };
  const expansion = await expandSkill(skill, defaultRequest(options.request), ports);
  return { expansion, runs: runner.calls, asked };
}

/**
 * The body of a successful expansion: its text after the `Base directory for this skill:` line a
 * skill opens with (tests/skills/expand-base-directory.test.ts holds that line). The test fails on
 * an abort.
 */
export function textOf(expansion: Expansion): string {
  if (!expansion.ok) throw new Error(expansion.issues.map((found) => found.message).join('; '));
  return bodyOf(expansion.text);
}

/** A skill's text without its first `Base directory` line, a command's as it is. */
export function bodyOf(text: string): string {
  if (!text.startsWith(BASE_DIRECTORY)) return text;
  const end = text.indexOf('\n\n');
  return end === -1 ? '' : text.slice(end + 2);
}

/** The message of an aborted expansion. */
export function abortOf(expansion: Expansion): string {
  if (expansion.ok) throw new Error(`expected an abort, got: ${expansion.text}`);
  return expansion.issues.map((found) => found.message).join('; ');
}

/** The grants of a successful expansion; the test fails on an abort. */
export function grantsOf(run: Run): readonly string[] {
  if (!run.expansion.ok) throw new Error(abortOf(run.expansion));
  return run.expansion.grants;
}
