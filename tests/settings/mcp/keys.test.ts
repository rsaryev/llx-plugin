/**
 * settings-reference.md § `enableAllProjectMcpServers` (Boolean; "Scope: Any file. In a folder whose
 * trust dialog you haven't accepted, Claude Code honors it from user settings, managed settings, and
 * `--settings` and ignores it in the shared project file"; `false` "asks you to approve each server. In
 * a trusted folder, a `false` in a higher-precedence file overrides a `true` in a lower one; in a
 * folder you haven't trusted, a `true` in any honored file is enough"; default unset), §
 * `enabledMcpjsonServers` (array of strings, the names as they appear in `.mcp.json`; the example
 * approves `memory` and `github`), § `disabledMcpjsonServers` ("A rejection in any settings file
 * applies, including a project `.claude/settings.json` checked into the repository"; "Rejection takes
 * precedence over `enabledMcpjsonServers` and `enableAllProjectMcpServers`"), and managed-settings.md
 * § "Find entries Claude Code dropped" (an entry that cannot be read is dropped with a warning).
 */
import { describe, expect, test } from 'bun:test';
import { KEY_SPECS } from '../../../src/settings/index.ts';
import { spec } from '../../support/spec.ts';
import { issuesOf, layerOf } from '../../support/settings-layers.ts';
import { resolved } from '../../support/policy-context.ts';

const names = ['memory', 'github', 'filesystem'];
const statuses = (
  sources: Parameters<typeof resolved>[0],
  folderTrusted = true,
): Record<string, string> =>
  Object.fromEntries(
    resolved(sources, { isFolderTrusted: () => folderTrusted })
      .mcp.projectServerApproval(names)
      .map((each) => [each.name, each.status]),
  );

spec('mcpSettings.key.enableAllProjectMcpServers', () => {
  test('is read from any file and is a Boolean', () => {
    expect(KEY_SPECS.enableAllProjectMcpServers.scopes).toBe('any');
    for (const scope of ['user', 'project', 'local', 'flag', 'managed'] as const) {
      const read = layerOf(scope, { enableAllProjectMcpServers: true });
      expect(read.settings.enableAllProjectMcpServers).toBe(true);
      expect(issuesOf(scope, { enableAllProjectMcpServers: true })).toEqual([]);
    }
  });

  test('a value that is no Boolean is dropped with a warning, even the text "true"', () => {
    const issues = issuesOf('user', { enableAllProjectMcpServers: 'true' });
    expect(layerOf('user', { enableAllProjectMcpServers: 'true' }).settings).toEqual({});
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
  });

  test('true approves every server; unset asks for each', () => {
    expect(Object.values(statuses([['user', { enableAllProjectMcpServers: true }]]))).toEqual([
      'approved',
      'approved',
      'approved',
    ]);
    expect(Object.values(statuses([['user', {}]]))).toEqual([
      'pending approval',
      'pending approval',
      'pending approval',
    ]);
  });

  test('in a trusted folder a false in a higher-precedence file overrides a true in a lower one', () => {
    const found = statuses([
      ['local', { enableAllProjectMcpServers: false }],
      ['user', { enableAllProjectMcpServers: true }],
    ]);
    expect(found.memory).toBe('pending approval');
    const reverse = statuses([
      ['user', { enableAllProjectMcpServers: false }],
      ['project', { enableAllProjectMcpServers: true }],
    ]);
    expect(reverse.memory).toBe('approved');
  });

  test('in an untrusted folder a true in any honored file is enough, whatever a higher file says', () => {
    const found = statuses(
      [
        ['flag', { enableAllProjectMcpServers: false }],
        ['user', { enableAllProjectMcpServers: true }],
      ],
      false,
    );
    expect(found.memory).toBe('approved');
  });

  test('is ignored in the shared project file of an untrusted folder, and still rejected by a disabledMcpjsonServers entry', () => {
    expect(statuses([['project', { enableAllProjectMcpServers: true }]], false).memory).toBe(
      'pending approval',
    );
    const found = statuses([
      ['user', { enableAllProjectMcpServers: true, disabledMcpjsonServers: ['github'] }],
    ]);
    expect(found).toEqual({ memory: 'approved', github: 'rejected', filesystem: 'approved' });
  });
});

