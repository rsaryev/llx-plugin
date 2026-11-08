/**
 * skills.md § Frontmatter reference, `paths`: "Glob patterns that limit when this skill is
 * activated. Accepts a comma-separated string or a YAML list. When set, Claude loads the skill
 * automatically only when working with files matching the patterns. Patterns are relative to
 * Claude's current working directory, and files outside that directory don't match. Uses the same
 * glob format as path-specific rules." The format, memory.md § Path-specific rules: the table of
 * patterns and brace expansion. Skill not triggering, step 6: a sibling git worktree is outside.
 */
import { describe, expect, test } from 'bun:test';
import { skillActivatesFor } from '../../src/skills/path-gate.ts';
import { skillWith } from '../support/skills.ts';
import { spec } from '../support/spec.ts';

const CWD = '/work/app';
const gated = (paths: string) => skillWith(`paths: ${paths}`);
const listed = (...patterns: string[]) =>
  skillWith(`paths:\n${patterns.map((pattern) => `  - "${pattern}"`).join('\n')}`);
const activates = (skill: ReturnType<typeof skillWith>, file: string) =>
  skillActivatesFor(skill, file, CWD);

spec('skills.frontmatter.paths', () => {
  test('a skill with no `paths` is active for any file', () => {
    expect(activates(skillWith('description: d'), '/work/app/src/a.ts')).toBe(true);
  });

  test('the table: `**/*.ts` is `.ts` files anywhere under the base directory', () => {
    const skill = listed('**/*.ts');
    expect(activates(skill, '/work/app/a.ts')).toBe(true);
    expect(activates(skill, '/work/app/src/deep/a.ts')).toBe(true);
    expect(activates(skill, '/work/app/src/a.js')).toBe(false);
  });

  test("the table: `src/**/*` is all files under the base directory's `src/`", () => {
    const skill = listed('src/**/*');
    expect(activates(skill, '/work/app/src/a.ts')).toBe(true);
    expect(activates(skill, '/work/app/src/x/y/z.md')).toBe(true);
    expect(activates(skill, '/work/app/lib/a.ts')).toBe(false);
  });

  test('the table: `*.md` is `.md` files anywhere under the base directory', () => {
    const skill = listed('*.md');
    expect(activates(skill, '/work/app/README.md')).toBe(true);
    expect(activates(skill, '/work/app/docs/guide/a.md')).toBe(true);
  });

  test('the table: `/*.md` is `.md` files directly in the base directory, not in subfolders', () => {
    const skill = listed('/*.md');
    expect(activates(skill, '/work/app/README.md')).toBe(true);
    expect(activates(skill, '/work/app/docs/a.md')).toBe(false);
  });

  test('the table: `src/components/*.tsx` is directly in `src/components/`, not in subfolders', () => {
    const skill = listed('src/components/*.tsx');
    expect(activates(skill, '/work/app/src/components/Button.tsx')).toBe(true);
    expect(activates(skill, '/work/app/src/components/forms/Input.tsx')).toBe(false);
  });

  test('brace expansion matches several extensions in one pattern: `src/**/*.{ts,tsx}`', () => {
    const skill = listed('src/**/*.{ts,tsx}', 'lib/**/*.ts');
    expect(activates(skill, '/work/app/src/a.ts')).toBe(true);
    expect(activates(skill, '/work/app/src/ui/a.tsx')).toBe(true);
    expect(activates(skill, '/work/app/src/ui/a.css')).toBe(false);
    expect(activates(skill, '/work/app/lib/a.ts')).toBe(true);
  });

  test('"a comma-separated string": each item is a pattern, a brace group stays whole', () => {
    const skill = gated('src/**/*.{ts,tsx}, docs/**/*.md');
    expect(activates(skill, '/work/app/src/a.tsx')).toBe(true);
    expect(activates(skill, '/work/app/docs/x/a.md')).toBe(true);
    expect(activates(skill, '/work/app/other/a.md')).toBe(false);
  });

  test('a skill whose patterns do not match the file is not activated', () => {
    expect(activates(listed('src/api/**'), '/work/app/src/ui/a.ts')).toBe(false);
  });

  test('patterns are relative to the current directory: a relative file is read from it', () => {
    const skill = listed('src/**/*.ts');
    expect(skillActivatesFor(skill, 'src/a.ts', CWD)).toBe(true);
    expect(skillActivatesFor(skill, './src/a.ts', CWD)).toBe(true);
  });

  test('"files outside that directory don\'t match": a sibling worktree, a parent, a prefix twin', () => {
    const skill = listed('**/*.ts');
    expect(activates(skill, '/work/app-worktree/src/a.ts')).toBe(false);
    expect(activates(skill, '/work/other.ts')).toBe(false);
    expect(activates(skill, '/work/app2/a.ts')).toBe(false);
    expect(activates(skill, '/elsewhere/a.ts')).toBe(false);
  });

  test('a relative path that climbs out of the directory is outside it', () => {
    expect(skillActivatesFor(listed('**/*.ts'), '../app2/a.ts', CWD)).toBe(false);
    expect(skillActivatesFor(listed('**/*.ts'), 'src/../../x.ts', CWD)).toBe(false);
  });

  test('the same file matches again after the session moves to the worktree (`/cd`)', () => {
    const skill = listed('**/*.ts');
    expect(activates(skill, '/work/app-worktree/src/a.ts')).toBe(false);
    expect(skillActivatesFor(skill, '/work/app-worktree/src/a.ts', '/work/app-worktree')).toBe(
      true,
    );
  });

  test('on Windows a drive path is matched in POSIX form', () => {
    const skill = listed('src/**/*.ts');
    expect(
      skillActivatesFor(skill, 'C:\\Users\\me\\app\\src\\a.ts', 'C:\\Users\\me\\app', {
        platform: 'windows',
      }),
    ).toBe(true);
    expect(
      skillActivatesFor(skill, 'C:\\Users\\me\\other\\src\\a.ts', 'C:\\Users\\me\\app', {
        platform: 'windows',
      }),
    ).toBe(false);
  });
});

describe('path gate (judgments: spec/judgments.md)', () => {
  test('the base directory itself is not a file of the skill', () => {
    expect(skillActivatesFor(listed('**/*'), CWD, CWD)).toBe(false);
  });

  test('patterns that are only a blank or a comment never activate the skill', () => {
    expect(activates(listed('#x'), '/work/app/#x')).toBe(false);
  });

  test('nested and adjacent brace groups expand: `{a,b}/{c,d}.ts`', () => {
    const skill = listed('{a,b}/{c,d}.ts');
    for (const file of ['a/c.ts', 'a/d.ts', 'b/c.ts', 'b/d.ts']) {
      expect(activates(skill, `/work/app/${file}`)).toBe(true);
    }
    expect(activates(skill, '/work/app/c/c.ts')).toBe(false);
    expect(activates(listed('src/{ts,{tsx,jsx}}/x'), '/work/app/src/jsx/x')).toBe(true);
  });

  test('a brace group with no comma is literal text', () => {
    expect(activates(listed('a{b}.ts'), '/work/app/a{b}.ts')).toBe(true);
    expect(activates(listed('a{b}.ts'), '/work/app/ab.ts')).toBe(false);
  });

  test('an unclosed brace is literal text', () => {
    expect(activates(listed('a{b,c.ts'), '/work/app/a{b,c.ts')).toBe(true);
  });
});
