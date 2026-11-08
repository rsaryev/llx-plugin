/**
 * workflows.md § Edit a saved script (the `phases` rule: each entry is exactly the title passed to
 * `phase()`; the body: `phase()`, `log()`, `args`; "Timestamps and randomness": `Date.now()`,
 * `Math.random()` and a no-argument `new Date()` throw), § Behavior and limits ("a script that contains
 * `import()` fails before the run starts"). The kit reads the script and never runs it.
 */
import { expect, test } from 'bun:test';
import { readWorkflowMeta } from '../../src/format/workflow-meta.ts';
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

const script = (meta: string, body = BODY): string => `export const meta = ${meta}\n${body}`;

spec('workflows.behavior.Edit a saved script.phases', () => {
  const phased = (phases: string, body: string) =>
    script(`{ name: 'a', description: 'b', phases: ${phases} }`, body);

  test('each entry is exactly the title passed to phase(): matching titles group, nothing to report', () => {
    const report = inspectWorkflowScript(
      phased(
        "['Find', 'Audit']",
        "phase('Find')\nawait agent('x')\nphase(\"Audit\")\nawait agent('y')",
      ),
    );
    expect(report.phases).toEqual({
      declared: ['Find', 'Audit'],
      used: ['Find', 'Audit'],
      ownGroup: [],
      unused: [],
    });
    expect(report.issues).toEqual([]);
  });

  test('a phase() title with no entry gets a progress group of its own', () => {
    const report = inspectWorkflowScript(
      phased("['Find']", "phase('Find')\nphase('Report')\nawait agent('x')"),
    );
    expect(report.phases.ownGroup).toEqual(['Report']);
    expect(report.issues.map((found) => found.severity)).toEqual(['warning']);
    expect(report.issues[0]?.message).toContain('Report');
    expect(report.issues[0]?.message).toContain('group of its own');
  });

  test('titles match exactly: a different case or a trailing space is another title', () => {
    const report = inspectWorkflowScript(phased("['Find']", "phase('find')\nphase('Find ')"));
    expect(report.phases.ownGroup).toEqual(['find', 'Find ']);
    expect(report.phases.unused).toEqual(['Find']);
  });

  test('an entry no phase() call uses is reported as unused', () => {
    const report = inspectWorkflowScript(phased("['Find', 'Audit']", "phase('Find')"));
    expect(report.phases.unused).toEqual(['Audit']);
    expect(report.issues.map((found) => found.severity)).toEqual(['warning']);
  });

  test('without phases in meta every phase() is its own group and is not a problem', () => {
    const report = inspectWorkflowScript(
      script("{ name: 'a', description: 'b' }", "phase('One')\nphase('Two')"),
    );
    expect(report.phases).toEqual({ declared: [], used: ['One', 'Two'], ownGroup: [], unused: [] });
    expect(report.issues).toEqual([]);
  });

  test('phases that is not a list of strings is not a literal title list: ignored with a warning', () => {
    const read = readWorkflowMeta(script("{ name: 'a', description: 'b', phases: 'Find' }"));
    expect(read.meta?.phases).toEqual([]);
    expect(read.issues.map((found) => found.path)).toEqual(['meta.phases']);
  });
});

