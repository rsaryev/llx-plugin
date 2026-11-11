/**
 * memory.md § Rule frontmatter reference: "`paths` is the only field Claude Code reads from a rule;
 * any other field is ignored without an error. Claude Code removes the frontmatter before loading
 * the rule into context"; `paths` "Accepts a YAML list or a comma-separated string"; "If the YAML
 * between the markers doesn't parse, Claude Code ignores the frontmatter and loads the rule as if it
 * had no `paths`". memory.md is an engine page (spec/out-of-scope-pages.json), so no requirement
 * holds it: judgment `memoryRules` (spec/judgments.md), tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { readMemoryRule } from '../../src/format/memory-rule.ts';

const read = (text: string) => readMemoryRule('/p/.claude/rules/api.md', text, 'project');

describe('readMemoryRule', () => {
  test('a YAML list of paths, and the body without the frontmatter', () => {
    const found = read('---\npaths:\n  - "src/api/**/*.ts"\n  - "lib/*.ts"\n---\n# API rules\n');
    expect(found).toEqual({
      rule: {
        path: '/p/.claude/rules/api.md',
        scope: 'project',
        paths: ['src/api/**/*.ts', 'lib/*.ts'],
        body: '# API rules\n',
      },
      issues: [],
    });
  });

  test('a comma-separated string, with brace groups kept whole', () => {
    expect(read('---\npaths: src/**/*.{ts,tsx}, lib/**/*.ts\n---\nB').rule.paths).toEqual([
      'src/**/*.{ts,tsx}',
      'lib/**/*.ts',
    ]);
  });

  test('no frontmatter, or no paths: a rule loaded at launch; another field is ignored silently', () => {
    expect(read('Always do X.\n').rule).toMatchObject({ paths: [], body: 'Always do X.\n' });
    expect(read('---\ndescription: d\nname: n\n---\nB')).toMatchObject({
      rule: { paths: [], body: 'B' },
      issues: [],
    });
  });

  test('YAML that does not parse: no paths, the body after the markers, and a warning', () => {
    const found = read('---\n  a: 1\n b: 2\n---\nBody');
    expect(found.rule).toMatchObject({ paths: [], body: 'Body' });
    expect(found.issues.map((issue) => issue.severity)).toEqual(['warning']);
  });

  test('paths that are not a list or text: none, with a warning', () => {
    const found = read('---\npaths: 3\n---\nB');
    expect(found.rule.paths).toEqual([]);
    expect(found.issues).toHaveLength(1);
  });
});
