/**
 * workflows.md § Edit a saved script (the `meta` block and the body: "If the body has a syntax error,
 * Claude Code reports it when you run the workflow"); agent-sdk/typescript.md § Workflow. What the docs
 * leave open (a lexical problem after the `meta` statement, `whenToUse`, object `phases` entries, line
 * endings, a shebang) is a judgment, tested outside spec().
 */
import { describe, expect, test } from 'bun:test';
import { readWorkflowMeta } from '../../src/format/workflow-meta.ts';
import { rewriteWorkflowMeta } from '../../src/format/workflow-meta-rewrite.ts';

const BODY = "const found = await agent('List every .ts file.')\nreturn found\n";

const AUDIT_ROUTES = `export const meta = {
  name: 'audit-routes',
  description: 'Audit every route handler for missing auth checks',
}
${BODY}`;

const script = (meta: string, body = BODY): string => `export const meta = ${meta}\n${body}`;
const messages = (issues: readonly { readonly message: string }[]) =>
  issues.map((found) => found.message);

describe('workflow meta fields and rewrites (judgments)', () => {
  test('a whenToUse that is not a string stays among the other fields', () => {
    const read = readWorkflowMeta(script("{ name: 'a', description: 'b', whenToUse: 3 }"));
    expect(read.meta?.whenToUse).toBeUndefined();
    expect(read.meta?.extra).toEqual({ whenToUse: 3 });
  });

  test('an object phase entry keeps its other fields, in the read and in a rewrite that gives it back', () => {
    const text = script(
      "{ name: 'a', description: 'b', phases: ['Scan', { title: 'Fix', detail: 'apply', model: 'opus' }] }",
    );
    const meta = readWorkflowMeta(text).meta;
    expect(meta?.phases).toEqual(['Scan', 'Fix']);
    expect(meta?.phaseEntries).toEqual(['Scan', { title: 'Fix', detail: 'apply', model: 'opus' }]);
    const edited = rewriteWorkflowMeta(text, { phases: [...(meta?.phaseEntries ?? []), 'Ship'] });
    const again = readWorkflowMeta(edited.source ?? '').meta;
    expect(again?.phaseEntries).toEqual([
      'Scan',
      { title: 'Fix', detail: 'apply', model: 'opus' },
      'Ship',
    ]);
  });

  test('a rewrite sets whenToUse, replacing or adding it', () => {
    const added = rewriteWorkflowMeta(AUDIT_ROUTES, { whenToUse: "when it's asked" });
    expect(readWorkflowMeta(added.source ?? '').meta?.whenToUse).toBe("when it's asked");
    const replaced = rewriteWorkflowMeta(added.source ?? '', { whenToUse: 'later' });
    expect(readWorkflowMeta(replaced.source ?? '').meta?.whenToUse).toBe('later');
  });

  test('a rewrite that adds a field to a CRLF file adds it with CRLF, and no bare LF', () => {
    const text = AUDIT_ROUTES.replaceAll('\n', '\r\n');
    const edited = rewriteWorkflowMeta(text, { phases: ['A'] }).source ?? '';
    expect(edited).toContain("  phases: ['A'],\r\n}");
    expect(edited.replaceAll('\r\n', '')).not.toContain('\n');
    const noTrailing =
      "export const meta = {\r\n  name: 'a',\r\n  description: 'b'\r\n}\r\nreturn 1\r\n";
    const second = rewriteWorkflowMeta(noTrailing, { phases: ['A'] }).source ?? '';
    expect(second.replaceAll('\r\n', '')).not.toContain('\n');
    expect(readWorkflowMeta(second).meta?.phases).toEqual(['A']);
  });

  test('a rewrite of an LF file adds with LF', () => {
    const edited = rewriteWorkflowMeta(AUDIT_ROUTES, { phases: ['A'] }).source ?? '';
    expect(edited).not.toContain('\r');
  });

  test('a lexical problem in the body leaves a valid meta alone: the runtime reports it when the workflow runs', () => {
    const META = "{ name: 'a', description: 'b', phases: ['One'] }";
    for (const body of [
      "const s = 'abc",
      'const t = `abc ${1}',
      'const t = `abc',
      '/* never closed',
      'const t = `a${ `b',
    ]) {
      const text = `export const meta = ${META}\n${body}\n`;
      const read = readWorkflowMeta(text);
      expect(read.issues).toEqual([]);
      expect(read.meta).toMatchObject({ name: 'a', description: 'b', phases: ['One'] });
      const edited = rewriteWorkflowMeta(text, { description: 'c' });
      expect(edited.source).toBe(text.replace("description: 'b'", "description: 'c'"));
    }
    const noStop = readWorkflowMeta(`export const meta = ${META} /*`);
    expect(noStop.meta?.name).toBe('a');
  });

  test('a lexical problem before or inside the meta literal is the one "not valid JavaScript" error', () => {
    for (const text of [
      "export const meta = { name: 'a, description: 'b' }\n",
      "export const meta = { name: 'a', description: `b }\n",
      "export const meta = { name: 'a', /* open\n",
      'export const meta = /* open',
      "/* open\nexport const meta = { name: 'a', description: 'b' }",
    ]) {
      const read = readWorkflowMeta(text);
      expect(read.meta).toBeUndefined();
      expect(messages(read.issues)).toHaveLength(1);
      expect(messages(read.issues)[0]).toContain('not valid JavaScript');
    }
  });
});
