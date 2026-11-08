/**
 * workflows.md § What the saved script looks like (the `audit-routes` script: a `meta` block, then a
 * body), § Edit a saved script (the four rules for `meta`, the body, `phases`, timestamps and
 * randomness); plugins/components.md § Workflows (the same script as `/my-plugin:audit-routes`);
 * agent-sdk/typescript.md § Workflow (`script` "must begin with `export const meta = { name,
 * description }` as a literal"). The kit reads and rewrites the literal without running the script.
 * What the docs leave open (comments, quoting, what a rewrite keeps) is a judgment, tested outside
 * spec().
 */
import { describe, expect, test } from 'bun:test';
import { readWorkflowMeta, rewriteWorkflowMeta } from '../../src/format/workflow-meta.ts';
import { inspectWorkflowScript } from '../../src/format/workflow-script.ts';
import { spec } from '../support/spec.ts';

const BODY = `
const found = await agent('List every .ts file under src/routes/.', {
  schema: { type: 'object', required: ['files'], properties: { files: { type: 'array', items: { type: 'string' } } } },
})

const audits = await pipeline(found.files, file =>
  agent(\`Audit \${file} for missing authentication checks.\`, { label: file }),
)

return audits.filter(Boolean)
`;

const AUDIT_ROUTES = `export const meta = {
  name: 'audit-routes',
  description: 'Audit every route handler for missing auth checks',
}
${BODY}`;

const script = (meta: string, body = BODY): string => `export const meta = ${meta}\n${body}`;
const messages = (issues: readonly { readonly message: string }[]) =>
  issues.map((found) => found.message);

spec('workflows.behavior.What the saved script looks like', () => {
  test('the docs script: the meta block holds the name and the description', () => {
    const read = readWorkflowMeta(AUDIT_ROUTES);
    expect(read.issues).toEqual([]);
    expect(read.meta).toMatchObject({
      name: 'audit-routes',
      description: 'Audit every route handler for missing auth checks',
      phases: [],
    });
  });

  test('the meta block is read, never run: the body cannot execute and a getter-free literal is data', () => {
    const marked = script(
      "{ name: 'a', description: 'b' }",
      "globalThis.__workflowBodyRan = true\nthrow new Error('never')\nawait agent('x')",
    );
    const read = readWorkflowMeta(marked);
    expect(read.meta?.name).toBe('a');
    expect(Reflect.get(globalThis, '__workflowBodyRan')).toBeUndefined();
  });

  test('the body is what follows the meta block, untouched, top-level await and return included', () => {
    const report = inspectWorkflowScript(AUDIT_ROUTES);
    expect(report.body.trim().startsWith('const found = await agent(')).toBe(true);
    expect(report.body.trim().endsWith('return audits.filter(Boolean)')).toBe(true);
    expect(`${report.header}${report.body}`).toBe(AUDIT_ROUTES);
  });

  test('a script that does not begin with export const meta has no meta, with a reason', () => {
    for (const text of [
      "const x = 1\nexport const meta = { name: 'a', description: 'b' }",
      '',
      'agent("x")',
    ]) {
      const read = readWorkflowMeta(text);
      expect(read.meta).toBeUndefined();
      expect(read.issues.map((found) => found.severity)).toEqual(['error']);
      expect(read.issues[0]?.path).toBe('meta');
    }
  });
});

