/**
 * plugins/cli-reference.md § plugin list: the groups of the text listing, "JSON output" (every field
 * the table names, "`id`, `version`, `scope`, `enabled`, and `installPath` are always present, and
 * the others appear only when they apply"), `--available`, `--data-size [plugin]`. The layout of a
 * plugin's text lines is outside `spec(...)` and in spec/judgments.md.
 */
import { expect, test } from 'bun:test';
import {
  availableJson,
  installedJson,
  listText,
  planPluginList,
  type ListedPlugin,
} from '../../src/cli/index.ts';
import { spec } from '../support/spec.ts';

const base: ListedPlugin = {
  id: 'formatter@acme',
  version: '1.2.0',
  scope: 'user',
  enabled: true,
  installPath: '/home/u/.claude/plugins/cache/acme/formatter/1.2.0',
};

const full: ListedPlugin = {
  ...base,
  readFromFolder: '/m/plugins/formatter',
  folderVersion: '1.3.0',
  installedAt: '2026-01-01T00:00:00.000Z',
  lastUpdated: '2026-02-01T00:00:00.000Z',
  projectPath: '/work/app',
  mcpServers: { docs: { command: 'docs-server' } },
  errors: ['mcp server failed'],
  notes: ['package not installed'],
  errorDetails: [{ type: 'mcp-server-failed', server: 'docs' }],
  noteDetails: [{ type: 'package-missing', plugin: 'formatter' }],
  hasUserConfig: true,
  projectEnabled: true,
};

const ALWAYS = ['id', 'version', 'scope', 'enabled', 'installPath'] as const;
const WHEN_APPLIES = [
  'readFromFolder',
  'folderVersion',
  'installedAt',
  'lastUpdated',
  'projectPath',
  'mcpServers',
  'errors',
  'notes',
  'errorDetails',
  'noteDetails',
  'hasUserConfig',
  'projectEnabled',
] as const;

for (const field of ALWAYS) {
  spec(`cli.plugin.JSON output.${field}`, () => {
    test('is always present', () => {
      expect(Object.keys(installedJson(base))).toContain(field);
      expect(installedJson(base)[field]).toBe(base[field]);
    });
  });
}

for (const field of WHEN_APPLIES) {
  spec(`cli.plugin.JSON output.${field}`, () => {
    test('appears when it applies and not otherwise', () => {
      expect(installedJson(full)[field]).toEqual(full[field]);
      expect(Object.keys(installedJson(base))).not.toContain(field);
    });
  });
}

spec('cli.plugin.JSON output.dataDirSize', () => {
  test('with --data-size it is the byte count and its human form, and absent for an empty directory', () => {
    const options = { json: true, dataSize: true as const, sizes: { [base.id]: { bytes: 2048 } } };
    expect(installedJson(base, options)['dataDirSize']).toEqual({ bytes: 2048, human: '2.0 KB' });
    const empty = { ...options, sizes: { [base.id]: { bytes: 0 } } };
    expect(Object.keys(installedJson(base, empty))).not.toContain('dataDirSize');
    expect(Object.keys(installedJson(base))).not.toContain('dataDirSize');
  });

  test('only marketplace installs have it', () => {
    const inline = { ...base, id: 'p@inline' };
    const options = { json: true, dataSize: true as const, sizes: { 'p@inline': { bytes: 5 } } };
    expect(Object.keys(installedJson(inline, options))).not.toContain('dataDirSize');
  });
});

spec('cli.plugin.JSON output.dataDirUnreadable', () => {
  test('is true when the directory exists but could not be measured', () => {
    const options = {
      json: true,
      dataSize: true as const,
      sizes: { [base.id]: 'unreadable' as const },
    };
    expect(installedJson(base, options)['dataDirUnreadable']).toBe(true);
    expect(Object.keys(installedJson(base, options))).not.toContain('dataDirSize');
  });
});

