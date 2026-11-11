/**
 * marketplace-reference.md § npm plugin source: "`package`: a registry package name ..., a name
 * with a version appended ..., or an `https` link"; "`version`: a version, a semver range, or a
 * dist-tag"; "Claude Code checks the `package` value before fetching anything. ... The refused
 * values include: A git address, a folder or `file:` path, or an `npm:` alias ... A tarball link
 * over `http`". The version a name carries, and the `version` field, are held to the same rule.
 */
import { describe, expect, test } from 'bun:test';
import type { PluginSource } from '../../src/format/marketplace/types.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import { spec } from '../support/spec.ts';

const npm = (pkg: string, version?: string): PluginSource => ({
  kind: 'npm',
  package: pkg,
  ...(version === undefined ? {} : { version }),
});
const planOf = (source: PluginSource) => planPluginFetch(source, { platform: 'posix' });

spec(['marketplace.source.npm'], () => {
  test.each([
    ['lodash@github:acme/evil', 'it is not an http or https link'],
    ['x@git+ssh://git@evil/x.git', 'it is not an http or https link'],
    ['x@file:../../etc', 'folder or file: path'],
    ['x@http://evil.example/x.tgz', 'tarball link over http'],
    ['x@acme/evil', 'it is a git address'],
    ['@s/x@github.com/acme/x', 'not a version, a semver range or a dist-tag'],
    ['x@https://registry.example.com/x.tgz', 'not a version, a semver range or a dist-tag'],
  ])('a name with "%s" appended is refused before any fetch', (pkg, reason) => {
    const result = planOf(npm(pkg));
    expect(result.plan).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.path).toBe('source.package');
    expect(result.issues[0]?.message).toContain(`"${pkg}" was not installed`);
    expect(result.issues[0]?.message).toContain(reason);
  });

  test.each([
    ['github:acme/evil', 'it is not an http or https link'],
    ['git+https://example.com/x.git', 'it is not an http or https link'],
    ['http://evil.example/x.tgz', 'tarball link over http'],
    ['not a range', 'not a version, a semver range or a dist-tag'],
  ])('a `version` field of "%s" is refused, named on the field', (version, reason) => {
    const result = planOf(npm('x', version));
    expect(result.plan).toBeUndefined();
    expect(result.issues[0]?.path).toBe('source.version');
    expect(result.issues[0]?.message).toContain(`"${version}" was not installed`);
    expect(result.issues[0]?.message).toContain(reason);
  });

  test('a version, a range and a dist-tag are fetched, appended or in the field', () => {
    expect(planOf(npm('x@^1.2.0')).plan).toMatchObject({
      spec: { package: 'x', version: '^1.2.0' },
    });
    expect(planOf(npm('@s/x@next')).plan).toMatchObject({
      spec: { package: '@s/x', version: 'next' },
    });
    expect(planOf(npm('x@', '~2.1')).plan).toMatchObject({
      spec: { package: 'x', version: '~2.1' },
    });
    expect(planOf(npm('x')).plan).toMatchObject({ spec: { package: 'x', version: 'latest' } });
  });
});

describe('judgments: the npm package name', () => {
  test('a name npm cannot name, such as one starting with "-", is refused', () => {
    for (const pkg of ['-evil', '.hidden', 'a b', '@scope/']) {
      const result = planOf(npm(pkg));
      expect(result.plan).toBeUndefined();
      expect(result.issues[0]?.path).toBe('source.package');
    }
  });

  test('the version field is not judged when the name carries a version, which wins', () => {
    expect(planOf(npm('x@1.0.0', 'github:acme/evil')).plan).toMatchObject({
      spec: { package: 'x', version: '1.0.0' },
    });
  });
});
