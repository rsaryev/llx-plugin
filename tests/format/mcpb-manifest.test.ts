/**
 * plugins/components.md § Include a packaged MCPB server: "The server takes its name from the `name` in
 * the bundle's manifest", "A bundle's own manifest can declare settings the server needs from the user
 * in a `user_config` block. A bundled server with a required setting that has no saved value doesn't
 * start". The MCPB manifest format lives at github.com/modelcontextprotocol/mcpb, not in the pulled
 * docs: every test here is a judgment (spec/judgments.md), outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import {
  bundleServerOf,
  fillBundleSettings,
  missingBundleSettings,
  readMcpbManifest,
  requiredBundleSettings,
  type McpbManifest,
} from '../../src/entry/format.ts';

const manifestOf = (raw: unknown, platform = 'linux'): McpbManifest => {
  const read = readMcpbManifest(raw, platform);
  if ('problem' in read) throw new Error(read.problem);
  return read.manifest;
};

const entry = (type: string) =>
  manifestOf({ name: 'x', server: { type, entry_point: 'server/main' } }).server;

describe('reading a bundle manifest (judgments)', () => {
  test('the name, the mcp_config and the user_config block are read', () => {
    const manifest = manifestOf({
      name: 'db',
      server: { type: 'node', mcp_config: { command: 'node', args: ['${__dirname}/s.js'] } },
      user_config: {
        token: { type: 'string', title: 'Token', sensitive: true, required: true },
        port: { type: 'number', default: 5432, description: 'Port' },
        odd: { type: 'weird' },
        skipped: 'not an object',
      },
    });
    expect(manifest.name).toBe('db');
    expect(manifest.server).toEqual({ command: 'node', args: ['${__dirname}/s.js'] });
    expect(Object.keys(manifest.options)).toEqual(['token', 'port', 'odd']);
    expect(manifest.options.token).toEqual({
      type: 'string',
      title: 'Token',
      description: '',
      required: true,
      sensitive: true,
    });
    expect(manifest.options.port).toMatchObject({ type: 'number', default: 5432, required: false });
    expect(manifest.options.odd?.type).toBe('string');
  });

  test('without mcp_config an entry_point stands for the command of its server type', () => {
    expect(entry('node')).toEqual({ command: 'node', args: ['${__dirname}/server/main'] });
    expect(entry('python')).toEqual({ command: 'python3', args: ['${__dirname}/server/main'] });
    expect(entry('binary')).toEqual({ command: '${__dirname}/server/main' });
  });

  test('platform_overrides of this platform sit over the config and are not kept', () => {
    const raw = {
      name: 'x',
      server: {
        mcp_config: {
          command: 'a',
          env: { A: '1' },
          platform_overrides: { win32: { command: 'a.exe' }, darwin: { command: 'a-mac' } },
        },
      },
    };
    expect(manifestOf(raw, 'win32').server).toEqual({ command: 'a.exe', env: { A: '1' } });
    expect(manifestOf(raw, 'linux').server).toEqual({ command: 'a', env: { A: '1' } });
  });

  test('a manifest with no name or no server is a problem', () => {
    expect(readMcpbManifest({ server: {} }, 'linux')).toEqual({
      problem: 'the bundle manifest has no name',
    });
    expect(readMcpbManifest('x', 'linux')).toEqual({ problem: 'the bundle manifest has no name' });
    expect(readMcpbManifest({ name: 'x', server: { type: 'node' } }, 'linux')).toEqual({
      problem: 'the bundle manifest declares no server',
    });
  });
});

describe('a bundle server and its settings (judgments)', () => {
  const manifest = manifestOf({
    name: 'db',
    server: {
      mcp_config: {
        command: '${__dirname}${/}bin',
        args: ['--home', '${HOME}', '--sep', '${pathSeparator}', '--token', '${user_config.token}'],
        env: { UNKNOWN: '${NOT_A_VARIABLE}' },
      },
    },
    user_config: {
      token: { type: 'string', required: true },
      port: { required: true, default: 1 },
    },
  });
  const variables = { directory: '/cache/db', home: '/home/me', separator: '/' };

  test('variables are substituted in every string and user_config keys are namespaced by server', () => {
    expect(bundleServerOf(manifest, variables)).toEqual({
      command: '/cache/db/bin',
      args: ['--home', '/home/me', '--sep', '/', '--token', '${user_config.db.token}'],
      env: { UNKNOWN: '${NOT_A_VARIABLE}' },
    });
    expect(bundleServerOf(manifest, { ...variables, separator: '\\' })).toMatchObject({
      command: '/cache/db\\bin',
    });
  });

  test('saved settings fill the namespaced references; one with no value stays', () => {
    const server = bundleServerOf(manifest, variables);
    expect(fillBundleSettings(server, { 'db.token': 'abc' })).toMatchObject({
      args: ['--home', '/home/me', '--sep', '/', '--token', 'abc'],
    });
    expect(fillBundleSettings(server, {})).toEqual(server);
    expect(fillBundleSettings({ n: 3, a: [1, '${user_config.db.n}'] }, { 'db.n': 7 })).toEqual({
      n: 3,
      a: [1, '7'],
    });
  });

  test('a required setting with no default and no saved value keeps the server from starting', () => {
    const required = requiredBundleSettings(manifest);
    expect(required).toEqual(['db.token']);
    expect(missingBundleSettings(required, {})).toEqual(['db.token']);
    expect(missingBundleSettings(required, { 'db.token': '' })).toEqual(['db.token']);
    expect(missingBundleSettings(required, { 'db.token': 'x' })).toEqual([]);
  });
});
