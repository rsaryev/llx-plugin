/**
 * mcp.md § "Project server approvals and workspace trust": "A cloned repository can't approve its own
 * servers: `enableAllProjectMcpServers` or `enabledMcpjsonServers` committed to the project's
 * `.claude/settings.json` is ignored in an untrusted folder, and the server stays at `Pending
 * approval`." Approvals from "your user `~/.claude/settings.json`, managed settings, settings passed
 * with `--settings`" "still apply in an untrusted folder". An untracked `.claude/settings.local.json`
 * applies only in a trusted folder, "unless the folder is your own configuration home: your home
 * directory, or a directory whose `.claude` you've set as `CLAUDE_CONFIG_DIR`" (v2.1.207). "A
 * `disabledMcpjsonServers` entry in any settings file still rejects the server."
 * § "Server status": `Pending approval` for "a project-scoped server from `.mcp.json` that you haven't
 * approved yet", `Rejected` for one a `disabledMcpjsonServers` entry rejects.
 * § "Project scope": the approval prompt is shown "in interactive sessions"; in `claude -p`, Agent SDK
 * and cloud sessions Claude Code "loads project-scoped servers without asking", and it "skips the
 * prompt in a session you start in `bypassPermissions` mode with `skipDangerousModePermissionPrompt`
 * set in your user settings or in managed settings"; `disabledMcpjsonServers` "blocks it in every
 * permission mode".
 */
import { describe, expect, test } from 'bun:test';
import {
  canPromptForProjectServers,
  projectServerApproval,
  type McpTrust,
} from '../../../src/settings/mcp/index.ts';
import type { PolicyLayer, PolicyScope } from '../../../src/settings/index.ts';
import { spec } from '../../support/spec.ts';
import { layerOf } from '../../support/settings-layers.ts';

const servers = ['memory', 'github', 'filesystem'];
const trusted: McpTrust = { folderTrusted: true };
const untrusted: McpTrust = { folderTrusted: false };

const layers = (...sources: readonly (readonly [PolicyScope, unknown])[]): PolicyLayer[] =>
  sources.map(([scope, raw]) => layerOf(scope, raw));

const statuses = (found: ReturnType<typeof projectServerApproval>): Record<string, string> =>
  Object.fromEntries(found.map((each) => [each.name, each.status]));

const approveAll = { enableAllProjectMcpServers: true };
const approveTwo = { enabledMcpjsonServers: ['memory', 'github'] };

spec('mcpSettings.behavior.Project server approvals and workspace trust', () => {
  test('a .mcp.json server nothing approves is pending approval', () => {
    expect(statuses(projectServerApproval(servers, [], trusted))).toEqual({
      memory: 'pending approval',
      github: 'pending approval',
      filesystem: 'pending approval',
    });
  });

  test('enableAllProjectMcpServers approves every server', () => {
    const found = projectServerApproval(servers, layers(['user', approveAll]), trusted);
    expect(Object.values(statuses(found))).toEqual(['approved', 'approved', 'approved']);
  });

  test('enabledMcpjsonServers approves the servers it names, the docs example', () => {
    const found = projectServerApproval(servers, layers(['user', approveTwo]), trusted);
    expect(statuses(found)).toEqual({
      memory: 'approved',
      github: 'approved',
      filesystem: 'pending approval',
    });
  });

  test('an approval committed to the project settings is ignored in an untrusted folder', () => {
    for (const approval of [approveAll, approveTwo]) {
      const found = projectServerApproval(servers, layers(['project', approval]), untrusted);
      expect(Object.values(statuses(found))).toEqual([
        'pending approval',
        'pending approval',
        'pending approval',
      ]);
    }
  });

  test('the same committed approval applies once the folder is trusted', () => {
    const found = projectServerApproval(servers, layers(['project', approveTwo]), trusted);
    expect(statuses(found).memory).toBe('approved');
  });

  test('user, managed and --settings approvals still apply in an untrusted folder', () => {
    for (const scope of ['user', 'managed', 'flag'] as const) {
      const found = projectServerApproval(servers, layers([scope, approveTwo]), untrusted);
      expect(statuses(found)).toEqual({
        memory: 'approved',
        github: 'approved',
        filesystem: 'pending approval',
      });
    }
  });

  test('an untracked settings.local.json counts only in a trusted folder or the configuration home', () => {
    const local = layers(['local', approveTwo]);
    expect(statuses(projectServerApproval(servers, local, untrusted)).memory).toBe(
      'pending approval',
    );
    expect(statuses(projectServerApproval(servers, local, trusted)).memory).toBe('approved');
    expect(
      statuses(projectServerApproval(servers, local, { folderTrusted: false, configHome: true }))
        .memory,
    ).toBe('approved');
  });

  test('a disabledMcpjsonServers entry in any file rejects the server, an untrusted project file too', () => {
    for (const scope of ['project', 'user', 'local', 'managed', 'flag'] as const) {
      const found = projectServerApproval(
        servers,
        layers(['user', approveAll], [scope, { disabledMcpjsonServers: ['filesystem'] }]),
        untrusted,
      );
      expect(statuses(found)).toEqual({
        memory: 'approved',
        github: 'approved',
        filesystem: 'rejected',
      });
    }
  });

  test('rejection beats enabledMcpjsonServers and enableAllProjectMcpServers', () => {
    const found = projectServerApproval(
      ['memory'],
      layers(
        ['user', { enabledMcpjsonServers: ['memory'], enableAllProjectMcpServers: true }],
        ['local', { disabledMcpjsonServers: ['memory'] }],
      ),
      trusted,
    );
    expect(found).toEqual([{ name: 'memory', status: 'rejected', via: 'disabledMcpjsonServers' }]);
  });

  test('a server that no file mentions keeps its place in the list, in the order given', () => {
    const found = projectServerApproval(
      ['b', 'a'],
      layers(['user', { enabledMcpjsonServers: ['a'] }]),
      trusted,
    );
    expect(found.map((each) => each.name)).toEqual(['b', 'a']);
  });

  test('the answer says what decided it', () => {
    const found = projectServerApproval(servers, layers(['user', approveTwo]), trusted);
    expect(found.map((each) => each.via)).toEqual([
      'enabledMcpjsonServers',
      'enabledMcpjsonServers',
      undefined,
    ]);
    const all = projectServerApproval(['memory'], layers(['user', approveAll]), trusted);
    expect(all[0]?.via).toBe('enableAllProjectMcpServers');
  });
});

