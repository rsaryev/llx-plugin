import type { SubstitutionScope } from './scope.ts';
import type { Substituted } from './substitute.ts';
import { substituteSurface } from './surfaces.ts';

/**
 * Substitutes `${...}` in the Markdown body of a skill, command or agent (plugins/manifest-reference.md,
 * "Where each variable resolves": "Anywhere in the Markdown body", nothing exported). The three path
 * variables resolve, `${user_config.KEY}` resolves for non-sensitive options and a sensitive one
 * becomes `SENSITIVE_PLACEHOLDER`; `${VAR}` of the environment stays for the model to read. Variables
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
