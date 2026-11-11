/**
 * memory.md § Path-specific rules: "A path-scoped rule loads when Claude uses the Read, Write, or
 * Edit tool on a matching file"; "Each pattern is relative to the rule's base directory: Project
 * rules: the directory that contains the rule's `.claude` folder; User-level rules: the session's
 * primary working directory"; the pattern table and brace expansion, which the skill gate's tests
 * prove (tests/skills/path-gate.test.ts) on the same matcher. memory.md is an engine page
 * (spec/out-of-scope-pages.json): judgment `memoryRules`, tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import type { MemoryRule } from '../../src/format/memory-rule.ts';
import { ruleActivatesFor, ruleBase } from '../../src/skills/path-gate.ts';

const CWD = '/work/app';
const rule = (path: string, scope: MemoryRule['scope'], paths: readonly string[]): MemoryRule => ({
  path,
  scope,
  paths,
  body: '',
});

describe('ruleActivatesFor', () => {
  test('a rule with no paths loads at launch: every file matches', () => {
    expect(ruleActivatesFor(rule('/work/app/.claude/rules/a.md', 'project', []), '/x/y', CWD)).toBe(
      true,
    );
  });

  test("a project rule's patterns are relative to the folder holding its `.claude`", () => {
    const nested = rule('/work/app/packages/web/.claude/rules/ui.md', 'project', ['src/**/*.tsx']);
    expect(ruleBase(nested, CWD)).toBe('/work/app/packages/web');
    expect(ruleActivatesFor(nested, '/work/app/packages/web/src/a/b.tsx', CWD)).toBe(true);
    expect(ruleActivatesFor(nested, '/work/app/src/a/b.tsx', CWD)).toBe(false);
  });

  test("a user rule's patterns are relative to the session's primary working directory", () => {
    const user = rule('/home/me/.claude/rules/ts.md', 'user', ['/*.md']);
    expect(ruleBase(user, CWD)).toBe(CWD);
    expect(ruleActivatesFor(user, '/work/app/README.md', CWD)).toBe(true);
    expect(ruleActivatesFor(user, '/work/app/docs/README.md', CWD)).toBe(false);
  });

  test('the glob format is the skill gate one: `*.md` anywhere, brace groups expanded', () => {
    const project = rule('/work/app/.claude/rules/x.md', 'project', ['*.md', 'src/*.{ts,tsx}']);
    expect(ruleActivatesFor(project, '/work/app/deep/down/a.md', CWD)).toBe(true);
    expect(ruleActivatesFor(project, '/work/app/src/a.tsx', CWD)).toBe(true);
    expect(ruleActivatesFor(project, '/work/app/src/x/a.ts', CWD)).toBe(false);
  });

  test('a file outside the base directory never matches; Windows paths match in POSIX form', () => {
    const project = rule('C:\\repo\\.claude\\rules\\x.md', 'project', ['**/*.ts']);
    const windows = { platform: 'windows' } as const;
    expect(ruleActivatesFor(project, 'C:\\repo\\src\\a.ts', 'C:\\repo', windows)).toBe(true);
    expect(ruleActivatesFor(project, 'C:\\other\\a.ts', 'C:\\repo', windows)).toBe(false);
  });
});
