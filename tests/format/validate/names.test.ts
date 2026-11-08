/** The wording `claude plugin validate` 2.1.319 gives a plugin name (docs/SPEC.md, "Sources of truth"). */
import { describe, expect, test } from 'bun:test';
import { spec } from '../../support/spec.ts';
import { nameReservedIssues, nameValidationIssues } from '../../../src/format/names.ts';

const messages = (name: string, skipReserved = false, context: 'manifest' | 'entry' = 'manifest') =>
  nameValidationIssues(name, skipReserved, context).map((issue) => [issue.severity, issue.message]);

const SYNC =
  'Claude.ai marketplace sync requires kebab-case (lowercase letters, digits, and hyphens only, e.g., "my-plugin").';

spec(
  'marketplace.troubleshooting.Marketplace validation errors.Plugin name "<name>" is not kebab-case',
  () => {
    test('a name Claude Code still installs is a warning', () => {
      expect(messages('MyPlugin')).toEqual([
        [
          'warning',
          `Plugin name "MyPlugin" is not kebab-case. Claude Code accepts it, but the ${SYNC}`,
        ],
      ]);
    });
  },
);

describe('not kebab-case: the advice depends on how badly the name breaks', () => {
  test('a name it cannot install from a marketplace', () => {
    expect(messages('my_plugin_é')[0]?.[1]).toContain(
      'Claude Code cannot install it from a marketplace',
    );
  });

  test('a name it refuses when loaded by path', () => {
    expect(messages('a:b')[0]?.[1]).toContain(
      'refuses a plugin with this name when it is loaded by path',
    );
  });
});

describe('reserved names', () => {
  test('the manifest points to the marketplace of Anthropic’s own plugins, an entry does not', () => {
    const [manifest] = nameReservedIssues('claude-helper', 'manifest');
    const [entry] = nameReservedIssues('claude-helper', 'entry');
    expect(manifest?.message).toEndWith('validate the marketplace that lists it.');
    expect(entry?.message).toEndWith('Name it for what it does.');
    expect(manifest?.severity).toBe('error');
  });

  test('a brand word elsewhere in the name only reads as Anthropic’s own', () => {
    expect(messages('mcp-for-claude')).toEqual([
      [
        'warning',
        'Plugin name "mcp-for-claude" reads as one of Anthropic\'s own. Name it for what it does. If this is one of Anthropic\'s own plugins, validate the marketplace that lists it.',
      ],
    ]);
  });

  test('the report is left out when the plugin is listed by an official marketplace', () => {
    expect(messages('claude-helper', true)).toEqual([]);
  });
});
