import type { HelperContext, HelperServer, HelperTrust } from '../../src/entry/loading.ts';
import { locations } from './ports.ts';

/** A snapshot with credential-looking names, Git's exception, a fixed-list name and ordinary ones. */
export const SNAPSHOT: Readonly<Record<string, string>> = {
  PATH: '/bin',
  HOME: '/home/user',
  TEAM: 'blue',
  ANTHROPIC_API_KEY: 'sk-ant-live',
  MY_REGISTRY_TOKEN: 'tok-live-123',
  db_password: 'pw-live',
  ANTHROPIC_CUSTOM_HEADERS: 'X-Custom: secret',
  GIT_CONFIG_KEY_0: 'http.extraheader',
};

export const DIRECTORIES = {
  project: '/work/app',
  primary: '/work/primary',
  pluginRoot: '/plugins/team-tools',
  config: '/home/user/.claude',
};

export const contextOf = (overrides: Partial<HelperContext> = {}): HelperContext => ({
  environment: SNAPSHOT,
  locations: locations(),
  projectDirectory: DIRECTORIES.project,
  primaryDirectory: DIRECTORIES.primary,
  pluginRoot: DIRECTORIES.pluginRoot,
  ...overrides,
});

export const serverOf = (overrides: Partial<HelperServer> = {}): HelperServer => ({
  name: 'internal-api',
  url: 'https://mcp.internal.example.com',
  expandedVariables: [],
  headersHelper: '/opt/bin/get-mcp-auth-headers.sh',
  ...overrides,
});

export const TRUSTED: HelperTrust = {
  source: 'persisted',
  interactive: true,
  key: '/work/app',
};

export const trustOf = (overrides: Partial<HelperTrust> = {}): HelperTrust => ({
  ...TRUSTED,
  ...overrides,
});
