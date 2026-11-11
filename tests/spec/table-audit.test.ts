/** Mixed-table audit regression tests (docs/SPEC.md), not compatibility claims. */
import { expect, test } from 'bun:test';
import { parsePage } from '../../scripts/spec/markdown.ts';
import { createTableAudit } from '../../scripts/spec/table-audit.ts';
import type { TableRule } from '../../scripts/spec/sources.ts';

const page = parsePage(
  '## Variables\n\n| Name | Topic |\n| --- | --- |\n| `PLUGIN` | plugin |\n| `HOOK` | hook |\n| `MODEL` | model |\n',
);
const rule: TableRule = {
  category: 'environment',
  page: 'env-vars.md',
  section: /^Variables$/,
  prefix: () => 'environment.host',
  where: (row) => row[1] === 'plugin',
};

test('a row accepted by a second rule is not falsely excluded by the first rule', () => {
  const audit = createTableAudit();
  audit.visit(rule, page);
  audit.visit(
    { ...rule, where: (row) => row[1] === 'hook', excludedRowReason: () => 'model' },
    page,
  );
  expect(audit.excluded()).toEqual([
    { page: 'env-vars.md', section: 'Variables — MODEL', reason: 'model' },
  ]);
});

test('a full-table rule admits every row and leaves no misleading exclusions', () => {
  const audit = createTableAudit();
  audit.visit(rule, page);
  audit.visit({ ...rule, where: () => true }, page);
  expect(audit.excluded()).toEqual([]);
});
