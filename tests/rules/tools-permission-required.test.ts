/**
 * tools-reference.md § Tools reference, the "Permission required" column: "shows whether the tool
 * prompts in Manual mode for paths inside the working directory". Asserted through `decide()` in
 * default (Manual) mode with `requiresPermission` taken from the catalog, on a call of each tool
 * inside `/work/app`; the expectation is the hand-copied column in `tests/support/tool-table.ts`.
 */
import { describe, expect, test } from 'bun:test';
import { toolRequiresPermission } from '../../src/rules/tools/catalog.ts';
import { decision } from '../support/decide.ts';
import { spec } from '../support/spec.ts';
import { TOOL_TABLE } from '../support/tool-table.ts';

const inManualMode = (tool: string, input: unknown) =>
  decision('default', tool, input, { requiresPermission: toolRequiresPermission });

for (const { tool, permissionRequired, input } of TOOL_TABLE) {
  spec(`tools.tool.${tool}`, () => {
    if (permissionRequired) {
      test(`Manual mode prompts for ${tool}`, () => {
        expect(inManualMode(tool, input)).toEqual({ outcome: 'ask', reason: 'default-prompt' });
      });
    } else if (tool === 'AskUserQuestion') {
      // The column says no permission; the tool is the question itself, which only the user answers.
      test(`Manual mode asks no permission for ${tool}, only the user's answer`, () => {
        expect(inManualMode(tool, input)).toEqual({
          outcome: 'ask',
          reason: 'requires-user-interaction',
        });
      });
    } else {
      test(`Manual mode runs ${tool} without a prompt`, () => {
        expect(inManualMode(tool, input).outcome).toBe('allow');
      });
    }
  });
}

describe('tools-reference.md note: file-access tools marked No still prompt outside the working directories', () => {
  test('Read, Grep and Glob outside /work/app ask even though the column says No', () => {
    expect(inManualMode('Read', { file_path: '/etc/hosts' }).outcome).toBe('ask');
    expect(inManualMode('Grep', { pattern: 'x', path: '/etc' }).outcome).toBe('ask');
    expect(inManualMode('Glob', { pattern: '*', path: '/etc' }).outcome).toBe('ask');
  });

  test('Bash is marked Yes but a built-in read-only command runs without a prompt', () => {
    expect(inManualMode('Bash', { command: 'ls -la' }).outcome).toBe('allow');
  });
});
