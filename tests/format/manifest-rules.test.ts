/** plugins/manifest-reference.md § metadata, § Directory listing fields, § Path-only fields, § dependencies, § name. */
import { expect, test } from 'bun:test';
import { readManifest, validateManifest } from '../../src/format/manifest.ts';
import { normalizeDependency } from '../../src/marketplace/dependencies.ts';
import { loadPlugin } from '../../src/loading/load-plugin.ts';
import { validateMarketplace } from '../../src/format/marketplace/marketplace.ts';
import { memoryFiles } from '../support/ports.ts';
import { spec } from '../support/spec.ts';

spec('manifest.rule.metadata', () => {
  test('accepts an opaque object without changing component discovery or names', async () => {
    const raw = {
      name: 'demo',
      metadata: { entitlement: { ids: [1, 2] }, commands: 'not-a-component' },
    };
    expect(readManifest(raw).manifest?.metadata).toEqual(raw.metadata);
    const { plugin } = await loadPlugin({
      files: memoryFiles({
        '.claude-plugin/plugin.json': JSON.stringify(raw),
        'commands/go.md': 'Go.',
      }),
    });
    expect(plugin?.commands.map((command) => command.qualifiedName)).toEqual(['demo:go']);
    expect(readManifest({ name: 'demo', metadata: ['not-an-object'] }).manifest).toBeUndefined();
  });
});

spec('manifest.rule.Directory listing fields', () => {
  test('accepts directory metadata in plugin.json but reports it as unknown in marketplace entries', () => {
    const fields = {
      icon: './logo.png',
      documentationUrl: 'https://example.com/docs',
      supportUrl: 'https://example.com/support',
      privacyPolicyUrl: 'https://example.com/privacy',
      termsOfServiceUrl: 'https://example.com/terms',
    };
    const raw = {
      name: 'demo',
      version: '1.0.0',
      description: 'Demo',
      author: { name: 'Team' },
      ...fields,
    };
    expect(validateManifest(raw)).toEqual([]);
    expect(readManifest(raw).manifest?.name).toBe('demo');
    const issues = validateMarketplace({
      name: 'acme',
      owner: { name: 'Team' },
      plugins: [{ name: 'demo', source: './plugins/demo', ...fields }],
    });
    for (const key of Object.keys(fields)) {
      expect(issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining(`Unknown field '${key}'`),
        }),
      );
    }
  });
});

spec('manifest.rule.Path-only fields', () => {
  test('all path-only keys accept a path or list and refuse inline objects or wrong suffixes', () => {
    for (const [key, path] of [
      ['agents', './review.md'],
      ['skills', './more/'],
      ['outputStyles', './styles/'],
      ['workflows', './flows/'],
    ]) {
      if (key === undefined || path === undefined) throw new Error('incomplete fixture');
      for (const value of [path, [path]])
        expect(readManifest({ name: 'demo', [key]: value }).manifest).toBeDefined();
      expect(readManifest({ name: 'demo', [key]: {} }).manifest).toBeUndefined();
    }
    for (const value of ['./themes/', ['./one.json', './themes/']]) {
      expect(
        readManifest({ name: 'demo', experimental: { themes: value } }).manifest,
      ).toBeDefined();
    }
    expect(readManifest({ name: 'demo', experimental: { themes: {} } }).manifest).toBeUndefined();
    expect(readManifest({ name: 'demo', agents: './agents/' }).manifest).toBeUndefined();
  });
});

spec('manifest.rule.dependencies', () => {
  test('bare names use the declaring marketplace; qualified names and constrained objects keep their origin and version', () => {
    const forms = ['lib', 'lib@other', { name: 'lib', marketplace: 'other', version: '^2.0.0' }];
    expect(readManifest({ name: 'demo', dependencies: forms }).manifest?.dependencies).toEqual(
      forms,
    );
    expect(normalizeDependency('lib', 'acme')).toMatchObject({ name: 'lib', marketplace: 'acme' });
    expect(normalizeDependency('lib@other', 'acme')).toMatchObject({
      name: 'lib',
      marketplace: 'other',
    });
    expect(normalizeDependency(forms[2], 'acme')).toMatchObject({
      name: 'lib',
      marketplace: 'other',
      range: '^2.0.0',
    });
    expect(readManifest({ name: 'demo', dependencies: [false] }).manifest).toBeUndefined();
  });
});

for (const [label, names] of [
  ['claude-', ['claude-helper', 'ANTHROPIC_tools', 'Anthropics--dev', 'CC_PLUGIN_x']],
  ['claude', ['claude', 'Anthropic', 'anthropics', 'claude_code', 'claude-mods']],
  ['official', ['official-claude-tools', 'anthropic_OFFICIAL']],
] as const) {
  spec(`manifest.rule.name.${label}`, () => {
    test('the validator rejects the documented reserved name group without preventing runtime loading', () => {
      for (const name of names) {
        expect(
          validateManifest({ name })
            .filter((issue) => issue.severity === 'error')
            .map((issue) => issue.message.split('. ')[0]),
        ).toContain(`Plugin name "${name}" is reserved: it passes as one of Anthropic's own`);
        expect(readManifest({ name }).manifest?.name).toBe(name);
      }
    });
  });
}
