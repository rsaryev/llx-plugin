/**
 * skills.md § Using skill frontmatter outside Claude Code: "Claude Code accepts every field in the
 * table above. Outside Claude Code, you can use only the fields in the Agent Skills spec" (`name`,
 * `description`, `license`, `compatibility`, `metadata`, `allowed-tools`); "If you include any field
 * the spec doesn't allow, packaging or upload fails with a hard error instead of ignoring the field"
 * with the quoted message; "Claude Code accepts all six fields, so frontmatter that follows the spec
 * loads in Claude Code without changes".
 */
import { describe, expect, test } from 'bun:test';
import { readSkill } from '../../src/format/skill.ts';
import { SKILL_FIELDS } from '../../src/format/skill-fields.ts';
import {
  AGENT_SKILLS_FIELDS,
  DISTRIBUTION_PATHS,
  frontmatterIssues,
} from '../../src/skills/portable.ts';
import { spec } from '../support/spec.ts';

const file = (...lines: string[]) => `---\n${lines.join('\n')}\n---\n\nBody.\n`;
const SPEC_FILE = file(
  'name: pdf-tools',
  'description: Work with PDFs',
  'license: MIT',
  'compatibility: Needs python3',
  'metadata:',
  '  owner: docs',
  'allowed-tools: Read Grep',
);
const OUTSIDE = ['claude-ai-upload', 'skills-api', 'package-skill'] as const;

spec('skills.behavior.Using skill frontmatter outside Claude Code', () => {
  test("the docs' error: a skill with `argument-hint` fails upload with the exact message", () => {
    const [issue] = frontmatterIssues(
      file('name: x', 'argument-hint: <branch>'),
      'claude-ai-upload',
    );
    expect(issue).toMatchObject({
      severity: 'error',
      message:
        'Unexpected key(s) in SKILL.md frontmatter: argument-hint. Allowed properties are: allowed-tools, compatibility, description, license, metadata, name',
    });
  });

  test('"claude.ai skill uploads, the Skills API, and packaging with package_skill.py" take the six fields and refuse the rest', () => {
    for (const path of OUTSIDE) {
      expect([path, frontmatterIssues(SPEC_FILE, path)]).toEqual([path, []]);
      const refused = frontmatterIssues(file('name: x', 'model: haiku', 'hooks: {}'), path);
      expect([path, refused[0]?.message.includes('model, hooks')]).toEqual([path, true]);
    }
  });

  test('every Claude Code field outside the spec is refused outside Claude Code, and none is refused inside', () => {
    const inSpec = new Set<string>(AGENT_SKILLS_FIELDS);
    const extra = SKILL_FIELDS.filter((field) => !inSpec.has(field));
    expect(extra).toHaveLength(SKILL_FIELDS.length - AGENT_SKILLS_FIELDS.length);
    for (const field of extra) {
      expect([field, frontmatterIssues(file(`${field}: x`), 'claude-ai-upload').length]).toEqual([
        field,
        1,
      ]);
      expect([field, frontmatterIssues(file(`${field}: x`), 'claude-code').length]).toEqual([
        field,
        0,
      ]);
    }
  });

  test('"Claude Code accepts all six fields, so frontmatter that follows the spec loads in Claude Code without changes"', () => {
    const { skill, issues } = readSkill('.claude/skills/pdf-tools/SKILL.md', SPEC_FILE, {
      origin: { kind: 'project' },
      dirName: 'pdf-tools',
    });
    expect(issues).toEqual([]);
    expect(skill).toMatchObject({
      name: 'pdf-tools',
      description: 'Work with PDFs',
      license: 'MIT',
      compatibility: 'Needs python3',
      allowedTools: ['Read', 'Grep'],
      metadata: { owner: 'docs' },
    });
  });

  test('a path takes the fields in the Claude Code table at "any level", plugin skills included: no field is refused', () => {
    const every = file(...SKILL_FIELDS.map((field) => `${field}: x`));
    expect(frontmatterIssues(every, 'claude-code')).toEqual([]);
  });
});

describe('judgments (spec/judgments.md)', () => {
  test('several unexpected keys are listed in the order they appear', () => {
    const [issue] = frontmatterIssues(file('model: a', 'name: x', 'effort: low'), 'skills-api');
    expect(
      issue?.message.startsWith('Unexpected key(s) in SKILL.md frontmatter: model, effort.'),
    ).toBe(true);
  });

  test('a file without frontmatter, or with an unparsable block, has no key to refuse', () => {
    for (const path of DISTRIBUTION_PATHS) {
      expect(frontmatterIssues('# Just text', path)).toEqual([]);
      expect(frontmatterIssues('---\n: : :\n---\nx', path)).toEqual([]);
    }
  });

  test('a field name must match exactly: `Name` is not `name` and is refused', () => {
    expect(frontmatterIssues(file('Name: x'), 'claude-ai-upload')).toHaveLength(1);
  });
});