spec('workflows.behavior.Edit a saved script.Body', () => {
  test('phase(), log() and the args global are body calls: phase titles are read from the body', () => {
    const report = inspectWorkflowScript(
      script(
        "{ name: 'a', description: 'b' }",
        "phase('Plan')\nlog('starting')\nconst n = args.count\nawait pipeline(args.items, x => agent(x))",
      ),
    );
    expect(report.phases.used).toEqual(['Plan']);
    expect(report.readsArgs).toBe(true);
    expect(report.issues).toEqual([]);
  });

  test('a phase() call in a comment or a string is not a phase', () => {
    const report = inspectWorkflowScript(
      script(
        "{ name: 'a', description: 'b' }",
        "// phase('Old')\n/* phase('Older') */\nconst s = \"phase('Text')\"\nconst t = `phase('Tpl')`\nphase('Real')",
      ),
    );
    expect(report.phases.used).toEqual(['Real']);
  });

  test('a phase() whose title is not a literal is not a known title', () => {
    const report = inspectWorkflowScript(
      script("{ name: 'a', description: 'b' }", "phase(title)\nphase(`x${y}`)\nphase('Known')"),
    );
    expect(report.phases.used).toEqual(['Known']);
  });

  test('the args global is read only where it is a name: a property or a word in text is not', () => {
    const none = inspectWorkflowScript(
      script(
        "{ name: 'a', description: 'b' }",
        "const a = ctx.args\nconst s = 'args'\n// args\nawait agent(`${files}`)",
      ),
    );
    expect(none.readsArgs).toBe(false);
    const some = inspectWorkflowScript(
      script("{ name: 'a', description: 'b' }", 'log(`${args.q}`)'),
    );
    expect(some.readsArgs).toBe(true);
  });

  test("a script that is not valid JavaScript is the runtime's to report: the kit reports no syntax error", () => {
    const report = inspectWorkflowScript(
      script("{ name: 'a', description: 'b' }", 'const = ;;; await ((('),
    );
    expect(report.meta?.name).toBe('a');
    expect(report.issues).toEqual([]);
  });
});

spec('workflows.behavior.Edit a saved script.Timestamps and randomness', () => {
  const found = (body: string) =>
    inspectWorkflowScript(script("{ name: 'a', description: 'b' }", body)).issues;

  test('Date.now(), Math.random() and a no-argument new Date() are reported: they throw in the script', () => {
    for (const body of [
      'const t = Date.now()',
      'const t = Date . now ( )',
      'const r = Math.random()',
      'const d = new Date()',
      'const d = new Date( )',
      'const d = new Date',
      'log(`at ${Date.now()}`)',
    ]) {
      const issues = found(body);
      expect(issues.map((issue) => issue.severity)).toEqual(['warning']);
      expect(issues[0]?.message).toContain('args');
    }
  });

  test('new Date with an argument is deterministic and passes', () => {
    for (const body of [
      "const d = new Date('2026-01-01')",
      'const d = new Date(args.timestamp)',
      'const d = new Date(0)',
      'const m = Math.max(1, 2)',
      'Date.parse(args.t)',
      'const d = new DateRange()',
    ]) {
      expect(found(body)).toEqual([]);
    }
  });

  test('a mention in a comment, a string or a regular expression is not a call', () => {
    for (const body of [
      '// Date.now() is banned',
      '/* Math.random() */',
      "const s = 'Date.now()'",
      'const re = /Date.now()/',
      'const t = `no Math.random() here`',
    ]) {
      expect(found(body)).toEqual([]);
    }
  });

  test('every call is reported, each with its line', () => {
    const issues = found('const a = Date.now()\nconst b = Math.random()');
    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.path)).toEqual(['script:2', 'script:3']);
  });
});

spec('workflows.behavior.Behavior and limits.import()', () => {
  const found = (body: string) =>
    inspectWorkflowScript(script("{ name: 'a', description: 'b' }", body)).issues;

  test('a script that contains import() fails before the run starts: reported as an error that names the way out', () => {
    for (const body of [
      "const lib = await import('lodash')",
      "const lib = await import ( 'lodash' )",
      'const m = import(`./${args.file}.js`)',
      "await agent('x')\nif (args) { await import('x') }",
    ]) {
      const issues = found(body);
      expect(issues.map((issue) => issue.severity)).toEqual(['error']);
      expect(issues[0]?.message).toContain("agent's task");
    }
  });

  test('a mention in a comment, a string or a regular expression is not an import() call', () => {
    for (const body of [
      '// import() is not allowed',
      "const s = 'import(x)'",
      'const t = `use import() never`',
      'const re = /import(x)/',
    ]) {
      expect(found(body)).toEqual([]);
    }
  });

  test('a property named import or a name that only starts with it is not the call', () => {
    for (const body of [
      'const f = lib.import(1)',
      'const g = important(1)',
      'const h = reimport(2)',
    ]) {
      expect(found(body)).toEqual([]);
    }
  });

  test('every import() is reported with its line', () => {
    const issues = found("await import('a')\nawait import('b')");
    expect(issues.map((issue) => issue.path)).toEqual(['script:2', 'script:3']);
  });
});