const available = {
  pluginId: 'lint@acme',
  name: 'lint',
  marketplaceName: 'acme',
  source: './plugins/lint',
  description: 'Lints',
  version: '0.1.0',
  installCount: 42,
};

for (const field of ['pluginId', 'name', 'marketplaceName', 'source'] as const) {
  spec(`cli.plugin.JSON output.${field}`, () => {
    test('an available plugin always has it', () => {
      expect(availableJson(available)[field]).toBe(available[field]);
    });
  });
}

for (const field of ['description', 'version', 'installCount'] as const) {
  spec(`cli.plugin.JSON output.${field}`, () => {
    test('an available plugin has it when its entry does', () => {
      expect(availableJson(available)[field]).toBe(available[field]);
      const { [field]: _removed, ...bare } = available;
      expect(Object.keys(availableJson(bare))).not.toContain(field);
    });
  });
}

spec('cli.plugin.plugin list', () => {
  test('groups by how each plugin loads, in the page order', () => {
    const text = listText([
      { ...base, id: 'a@synced', scope: 'synced' },
      { ...base, id: 'b@skills-dir' },
      { ...base, id: 'c@inline', scope: 'session' },
      base,
    ]);
    const headings = text.filter((line) => !line.startsWith(' '));
    expect(headings).toEqual([
      'Installed plugins:',
      'Session-only plugins (--plugin-dir / --plugin-url):',
      'Skills-directory plugins (.claude/skills/*):',
      'Synced from claude.ai',
    ]);
  });

  test('nothing in any group is one line', () => {
    expect(listText([])).toEqual([
      'No plugins installed. Use `claude plugin install` to install a plugin.',
    ]);
  });
});

spec('cli.plugin.plugin list.--json', () => {
  test('prints an array with one object per installation', () => {
    const out = planPluginList(
      { installed: [base, { ...base, id: 'x@acme', scope: 'project' }] },
      { json: true },
    );
    expect(out.exitCode).toBe(0);
    const parsed: unknown = JSON.parse(out.stdout.join('\n'));
    expect(Array.isArray(parsed) && parsed.length).toBe(2);
  });
});

spec('cli.plugin.plugin list.--available', () => {
  test('with --json it prints one object holding installed and available', () => {
    const out = planPluginList(
      { installed: [base], available: [available] },
      { json: true, available: true },
    );
    const parsed: unknown = JSON.parse(out.stdout.join('\n'));
    expect(parsed).toEqual({
      installed: [installedJson(base)],
      available: [availableJson(available)],
    });
  });

  test('it has no effect without --json', () => {
    const out = planPluginList(
      { installed: [base], available: [available] },
      { json: false, available: true },
    );
    expect(out.stdout).toEqual([...listText([base])]);
  });
});

spec('cli.plugin.plugin list.--data-size [plugin]', () => {
  const request = { installed: [base] };

  test('measures every plugin, or only the named one', () => {
    const other = { ...base, id: 'other@acme' };
    const sizes = { [base.id]: { bytes: 1024 }, [other.id]: { bytes: 2048 } };
    const all = planPluginList({ installed: [base, other] }, { json: true, dataSize: true, sizes });
    expect(all.stdout[0]).toContain('"human":"2.0 KB"');
    const one = planPluginList(
      { installed: [base, other] },
      { json: true, dataSize: base.id, sizes },
    );
    expect(one.stdout[0]).toContain('"human":"1.0 KB"');
    expect(one.stdout[0]).not.toContain('2.0 KB');
  });

  test('a name with no install record prints the message and exits 1 instead of the list', () => {
    expect(planPluginList(request, { json: true, dataSize: 'ghost@acme' })).toEqual({
      stdout: [],
      stderr: ['--data-size names a plugin that is not installed'],
      exitCode: 1,
    });
  });

  test('it has no effect without --json', () => {
    const out = planPluginList(request, { json: false, dataSize: 'ghost@acme' });
    expect(out.exitCode).toBe(0);
  });
});
