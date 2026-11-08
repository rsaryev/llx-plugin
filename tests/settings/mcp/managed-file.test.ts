/**
 * managed-mcp.md § "Deploy managed-mcp.json": "Claude Code looks for the file at one of these
 * paths": macOS `/Library/Application Support/ClaudeCode/managed-mcp.json`, Linux and WSL
 * `/etc/claude-code/managed-mcp.json`, Windows `C:\Program Files\ClaudeCode\managed-mcp.json`;
 * "The file uses the same format as a project `.mcp.json` file" (the page's example is read here).
 * § "Authenticate with per-user credentials": "Any user on the machine can read this file, so don't
 * store API keys or other credentials in `env` blocks. Pass per-user credentials with" `${VAR}`
 * expansion, OAuth or per-user headers, or `headersHelper`. § "Exclusive control": a file "that
 * Claude Code can read and parse" takes the control (the kit reads the text the host hands over).
 */
import { describe, expect, test } from 'bun:test';
import {
  loadManagedMcpFile,
  managedMcpFilePath,
  MANAGED_MCP_PLATFORMS,
  readManagedMcpFile,
  type ManagedMcpPlatform,
} from '../../../src/settings/mcp/index.ts';
import { planOf } from '../../support/mcp-managed.ts';
import { memoryFiles } from '../../support/ports.ts';
import { spec } from '../../support/spec.ts';
import { plain } from '../../support/settings-layers.ts';

const docsExample = {
  mcpServers: {
    github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/' },
    sentry: { type: 'http', url: 'https://mcp.sentry.dev/mcp' },
    'company-internal': {
      type: 'stdio',
      command: '/usr/local/bin/company-mcp-server',
      args: ['--config', '/etc/company/mcp-config.json'],
      env: { COMPANY_API_URL: 'https://internal.example.com' },
    },
  },
};

/** What the host finds at `path`: the docs' example there and nowhere else. */
async function deployedAt(platform: ManagedMcpPlatform, path: string) {
  const files = memoryFiles({ [path]: JSON.stringify(docsExample) });
  const read = await loadManagedMcpFile(files, platform);
  return { read, reads: files.reads };
}

spec('mcpSettings.managed.Deploy managed-mcp.json.macOS', () => {
  const path = '/Library/Application Support/ClaudeCode/managed-mcp.json';

  test('the file is looked for at the macOS path', () => {
    expect(managedMcpFilePath('macos')).toBe(path);
  });

  test('the host reads it through a TextFileReader and the page example loads three servers', async () => {
    const { read, reads } = await deployedAt('macos', path);
    expect(reads).toEqual([path]);
    expect(Object.keys(read.file?.servers ?? {})).toEqual(['github', 'sentry', 'company-internal']);
    expect(read.issues).toEqual([]);
  });

  test('a machine where the macOS path holds nothing has no managed file', async () => {
    const read = await loadManagedMcpFile(
      memoryFiles({ '/etc/claude-code/managed-mcp.json': '{}' }),
      'macos',
    );
    expect(read).toEqual({ file: undefined, issues: [] });
  });
});

spec('mcpSettings.managed.Deploy managed-mcp.json.Linux and WSL', () => {
  const path = '/etc/claude-code/managed-mcp.json';

  test('Linux and WSL look at the same path', () => {
    expect(managedMcpFilePath('linux')).toBe(path);
    expect(managedMcpFilePath('wsl')).toBe(path);
  });

  test('the host reads it through a TextFileReader on both', async () => {
    for (const platform of ['linux', 'wsl'] as const) {
      const { read, reads } = await deployedAt(platform, path);
      expect(reads).toEqual([path]);
      expect(Object.keys(read.file?.servers ?? {})).toHaveLength(3);
    }
  });
});

spec('mcpSettings.managed.Deploy managed-mcp.json.Windows', () => {
  const path = 'C:\\Program Files\\ClaudeCode\\managed-mcp.json';

  test('the file is looked for under Program Files', () => {
    expect(managedMcpFilePath('windows')).toBe(path);
  });

  test('the host reads it through a TextFileReader', async () => {
    const { read, reads } = await deployedAt('windows', path);
    expect(reads).toEqual([path]);
    expect(Object.keys(read.file?.servers ?? {})).toHaveLength(3);
  });

  test('the four platforms have three distinct paths and no other is looked at', () => {
    expect(MANAGED_MCP_PLATFORMS).toEqual(['macos', 'linux', 'wsl', 'windows']);
    expect(new Set(MANAGED_MCP_PLATFORMS.map(managedMcpFilePath)).size).toBe(3);
  });
});

spec('mcpSettings.managed.Authenticate with per-user credentials', () => {
  const text = JSON.stringify({
    mcpServers: {
      internal: {
        type: 'http',
        url: 'https://internal.example.com/mcp',
        headers: { Authorization: 'Bearer ${COMPANY_TOKEN}' },
      },
      signin: { type: 'http', url: 'https://signin.example.com/mcp', oauth: { clientId: 'abc' } },
      minted: {
        type: 'http',
        url: 'https://minted.example.com/mcp',
        headersHelper: '/usr/local/bin/mint-token',
      },
    },
  });
  const servers = readManagedMcpFile(text).file?.servers ?? {};

  test('a ${VAR} reference reaches the plan as written: nothing expands it at read time, so no secret is in the file', () => {
    const { file } = readManagedMcpFile(text);
    const plan = planOf({ managedFile: file });
    const internal = plan.servers.find((each) => each.name === 'internal');
    expect(plain(internal?.server)).toEqual({
      type: 'http',
      url: 'https://internal.example.com/mcp',
      headers: { Authorization: 'Bearer ${COMPANY_TOKEN}' },
    });
  });

  test('OAuth and headersHelper are kept as written, for each user to authenticate or mint a header', () => {
    expect(plain(servers.signin)).toEqual({
      type: 'http',
      url: 'https://signin.example.com/mcp',
      oauth: { clientId: 'abc' },
    });
    expect(plain(servers.minted)).toEqual({
      type: 'http',
      url: 'https://minted.example.com/mcp',
      headersHelper: '/usr/local/bin/mint-token',
    });
  });
});

describe('managed-mcp.json reading judgments', () => {
  // Judgment (spec/judgments.md): the page names no wording and no rule for a file that is empty, is
  // not JSON or is no object; "can read and parse" decides, so none of them takes control.
  test.each([
    ['', 'empty'],
    ['{ not json', 'broken'],
    ['[]', 'a list'],
    ['7', 'a number'],
  ])('a file that is %j is not read and says why', (text) => {
    const read = readManagedMcpFile(text);
    expect(read.file).toBeUndefined();
    expect(read.issues).toHaveLength(1);
    expect(read.issues[0]?.severity).toBe('error');
    expect(read.issues[0]?.path).toBe('managed-mcp.json');
    expect(read.issues[0]?.message).toContain('could not be read');
  });

  test('no file holds no servers and no issue', () => {
    expect(readManagedMcpFile(undefined)).toEqual({ file: undefined, issues: [] });
  });

  test('an empty server map is a readable file', () => {
    expect(readManagedMcpFile('{ "mcpServers": {} }')).toEqual({
      file: { servers: {} },
      issues: [],
    });
  });

  test('an entry Claude Code would drop is an issue and the other entries still load', () => {
    const read = readManagedMcpFile(
      JSON.stringify({
        mcpServers: {
          bad: { type: 'http' },
          good: { type: 'http', url: 'https://a.example.com/' },
        },
      }),
    );
    expect(Object.keys(read.file?.servers ?? {})).toEqual(['good']);
    expect(read.issues).toHaveLength(1);
  });
});
