/**
 * permissions.md § What runs before you trust a folder: the table (one row per kind of content the
 * repository supplies, one column per situation in which the folder itself is not trusted), the
 * nested-repository rule and the precautions before `claude -p`; mcp.md § Trust a folder before its
 * headersHelper runs (the static `headers` stay in use).
 */
import { describe, expect, test } from 'bun:test';
import {
  TRUST_SITUATIONS,
  contentGate,
  trustSituation,
  type TrustSituationFacts,
} from '../../src/loading/trust-gates.ts';
import { spec } from '../support/spec.ts';

const untrusted: TrustSituationFacts = {
  folderTrusted: false,
  parentTrusted: false,
  nonInteractive: false,
  nestedRepository: false,
};
const parent = { ...untrusted, parentTrusted: true };
const print = { ...untrusted, nonInteractive: true };

const gate = (content: Parameters<typeof contentGate>[0], facts: TrustSituationFacts) =>
  contentGate(content, trustSituation(facts));

spec('trust.behavior.What runs before you trust a folder', () => {
  test('the two columns are the two situations in which the folder is not trusted', () => {
    expect(trustSituation(parent)).toBe('parent-trusted');
    expect(trustSituation(print)).toBe('non-interactive');
    expect(trustSituation({ ...print, parentTrusted: true })).toBe('non-interactive');
    expect(trustSituation({ ...untrusted, folderTrusted: true })).toBe('trusted');
  });

  test('inside a nested repository the parent-folder column does not apply: an interactive session shows the dialog', () => {
    expect(trustSituation({ ...parent, nestedRepository: true })).toBe('dialog');
    expect(gate('allow-rules', { ...parent, nestedRepository: true })).toEqual({
      applies: false,
      consent: 'trust-dialog',
    });
  });

  test('inside a nested repository a -p or SDK run follows the -p column', () => {
    expect(trustSituation({ ...print, parentTrusted: true, nestedRepository: true })).toBe(
      'non-interactive',
    );
  });
});

spec('trust.behavior.What runs before you trust a folder.env', () => {
  const USED = { applies: true, consent: 'none' } as const;

  test('hooks in settings files, the env block and helper commands are used in both columns', () => {
    for (const content of ['settings-hooks', 'env-and-helper-commands'] as const) {
      expect(gate(content, parent)).toEqual(USED);
      expect(gate(content, print)).toEqual(USED);
    }
  });

  test("a project skill's hooks and allowed-tools are used in both columns", () => {
    for (const content of ['skill-hooks', 'skill-allowed-tools'] as const) {
      expect(gate(content, parent)).toEqual(USED);
      expect(gate(content, print)).toEqual(USED);
    }
  });

  test("workspace trust never gates a skill's allowed-tools in any session", () => {
    for (const situation of TRUST_SITUATIONS) {
      expect(contentGate('skill-allowed-tools', situation)).toEqual(USED);
    }
  });
});

spec('trust.behavior.What runs before you trust a folder.permissions.allow', () => {
  test('allow rules and additionalDirectories are not used until the dialog is accepted, which appears again', () => {
    for (const content of ['allow-rules', 'additional-directories'] as const) {
      expect(gate(content, parent)).toEqual({ applies: false, consent: 'trust-dialog' });
    }
  });

  test('in a -p or SDK run they are not used, with a "this workspace has not been trusted" warning on stderr', () => {
    for (const content of ['allow-rules', 'additional-directories'] as const) {
      expect(gate(content, print)).toEqual({
        applies: false,
        consent: 'never',
        stderr: 'this workspace has not been trusted',
      });
    }
  });

  test('once the folder is trusted they apply', () => {
    expect(contentGate('allow-rules', 'trusted').applies).toBe(true);
  });
});

spec('trust.behavior.What runs before you trust a folder.@skills-dir', () => {
  const contents = [
    'subagent-frontmatter-hooks',
    'skills-dir-plugin',
    'extra-known-marketplaces',
  ] as const;

  test('frontmatter hooks of a project subagent, a project @skills-dir plugin and extraKnownMarketplaces are not used, and no dialog is offered', () => {
    for (const content of contents) {
      expect(gate(content, parent)).toEqual({ applies: false, consent: 'never' });
    }
  });

  test('in a -p or SDK run they are not used', () => {
    for (const content of contents) {
      expect(gate(content, print)).toEqual({ applies: false, consent: 'never' });
    }
  });

  test('they apply once the exact folder is trusted', () => {
    for (const content of contents) expect(contentGate(content, 'trusted').applies).toBe(true);
  });
});

spec('trust.behavior.What runs before you trust a folder.mcpServers', () => {
  test('inline mcpServers of a project subagent are not used, and no dialog is offered', () => {
    expect(gate('subagent-inline-mcp', parent)).toEqual({ applies: false, consent: 'never' });
  });

  test('in a -p or SDK run they are not used', () => {
    expect(gate('subagent-inline-mcp', print)).toEqual({ applies: false, consent: 'never' });
  });
});

spec('trust.behavior.What runs before you trust a folder..mcp.json', () => {
  test("with only a parent trusted Claude Code asks before connecting, and the repository's own approvals do not count", () => {
    expect(gate('mcp-json-servers', parent)).toEqual({
      applies: false,
      consent: 'server-approval',
      repositoryApprovals: false,
    });
  });

  test('a -p or SDK run connects them without asking, approved or not', () => {
    expect(gate('mcp-json-servers', print)).toEqual({ applies: true, consent: 'none' });
  });
});

spec('trust.behavior.What runs before you trust a folder.headersHelper', () => {
  test('with only a parent trusted the helper is not run until the dialog is accepted, and the server connects with its static headers', () => {
    expect(gate('headers-helper', parent)).toEqual({
      applies: false,
      consent: 'trust-dialog',
      fallback: 'static-headers',
    });
  });

  test('a -p or SDK run does not run it and prints a "headersHelper not run" line to stderr', () => {
    expect(gate('headers-helper', print)).toEqual({
      applies: false,
      consent: 'never',
      fallback: 'static-headers',
      stderr: 'headersHelper not run',
    });
  });
});

describe('judgments (outside spec)', () => {
  test('before any trust an interactive session waits for the dialog, except what is never gated', () => {
    // spec/judgments.md: the table has no column for a folder nothing was trusted for.
    expect(contentGate('settings-hooks', 'dialog')).toEqual({
      applies: false,
      consent: 'trust-dialog',
    });
    expect(contentGate('mcp-json-servers', 'dialog').consent).toBe('server-approval');
    expect(contentGate('skill-allowed-tools', 'dialog').applies).toBe(true);
  });

  test('in a trusted folder .mcp.json servers still go through the per-server approval', () => {
    expect(contentGate('mcp-json-servers', 'trusted')).toEqual({
      applies: false,
      consent: 'server-approval',
      repositoryApprovals: true,
    });
  });
});
