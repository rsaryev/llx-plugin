/**
 * Limits of the workflow script readers (judgments, spec/judgments.md): they never throw, whatever
 * the nesting (#5); a script's line numbers cost one pass (#12); reading only `meta` stops at the
 * end of the `meta` statement (#13); a rewrite writes only values a literal can hold (#14).
 */
import { describe, expect, test } from 'bun:test';
import { tokenize } from '../../src/format/js-tokens.ts';
import { readScriptHead, readWorkflowMeta } from '../../src/format/workflow-meta.ts';
import { inspectWorkflowScript } from '../../src/format/workflow-script.ts';
import { rewriteWorkflowMeta } from '../../src/format/workflow-meta-rewrite.ts';

const META = "export const meta = { name: 'a', description: 'b' }\n";

describe('workflow script limits', () => {
  test('#5: templates nested past the stack are a problem, not a throw', () => {
    const depth = 200_000;
    const nested = `${'`${'.repeat(depth)}x${'}`'.repeat(depth)}`;
    expect(() => tokenize(nested)).not.toThrow();
    expect(tokenize(nested).problem).toContain('nested too deep');
    const read = readWorkflowMeta(`export const meta = { name: ${nested}, description: 'b' }`);
    expect(read.meta).toBeUndefined();
    expect(read.issues.map((found) => found.severity)).toEqual(['error']);
  });

  test('#5: a literal nested past the stack is an issue, not a throw', () => {
    const depth = 200_000;
    const source = `export const meta = { name: 'a', description: 'b', x: ${'['.repeat(depth)}${']'.repeat(depth)} }`;
    expect(() => readWorkflowMeta(source)).not.toThrow();
    expect(
      readWorkflowMeta(source)
        .issues.map((found) => found.message)
        .join(' '),
    ).toContain('nested too deep');
  });

  test('#12: the line of every finding in a long script is found in one pass', () => {
    const body = 'const t = Date.now()\n'.repeat(25_000);
    const started = performance.now();
    const report = inspectWorkflowScript(META + body);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(report.issues.at(-1)?.path).toBe('script:25001');
  });

  test('#13: reading the meta tokenizes the head only; inspecting reads the whole script', () => {
    const source = `${META};\nconst x = 1\nconst y = 2\n`;
    const head = readScriptHead(source, 'head');
    expect(head.meta?.name).toBe('a');
    expect(head.tokens.at(-1)?.text).toBe(';');
    expect(readScriptHead(source, 'whole').tokens.at(-1)?.text).toBe('2');
  });

  test('#14: a rewrite writes NaN, Infinity and undefined as a literal can hold them, as JSON does', () => {
    const edited = rewriteWorkflowMeta(META, {
      phases: [{ title: 'Fix', weight: Number.NaN, size: Infinity, note: undefined, ok: true }],
    });
    expect(edited.source).toContain("{ title: 'Fix', weight: null, size: null, ok: true }");
    expect(readWorkflowMeta(edited.source ?? '').meta?.phaseEntries).toEqual([
      { title: 'Fix', weight: null, size: null, ok: true },
    ]);
  });
});
