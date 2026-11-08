/**
 * marketplace-reference.md § Fields by type (`name`, `plugins` of a `settings` source), § Source
 * objects in settings; settings-reference.md § extraKnownMarketplaces (inline entries must be
 * remote, `name` must equal the key); plugins/host-marketplace.md § Authenticate archive downloads.
 */
import { expect, test } from 'bun:test';
import { errors, parse, sourceOf, warnings } from '../../support/marketplace-source.ts';
import { spec } from '../../support/spec.ts';

const settings = (name: unknown) => ({ source: 'settings', name, plugins: [] });

spec('marketplace.sourceField.name', () => {
  test('on a settings source it is the marketplace name; it equals the extraKnownMarketplaces key', () => {
    const result = parse(settings('team-tools'), false, 'team-tools');
    expect(result.source).toMatchObject({ kind: 'settings', name: 'team-tools' });
    expect(errors(result.issues)).toEqual([]);
  });

  test('a name that differs from the key is an error and the source does not load', () => {
    const result = parse(settings('team-tools'), false, 'other-tools');
    expect(result.source).toBeUndefined();
    const found = errors(result.issues);
    expect(found).toHaveLength(1);
    expect(found[0]?.path).toBe('name');
    expect(found[0]?.message).toContain('"team-tools"');
    expect(found[0]?.message).toContain('"other-tools"');
  });

  test('a reserved name is refused', () => {
    for (const name of ['claude-plugins-official', 'inline', 'claude-community']) {
      const result = parse(settings(name), false, name);
      expect(result.source).toBeUndefined();
      expect(errors(result.issues).every((i) => i.path === 'name')).toBe(true);
      expect(errors(result.issues).length).toBeGreaterThan(0);
    }
  });

  test('it is required, and a string', () => {
    expect(parse({ source: 'settings', plugins: [] }).issues).toEqual([
      { severity: 'error', path: 'name', message: 'Invalid input' },
    ]);
    expect(errors(parse(settings(5)).issues).map((i) => i.path)).toEqual(['name']);
  });

  test('without a key to compare with, only the reserved-name rule applies', () => {
    expect(parse(settings('team-tools')).source).toBeDefined();
  });

  test('on the other types it is reported as unknown', () => {
    const result = parse({ source: 'directory', path: '/x', name: 'y' });
    expect(warnings(result.issues).map((i) => i.path)).toEqual(['name']);
  });
});

const inline = (...plugins: unknown[]) => ({ source: 'settings', name: 'team-tools', plugins });

spec('marketplace.sourceField.plugins', () => {
  const formatter = {
    name: 'code-formatter',
    source: { source: 'github', repo: 'acme-corp/code-formatter' },
  };

  test('the doc example declares one plugin inline', () => {
    const source = sourceOf(inline(formatter));
    expect(source).toMatchObject({ kind: 'settings', name: 'team-tools' });
    if (source.kind !== 'settings') throw new Error('not settings');
    expect(source.plugins).toHaveLength(1);
    expect(source.plugins[0]).toMatchObject({
      name: 'code-formatter',
      source: { kind: 'github', repo: 'acme-corp/code-formatter' },
      strict: true,
    });
  });

  test('an item takes name, source, description, version, strict, headers and headersHelper', () => {
    const entry = {
      name: 'internal',
      source: { source: 'archive', url: 'https://r.example/internal.zip' },
      description: 'Internal tools',
      version: '1.2.0',
      strict: true,
      headers: { Authorization: 'Bearer abc' },
      headersHelper: 'mint-token',
    };
    const source = sourceOf(inline(entry));
    if (source.kind !== 'settings') throw new Error('not settings');
    expect(source.plugins[0]).toMatchObject({
      name: 'internal',
      description: 'Internal tools',
      version: '1.2.0',
      strict: true,
      headers: { Authorization: 'Bearer abc' },
      headersHelper: 'mint-token',
    });
  });

  test('an entry in settings with a headersHelper needs no "strict": false', () => {
    const result = parse(
      inline({
        name: 'internal',
        source: {
          source: 'archive',
          url: 'https://r.example/internal.zip',
          sha256: 'a'.repeat(64),
        },
        headersHelper: 'mint-token',
      }),
    );
    expect(errors(result.issues)).toEqual([]);
    expect(result.source).toBeDefined();
  });

  test('a relative path source is refused: there is no repository to resolve against', () => {
    const result = parse(inline({ name: 'local', source: './plugins/local' }, formatter));
    const found = errors(result.issues);
    expect(found.map((i) => i.path)).toEqual(['plugins[0].source']);
    expect(found[0]?.message).toContain('relative');
    if (result.source?.kind !== 'settings') throw new Error('not settings');
    expect(result.source.plugins.map((p) => p.name)).toEqual(['code-formatter']);
  });

  test('a bad item is dropped alone and the others stay', () => {
    const result = parse(inline({ source: { source: 'github', repo: 'a/b' } }, formatter));
    expect(errors(result.issues).map((i) => i.path)).toEqual(['plugins[0].name']);
    if (result.source?.kind !== 'settings') throw new Error('not settings');
    expect(result.source.plugins.map((p) => p.name)).toEqual(['code-formatter']);
  });

  test('plugins is required and an array', () => {
    expect(parse({ source: 'settings', name: 'team-tools' }).issues).toEqual([
      { severity: 'error', path: 'plugins', message: 'Invalid input' },
    ]);
    expect(
      errors(parse({ source: 'settings', name: 'team-tools', plugins: {} }).issues),
    ).toHaveLength(1);
  });

  test('owner is optional and read like a marketplace owner', () => {
    const source = sourceOf({
      ...inline(formatter),
      owner: { name: 'Acme', email: 'a@acme.example' },
    });
    expect(source).toMatchObject({ owner: { name: 'Acme', email: 'a@acme.example' } });
    expect(errors(parse({ ...inline(formatter), owner: {} }).issues).map((i) => i.path)).toEqual([
      'owner.name',
    ]);
  });
});