spec('workflows.behavior.Edit a saved script.meta block', () => {
  test('keep export const meta as the first statement: comments and blank lines before it are fine', () => {
    const text = `// audit\n/* routes */\n\n${AUDIT_ROUTES}`;
    expect(readWorkflowMeta(text).meta?.name).toBe('audit-routes');
  });

  test('a plain object literal with a name and a description is a workflow', () => {
    for (const meta of [
      "{ name: 'a', description: 'b' }",
      '{ "name": "a", "description": "b" }',
      '{ name: `a`, description: "b", }',
      "{ description: 'b', name: 'a', phases: ['one', 'two',] }",
    ]) {
      const read = readWorkflowMeta(script(meta));
      expect(read.issues).toEqual([]);
      expect(read.meta?.name).toBe('a');
      expect(read.meta?.description).toBe('b');
    }
  });

  test('anything but literal values drops /<name>: a variable, a call, a spread', () => {
    const cases = [
      "{ name: NAME, description: 'b' }",
      "{ name: 'a', description: describe() }",
      "{ name: 'a', ...shared }",
      "{ name: 'a', description: 'b' + 'c' }",
      "{ name: 'a', description: `b ${x}` }",
      "{ name: 'a', description: 'b', phases: [first] }",
      "{ name: 'a', description: 'b', [key]: 1 }",
      "{ name: 'a', description }",
      "{ name: 'a', description: 'b', run() {} }",
      "{ name: 'a', description: undefined }",
      "{ name: 'a', description: new String('b') }",
    ];
    for (const meta of cases) {
      const read = readWorkflowMeta(script(meta));
      expect(read.meta).toBeUndefined();
      expect(read.issues.map((found) => found.severity)).toEqual(['warning']);
      expect(read.issues[0]?.message).toContain('autocomplete');
    }
  });

  test('without a name or without a description it is not a workflow', () => {
    for (const meta of [
      "{ description: 'b' }",
      "{ name: 'a' }",
      "{ name: '', description: 'b' }",
      "{ name: 1, description: 'b' }",
      "{ name: 'a', description: 2 }",
    ]) {
      const read = readWorkflowMeta(script(meta));
      expect(read.meta).toBeUndefined();
      expect(read.issues.map((found) => found.severity)).toEqual(['error']);
    }
    expect(readWorkflowMeta(script("{ description: 'b' }")).issues[0]?.path).toBe('meta.name');
    expect(readWorkflowMeta(script("{ name: 'a' }")).issues[0]?.path).toBe('meta.description');
  });

  test('a rewrite changes the named fields and keeps every other byte, the body included', () => {
    const edited = rewriteWorkflowMeta(AUDIT_ROUTES, { description: 'Audit routes for authz' });
    expect(edited.issues).toEqual([]);
    expect(edited.source).toBe(
      AUDIT_ROUTES.replace(
        "'Audit every route handler for missing auth checks'",
        "'Audit routes for authz'",
      ),
    );
    expect(readWorkflowMeta(edited.source ?? '').meta?.description).toBe('Audit routes for authz');
  });

  test('a rewrite adds a field that is not there and the result is still a literal', () => {
    const edited = rewriteWorkflowMeta(AUDIT_ROUTES, { phases: ['List', 'Audit'] });
    const read = readWorkflowMeta(edited.source ?? '');
    expect(read.issues).toEqual([]);
    expect(read.meta?.phases).toEqual(['List', 'Audit']);
    expect(read.meta?.name).toBe('audit-routes');
    expect(edited.source?.endsWith(BODY)).toBe(true);
  });

  test('a rewrite of a meta that is not a literal changes nothing and says why', () => {
    const text = script("{ name: NAME, description: 'b' }");
    const edited = rewriteWorkflowMeta(text, { description: 'x' });
    expect(edited.source).toBeUndefined();
    expect(messages(edited.issues)[0]).toContain('autocomplete');
  });

  test('a rewrite never produces a meta without a name or a description', () => {
    for (const patch of [{ name: '' }, { description: '   ' }]) {
      const edited = rewriteWorkflowMeta(AUDIT_ROUTES, patch);
      expect(edited.source).toBeUndefined();
      expect(edited.issues.map((found) => found.severity)).toEqual(['error']);
    }
  });

  test('values with quotes, backslashes and line breaks survive a rewrite', () => {
    const description = 'It\'s a "test" \\ with\nlines and ${not} `ticks`';
    const edited = rewriteWorkflowMeta(AUDIT_ROUTES, { description });
    expect(readWorkflowMeta(edited.source ?? '').meta?.description).toBe(description);
  });
});

describe('workflow script reading (judgments)', () => {
  test('comments inside the meta block are skipped when reading and survive a rewrite of another field', () => {
    const text = script("{\n  // the id\n  name: 'a', /* shown in / */\n  description: 'b',\n}");
    expect(readWorkflowMeta(text).meta).toMatchObject({ name: 'a', description: 'b' });
    const edited = rewriteWorkflowMeta(text, { description: 'c' }).source ?? '';
    expect(edited).toContain('// the id');
    expect(edited).toContain('/* shown in / */');
  });

  test('other literal fields are kept as data, not interpreted', () => {
    const read = readWorkflowMeta(
      script(
        "{ name: 'a', description: 'b', whenToUse: 'often', limits: { agents: 3, deep: [1, null, true] } }",
      ),
    );
    expect(read.meta?.extra).toEqual({
      whenToUse: 'often',
      limits: { agents: 3, deep: [1, null, true] },
    });
  });

  test('string escapes read as JavaScript reads them', () => {
    const read = readWorkflowMeta(
      script("{ name: 'a\\'b', description: \"line\\nbreak \\u00e9 \\x41 tab\\t\" }"),
    );
    expect(read.meta?.name).toBe("a'b");
    expect(read.meta?.description).toBe('line\nbreak é A tab\t');
  });

  test('a regular expression with a slash in a class does not hide the call after it', () => {
    const issues = inspectWorkflowScript(
      script("{ name: 'a', description: 'b' }", 'const re = /[/]x/; const t = Date.now()'),
    ).issues;
    expect(issues).toHaveLength(1);
  });

  test('an unterminated comment, string or meta block is not a meta, never an exception', () => {
    for (const text of [
      "export const meta = { name: 'a",
      "export const meta = { name: 'a', description: 'b'",
      'export const meta = /* open',
      'export const meta =',
      "export const meta = { name: 'a', description: 'b' } /*",
    ]) {
      const read = readWorkflowMeta(text);
      expect(read.meta).toBeUndefined();
      expect(read.issues.length).toBeGreaterThan(0);
    }
  });

  test('the first statement is found after a byte order mark and a shebang line is not a statement', () => {
    expect(readWorkflowMeta(`﻿${AUDIT_ROUTES}`).meta?.name).toBe('audit-routes');
  });
});
