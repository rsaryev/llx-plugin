/**
 * Compares `tests/support/tool-table.ts` (the tools table of tools-reference.md, copied by hand so
 * the tests never read the pulled docs) with the pulled page: the same tools, the same "Permission
 * required", and the rule format each tool's name takes. Returns the differences.
 */
import { join } from 'node:path';
import { TOOL_TABLE } from '../../tests/support/tool-table.ts';
import { DOCS_DIR } from '../docs/location.ts';
import { readToolsReference } from './mods-reference.ts';

/** The rule format of the page's "Rule format" table, by the tool the row is written for. */
const FORMATS: Readonly<Record<string, string>> = {
  Bash: 'command',
  PowerShell: 'powershell-command',
  Read: 'read-path',
  Edit: 'edit-path',
  Skill: 'skill-name',
  Agent: 'subagent-type',
  WebFetch: 'domain',
};

export async function toolTableDrift(): Promise<string[]> {
  const file = Bun.file(join(DOCS_DIR, 'tools-reference.md'));
  if (!(await file.exists())) return [];
  const { tools, ruleFormats } = readToolsReference(await file.text());
  const format = new Map<string, string>();
  for (const row of ruleFormats) {
    const id = FORMATS[row.rule.replace(/\(.*$/, '')];
    for (const tool of row.appliesTo) format.set(tool, id ?? 'bare');
  }
  const problems: string[] = [];
  const copied = new Map(TOOL_TABLE.map((row) => [row.tool, row]));
  for (const { tool, permissionRequired } of tools) {
    const row = copied.get(tool);
    if (!row) problems.push(`tests/support/tool-table.ts lacks the tool ${tool}`);
    else if (row.permissionRequired !== permissionRequired) {
      problems.push(`tool ${tool}: "Permission required" is ${permissionRequired} in the docs`);
    } else if (row.format !== (format.get(tool) ?? 'bare')) {
      problems.push(`tool ${tool}: the docs give the rule format ${format.get(tool) ?? 'bare'}`);
    }
  }
  const documented = new Set(tools.map((row) => row.tool));
  for (const row of TOOL_TABLE) {
    if (!documented.has(row.tool)) problems.push(`tool-table.ts has ${row.tool}, not in the docs`);
  }
  return problems;
}
