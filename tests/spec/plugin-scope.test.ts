/** Owner-approved plugin-host boundary (docs/SPEC.md; spec/scope-audit.md), not compatibility claims. */
import { expect, test } from 'bun:test';
import { parsePage } from '../../scripts/spec/markdown.ts';
import { auditPage } from '../../scripts/spec/sections.ts';
import { SCOPES } from '../../scripts/spec/scopes.ts';
import {
  FOREIGN_ENVIRONMENT,
  FOREIGN_FLAGS,
  PLUGIN_GLOBAL_ENV,
} from '../../scripts/spec/row-scope.ts';
import excludedPages from '../../spec/out-of-scope-pages.json';

test('native runtime and SDK clients are explicit page exclusions, not optional proof-driven filters', () => {
  for (const page of ['memory.md', 'commands.md', 'scheduled-tasks.md', 'agent-sdk/plugins.md']) {
    expect(SCOPES.some((scope) => scope.page === page)).toBe(false);
    expect(excludedPages.some((entry) => entry.page === page)).toBe(true);
  }
});

test('all plugin formats, hook execution, policies and mod UI remain audited', () => {
  for (const page of [
    'plugins/manifest-reference.md',
    'plugins/components.md',
    'plugins/loading.md',
    'hooks.md',
    'permissions.md',
    'mcp.md',
    'managed-mcp.md',
    'plugins/org.md',
    'plugins/relevance.md',
    'channels-reference.md',
    'plugins/mods/reference.md',
    'plugins/mods/interface.md',
  ]) {
    expect(SCOPES.some((scope) => scope.page === page)).toBe(true);
    expect(excludedPages.some((entry) => entry.page === page)).toBe(false);
  }
});

test('a new plugin section is included by default without waiting for a test or an allowlist edit', () => {
  const scope = SCOPES.find((entry) => entry.page === 'plugins/components.md');
  if (!scope) throw new Error('plugin components must be audited');
  const audit = auditPage(
    scope,
    parsePage('## A newly documented plugin capability\n\nA new behavioral rule.\n'),
    new Set(),
  );
  expect(audit.requirements).toHaveLength(1);
  expect(audit.requirements[0]?.section).toBe('A newly documented plugin capability');
  expect(audit.excluded).toEqual([]);
});

test('foreign variable exclusions do not remove real plugin, hook or mod controls', () => {
  for (const name of [
    'CLAUDE_CODE_PLUGIN_DIRS',
    'CLAUDE_CODE_PLUGIN_DIR_WATCH',
    'CLAUDE_CODE_DISABLE_POLICY_SKILLS',
    'CLAUDE_CODE_SYNC_PLUGIN_INSTALL',
    'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB',
    'CLAUDE_ENV_FILE',
  ])
    expect(FOREIGN_ENVIRONMENT[name]).toBeUndefined();
  expect(FOREIGN_ENVIRONMENT['CLAUDE_CODE_SYNC_SKILLS']).toBe('service');
  expect(FOREIGN_FLAGS.has('--plugin-dir')).toBe(false);
  expect(FOREIGN_FLAGS.has('--permission-mode')).toBe(false);
  expect(PLUGIN_GLOBAL_ENV.has('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC')).toBe(true);
});
