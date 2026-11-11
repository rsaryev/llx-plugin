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
/** `file.ts` plus a comment alternative (never a match, but its bytes count against the budget). */
const heavy = (file: string, mebibytes: number) =>
  `{${file}.ts,#${'x'.repeat(mebibytes * 1024 * 1024)}}`;
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

  test('the memory.md example `{a,b}/{c,d}/*.{ts,tsx}` expands to eight patterns, each of which matches', () => {
    const skill = listed('{a,b}/{c,d}/*.{ts,tsx}');
    const files = ['a', 'b'].flatMap((x) =>
      ['c', 'd'].flatMap((y) => ['ts', 'tsx'].map((ext) => `${x}/${y}/f.${ext}`)),
    );
    expect(files).toHaveLength(8);
    for (const file of files) expect(activates(skill, `/work/app/${file}`)).toBe(true);
    expect(activates(skill, '/work/app/a/c/f.js')).toBe(false);
    expect(activates(skill, '/work/app/c/a/f.ts')).toBe(false);
  });

  test('"a rule\'s whole `paths` list shares one budget of 1,000 expanded patterns": a pattern over it is used unexpanded', () => {
    // ten groups of two: 1,024 expansions, over the budget; the literal braces match no files
    const over = `${'{a,b}'.repeat(10)}.ts`;
    expect(activates(listed(over), `/work/app/${'a'.repeat(10)}.ts`)).toBe(false);
    expect(activates(listed(over), `/work/app/${over}`)).toBe(true);
    // nine groups: 512, within it
    const within = `${'{a,b}'.repeat(9)}.ts`;
    expect(activates(listed(within), `/work/app/${'a'.repeat(9)}.ts`)).toBe(true);
    expect(activates(listed(within), `/work/app/${'ab'.repeat(4)}a.ts`)).toBe(true);
  });

  test('the budget is shared across the list: a second pattern that no longer fits is used unexpanded', () => {
    const first = `${'{a,b}'.repeat(9)}.ts`; // 512 expansions
    const second = `${'{c,d}'.repeat(9)}.ts`; // 512 more: 1,024 in all
    const skill = listed(first, second);
    expect(activates(skill, `/work/app/${'a'.repeat(9)}.ts`)).toBe(true);
    expect(activates(skill, `/work/app/${'c'.repeat(9)}.ts`)).toBe(false);
    expect(activates(skill, `/work/app/${second}`)).toBe(true);
  });

  test('"patterns without braces don\'t count against it": any number of them still match', () => {
    const plain = Array.from({ length: 1500 }, (_, at) => `dir${at}/*.ts`);
    const skill = listed(...plain, '{x,y}/*.ts');
    expect(activates(skill, '/work/app/dir1499/a.ts')).toBe(true);
    expect(activates(skill, '/work/app/y/a.ts')).toBe(true);
  });

  test('the byte half of the budget: 4 MiB of expanded patterns is shared by the list, a pattern over it is used unexpanded', () => {
    // each pattern is `x.ts` plus a comment alternative (never a match, but its bytes count)
    const skill = listed(heavy('a', 2.5), heavy('b', 2.5));
    expect(activates(skill, '/work/app/a.ts')).toBe(true);
    expect(activates(skill, '/work/app/b.ts')).toBe(false);
    const fits = listed(heavy('a', 1), heavy('b', 1));
    expect(activates(fits, '/work/app/a.ts')).toBe(true);
    expect(activates(fits, '/work/app/b.ts')).toBe(true);
  });

  test('a pattern with a `[` that cannot be read matches nothing and the other patterns keep working (`photos [2024/**`)', () => {
    const skill = listed('photos [2024/**', 'src/**/*.ts');
    expect(activates(skill, '/work/app/photos [2024/a.jpg')).toBe(false);
    expect(activates(skill, '/work/app/photos 2024/a.jpg')).toBe(false);
    expect(activates(skill, '/work/app/src/a.ts')).toBe(true);
  });

  test('"To match a literal `[` in a file name, escape it": `photos \\[2024/**`', () => {
    const skill = listed('photos \\[2024/**');
    expect(activates(skill, '/work/app/photos [2024/a.jpg')).toBe(true);
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

  test('expanding a pattern with many groups is bounded by the budget, not by the number of groups', () => {
    const started = performance.now();
    const skill = listed(`${'{a,b}'.repeat(40)}.ts`);
    expect(activates(skill, `/work/app/${'a'.repeat(40)}.ts`)).toBe(false);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test('a brace group with no comma is literal text', () => {
    expect(activates(listed('a{b}.ts'), '/work/app/a{b}.ts')).toBe(true);
    expect(activates(listed('a{b}.ts'), '/work/app/ab.ts')).toBe(false);
  });

  test('an unclosed brace is literal text', () => {
    expect(activates(listed('a{b,c.ts'), '/work/app/a{b,c.ts')).toBe(true);
  });
});
