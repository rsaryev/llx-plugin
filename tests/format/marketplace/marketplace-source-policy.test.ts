/**
 * marketplace-reference.md § Marketplace sources (the table), § Source values valid only in policy
 * lists. Rules without a requirement id of their own, and the kit's judgments (spec/judgments.md).
 */
import { expect, test } from 'bun:test';
import { errors, parse, warnings } from '../../support/marketplace-source.ts';

test('npm parses but fails to load in extraKnownMarketplaces; in a policy list it just parses', () => {
  const raw = { source: 'npm', package: '@acme/claude-marketplace' };
  const loose = parse(raw, false);
  expect(loose.source).toMatchObject({ kind: 'npm', package: '@acme/claude-marketplace' });
  expect(loose.loadStatus).toBe('fails: NPM marketplace sources not yet implemented');
  expect(warnings(loose.issues)).toHaveLength(1);
  expect(parse(raw, true).issues).toEqual([]);
});

test('skills-dir, hostPattern and pathPattern are policy-list values; elsewhere they parse and fail to load', () => {
  const raws = [
    { source: 'skills-dir' },
    { source: 'hostPattern', hostPattern: '^git\\.example\\.com$' },
    { source: 'pathPattern', pathPattern: '^/opt/approved/' },
  ] as const;
  for (const raw of raws) {
    const policy = parse(raw, true);
    expect(policy.source?.kind).toBe(raw.source);
    expect(policy.issues).toEqual([]);
    const loose = parse(raw, false);
    expect(loose.source?.kind).toBe(raw.source);
    expect(loose.loadStatus).toBe('fails: Unsupported marketplace source type');
    expect(warnings(loose.issues)).toHaveLength(1);
  }
  expect(errors(parse({ source: 'hostPattern' }, true).issues).map((i) => i.path)).toEqual([
    'hostPattern',
  ]);
});

test('a source of no known type, or not an object, is Invalid input and does not load', () => {
  for (const raw of [{ source: 'ftp', url: 'x' }, { url: 'x' }, 'owner/repo', null, []]) {
    const result = parse(raw);
    expect(result.source).toBeUndefined();
    expect(result.issues).toEqual([
      { severity: 'error', path: 'source', message: 'Invalid input' },
    ]);
    expect(result.loadStatus).toBe('fails: Unsupported marketplace source type');
  }
});

test('an unknown key inside a source is a warning and is dropped', () => {
  const result = parse({ source: 'github', repo: 'a/b', autoUpdate: true });
  expect(warnings(result.issues).map((i) => i.path)).toEqual(['autoUpdate']);
  expect(result.source).not.toHaveProperty('autoUpdate');
});

test('settings entries read only the seven documented keys; others are unknown and ignored', () => {
  const result = parse({
    source: 'settings',
    name: 'team-tools',
    plugins: [{ name: 'f', source: { source: 'github', repo: 'a/b' }, category: 'x' }],
  });
  expect(warnings(result.issues).map((i) => i.path)).toEqual(['plugins[0].category']);
  if (result.source?.kind !== 'settings') throw new Error('not settings');
  expect(result.source.plugins[0]).not.toHaveProperty('category');
});

test('a routing header on a settings entry draws no catalog warning: the filter depends on the file', () => {
  const result = parse({
    source: 'settings',
    name: 'team-tools',
    plugins: [
      {
        name: 'internal',
        source: { source: 'archive', url: 'https://r.example/i.zip' },
        headers: { Cookie: 'a=b' },
      },
    ],
  });
  expect(result.issues).toEqual([]);
});

test('settings entries are unique by name', () => {
  const entry = { name: 'f', source: { source: 'github', repo: 'a/b' } };
  const result = parse({ source: 'settings', name: 'team-tools', plugins: [entry, entry] });
  expect(errors(result.issues).length).toBeGreaterThan(0);
  if (result.source?.kind !== 'settings') throw new Error('not settings');
  expect(result.source.plugins).toHaveLength(1);
});
