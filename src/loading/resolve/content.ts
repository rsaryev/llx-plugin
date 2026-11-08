import type { SubstitutionScope } from './scope.ts';
import { prepareSubstituter } from './prepared.ts';
import type { Substituted } from './substitute.ts';
import { SURFACE_POLICY, substituteSurface } from './surfaces.ts';

/**
 * Substitutes `${...}` in the Markdown body of a skill, command or agent (plugins/manifest-reference.md,
 * "Where each variable resolves": "Anywhere in the Markdown body", nothing exported). The three path
 * variables resolve, `${user_config.KEY}` resolves for non-sensitive options and a sensitive one
 * becomes `SENSITIVE_PLACEHOLDER` (the page words the `user_config` rule for skill and agent content;
 * a command body takes it too on the strength of the table's single row, a reading recorded in
 * `spec/judgments.md`); `${VAR}` of the environment stays for the model to read. Variables
 * the skill owns (`CLAUDE_SKILL_DIR`, `CLAUDE_SESSION_ID`, `CLAUDE_EFFORT`) come in `scope.extra`.
 *
 * It takes the body: the caller splits the frontmatter off (`parseFrontmatter`), and the `$ARGUMENTS`
 * placeholders and the `allowed-tools` rules are the skills' own. A reference with no value stays as
 * written and is a warning at `path`.
 */
export const substituteContent = (
  body: string,
  scope: SubstitutionScope,
  path = 'content',
): Promise<Substituted> => substituteSurface('markdown-content', body, scope, path);

/**
 * `substituteContent` for a host that reads a body synchronously (a lazily loaded skill): the
 * variables are asked for once, by `prepareSubstituter`, and each call after is synchronous, with
 * the same rules.
 */
export async function prepareContentSubstitution(
  scope: SubstitutionScope,
): Promise<(body: string, path?: string) => Substituted> {
  const prepared = await prepareSubstituter(scope);
  return (body, path = 'content') => prepared.run(body, SURFACE_POLICY['markdown-content'], path);
}
