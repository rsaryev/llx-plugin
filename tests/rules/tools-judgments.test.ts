/**
 * The catalog's judgments (spec/judgments.md): what the tools table leaves open. Outside spec(),
 * so none of it counts as compatibility.
 */
import { describe, expect, test } from 'bun:test';
import { SDK_ONLY_TOOLS } from '../../src/protocol/tool-names.ts';
import {
  catalogEntry,
  isKnownTool,
  toolRequiresPermission,
} from '../../src/rules/tools/catalog.ts';
import { decision } from '../support/decide.ts';

describe('judgment: a name the table does not list', () => {
  test('has no catalog entry and prompts in Manual mode', () => {
    expect(catalogEntry('mcp__github__get_issue')).toBeUndefined();
    expect(toolRequiresPermission('mcp__github__get_issue')).toBe(true);
    const asked = decision(
      'default',
      'mcp__github__get_issue',
      {},
      {
        requiresPermission: toolRequiresPermission,
      },
    );
    expect(asked).toEqual({ outcome: 'ask', reason: 'default-prompt' });
  });

  test('an SDK-only tool is a known name with no claim about its prompt beyond asking', () => {
    for (const tool of SDK_ONLY_TOOLS) {
      expect(isKnownTool(tool)).toBe(true);
      expect(toolRequiresPermission(tool)).toBe(true);
    }
  });
});