spec('mcpSettings.key.enabledMcpjsonServers', () => {
  test('is a list of texts read from any file; the lists of every file add up', () => {
    expect(KEY_SPECS.enabledMcpjsonServers.scopes).toBe('any');
    expect(KEY_SPECS.enabledMcpjsonServers.merge.kind).toBe('unionArrays');
    const found = statuses([
      ['user', { enabledMcpjsonServers: ['memory'] }],
      ['local', { enabledMcpjsonServers: ['github'] }],
    ]);
    expect(found).toEqual({
      memory: 'approved',
      github: 'approved',
      filesystem: 'pending approval',
    });
  });

  test('the docs example approves memory and github', () => {
    expect(statuses([['user', { enabledMcpjsonServers: ['memory', 'github'] }]])).toEqual({
      memory: 'approved',
      github: 'approved',
      filesystem: 'pending approval',
    });
  });

  test('an entry that is no text is dropped with a warning and the rest stands; a value that is no list is dropped', () => {
    const raw = { enabledMcpjsonServers: ['memory', 3] };
    expect(layerOf('user', raw).settings.enabledMcpjsonServers).toEqual(['memory']);
    expect(issuesOf('user', raw)).toHaveLength(1);
    expect(layerOf('user', { enabledMcpjsonServers: 7 }).settings).toEqual({});
    expect(issuesOf('user', { enabledMcpjsonServers: 7 })[0]?.severity).toBe('warning');
  });

  test('is ignored in the shared project file of an untrusted folder', () => {
    const sources = [['project', { enabledMcpjsonServers: ['memory'] }]] as const;
    expect(statuses(sources, false).memory).toBe('pending approval');
    expect(statuses(sources, true).memory).toBe('approved');
  });

  test('a disabledMcpjsonServers entry still rejects the server it names', () => {
    const found = statuses([
      ['user', { enabledMcpjsonServers: ['memory', 'github'], disabledMcpjsonServers: ['memory'] }],
    ]);
    expect(found.memory).toBe('rejected');
    expect(found.github).toBe('approved');
  });
});

spec('mcpSettings.key.disabledMcpjsonServers', () => {
  test('is a list of texts read from any file; a rejection in any file applies', () => {
    expect(KEY_SPECS.disabledMcpjsonServers.scopes).toBe('any');
    expect(KEY_SPECS.disabledMcpjsonServers.merge.kind).toBe('unionArrays');
    const found = statuses(
      [
        ['project', { disabledMcpjsonServers: ['filesystem'] }],
        ['local', { disabledMcpjsonServers: ['github'] }],
        ['user', { enableAllProjectMcpServers: true }],
      ],
      false,
    );
    expect(found).toEqual({ memory: 'approved', github: 'rejected', filesystem: 'rejected' });
  });

  test('a committed project file rejects even where it cannot approve', () => {
    const found = statuses([['project', { disabledMcpjsonServers: ['memory'] }]], false);
    expect(found.memory).toBe('rejected');
  });

  test('an entry that is no text is dropped with a warning; a value that is no list is dropped', () => {
    expect(layerOf('local', { disabledMcpjsonServers: ['memory', null] }).settings).toEqual({
      disabledMcpjsonServers: ['memory'],
    });
    expect(issuesOf('local', { disabledMcpjsonServers: 'memory' })[0]?.severity).toBe('warning');
  });

  test('rejection takes precedence over enabledMcpjsonServers and enableAllProjectMcpServers', () => {
    const found = statuses([
      ['managed', { enableAllProjectMcpServers: true }],
      ['user', { enabledMcpjsonServers: names }],
      ['local', { disabledMcpjsonServers: ['filesystem'] }],
    ]);
    expect(found.filesystem).toBe('rejected');
    expect(found.memory).toBe('approved');
  });
});

describe('key judgments', () => {
  // Judgment (spec/judgments.md): the changelog says a settings file was "ignored when
  // `enabledMcpjsonServers` or `disabledMcpjsonServers` held a single server name as a plain string".
  // The docs type both as arrays and state no coercion, so the string is dropped with a warning and the
  // other keys of the file stay in effect.
  test('a single name as a plain string does not discard the rest of the file', () => {
    const raw = { disabledMcpjsonServers: 'memory', enabledMcpjsonServers: ['github'] };
    expect(layerOf('user', raw).settings).toEqual({ enabledMcpjsonServers: ['github'] });
  });
});