spec('mcpSettings.behavior.Project scope', () => {
  const interactive = { interactive: true, bypassPermissions: false };

  test('an interactive session prompts, so an unapproved server waits', () => {
    expect(canPromptForProjectServers(interactive, [])).toBe(true);
    expect(statuses(projectServerApproval(servers, [], trusted, { prompts: true })).memory).toBe(
      'pending approval',
    );
  });

  test('claude -p, Agent SDK and cloud sessions cannot prompt: the servers load without asking', () => {
    expect(canPromptForProjectServers({ interactive: false, bypassPermissions: false }, [])).toBe(
      false,
    );
    const found = projectServerApproval(servers, [], trusted, { prompts: false });
    expect(Object.values(statuses(found))).toEqual(['approved', 'approved', 'approved']);
    expect(found[0]?.via).toBe('session');
  });

  test('disabledMcpjsonServers blocks a server even when no prompt can be shown', () => {
    const found = projectServerApproval(
      servers,
      layers(['project', { disabledMcpjsonServers: ['github'] }]),
      untrusted,
      { prompts: false },
    );
    expect(statuses(found)).toEqual({
      memory: 'approved',
      github: 'rejected',
      filesystem: 'approved',
    });
  });

  test('bypassPermissions skips the prompt only with skipDangerousModePermissionPrompt in user or managed settings', () => {
    const bypass = { interactive: true, bypassPermissions: true };
    const skip = { skipDangerousModePermissionPrompt: true };
    expect(canPromptForProjectServers(bypass, layers(['user', skip]))).toBe(false);
    expect(canPromptForProjectServers(bypass, layers(['managed', skip]))).toBe(false);
    expect(canPromptForProjectServers(bypass, layers(['project', skip]))).toBe(true);
    expect(canPromptForProjectServers(bypass, [])).toBe(true);
    expect(canPromptForProjectServers(interactive, layers(['user', skip]))).toBe(true);
  });
});

describe('approval judgments', () => {
  // Judgment (spec/judgments.md): a settings.local.json that git tracks is a committed file, not the
  // "untracked" one the docs exempt, so it counts like the shared project file: only in a trusted
  // folder, the configuration home included.
  test('a tracked settings.local.json counts only in a trusted folder', () => {
    const local = layers(['local', approveTwo]);
    const tracked = { configHome: true, localTracked: true };
    expect(
      statuses(projectServerApproval(servers, local, { folderTrusted: false, ...tracked })).memory,
    ).toBe('pending approval');
    expect(
      statuses(projectServerApproval(servers, local, { folderTrusted: true, ...tracked })).memory,
    ).toBe('approved');
  });

  // Judgment (spec/judgments.md): the parent settings of an embedding host and --add-dir directories
  // take no part: --add-dir settings carry two keys only (permissions.md), parent settings keep "only
  // the host's values that restrict" (managed-settings.md), so their approvals and rejections are ignored.
  test('parent and --add-dir settings neither approve nor reject a server', () => {
    for (const scope of ['parent', 'addDir'] as const) {
      for (const trust of [trusted, untrusted]) {
        const approving = layers([scope, { ...approveAll, ...approveTwo }]);
        expect(Object.values(statuses(projectServerApproval(servers, approving, trust)))).toEqual([
          'pending approval',
          'pending approval',
          'pending approval',
        ]);
      }
      const rejecting = layers(
        ['user', approveAll],
        [scope, { disabledMcpjsonServers: ['github'] }],
      );
      expect(statuses(projectServerApproval(servers, rejecting, trusted)).github).toBe('approved');
    }
  });

  // Judgment: the docs word the two lists of the three keys for `.mcp.json` names only; a name with
  // different case is another name, as it is for the server itself.
  test('names are matched exactly', () => {
    const found = projectServerApproval(['Memory'], layers(['user', approveTwo]), trusted);
    expect(found[0]?.status).toBe('pending approval');
  });
});
