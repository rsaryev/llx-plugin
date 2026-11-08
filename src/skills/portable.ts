import { error, type PluginIssue } from '../format/issues.ts';
import { parseFrontmatter } from '../format/frontmatter.ts';
import { SKILL_FIELDS } from '../format/skill-fields.ts';

/**
 * Which frontmatter fields each distribution path takes (skills.md, "Using skill frontmatter outside
 * Claude Code"): "Claude Code accepts every field in the table above. Outside Claude Code, you can use
 * only the fields in the Agent Skills spec", and a field the spec doesn't allow makes packaging or
 * upload fail "with a hard error instead of ignoring the field". The kit reads the file; the host (a
 * packaging step, an uploader) shows the error.
 */

/** The six fields of the Agent Skills spec: "name, description, license, compatibility, metadata, allowed-tools". */
export const AGENT_SKILLS_FIELDS = [
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
] as const;

export const DISTRIBUTION_PATHS = [
  'claude-code',
  'claude-ai-upload',
  'skills-api',
  'package-skill',
] as const;
export type DistributionPath = (typeof DISTRIBUTION_PATHS)[number];

type Allowed = readonly string[];

/** The fields each path takes: a registry over the paths (K1), one row of the docs' table each. */
const ACCEPTED: { readonly [P in DistributionPath]: Allowed } = {
  'claude-code': SKILL_FIELDS,
  'claude-ai-upload': AGENT_SKILLS_FIELDS,
  'skills-api': AGENT_SKILLS_FIELDS,
  'package-skill': AGENT_SKILLS_FIELDS,
};

/** Whether the path stops at a field it does not take; Claude Code ignores one it does not recognize. */
const REFUSES_UNKNOWN: { readonly [P in DistributionPath]: boolean } = {
  'claude-code': false,
  'claude-ai-upload': true,
  'skills-api': true,
  'package-skill': true,
};

/**
 * The hard error of an upload or packaging for a `SKILL.md`, or none. The message is the docs':
 * `Unexpected key(s) in SKILL.md frontmatter: argument-hint. Allowed properties are: allowed-tools,
 * compatibility, description, license, metadata, name`. Judgment (spec/judgments.md): several
 * unexpected keys are listed in the order they appear, comma separated.
 */
export function frontmatterIssues(text: string, path: DistributionPath): readonly PluginIssue[] {
  if (!REFUSES_UNKNOWN[path]) return [];
  const allowed = ACCEPTED[path];
  const unexpected = Object.keys(parseFrontmatter(text).fields).filter(
    (key) => !allowed.includes(key),
  );
  if (unexpected.length === 0) return [];
  const list = allowed.toSorted().join(', ');
  return [
    error(
      'SKILL.md',
      `Unexpected key(s) in SKILL.md frontmatter: ${unexpected.join(', ')}. Allowed properties are: ${list}`,
    ),
  ];
}
