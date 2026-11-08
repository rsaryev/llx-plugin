/**
 * plugins/manifest-reference.md § Fields, § Unrecognized fields, § Validate the manifest: every
 * top-level key with its documented type. A key of the wrong type fails validation ("Validation
 * failed: the manifest has a type mismatch"), and the plugin does not load.
 */
import { expect, test } from 'bun:test';
import { readManifest } from '../../src/format/index.ts';
import { spec } from '../support/spec.ts';

const loads = (raw: Record<string, unknown>) => readManifest({ name: 'demo', ...raw });
const errorsOf = (raw: Record<string, unknown>) =>
  loads(raw).issues.filter((found) => found.severity === 'error');

/** Each field, a value of its documented type, and a value of another type. */
const FIELDS: readonly [field: string, valid: unknown, invalid: unknown][] = [
  ['displayName', 'Deploy Tools', 3],
  ['version', '1.2.0', 1.2],
  ['description', 'Deployment commands', ['x']],
  ['repository', 'not even a url', {}],
  ['license', 'MIT', true],
  ['keywords', ['deployment', 'ci'], 'deployment'],
  ['metadata', { catalogId: 'cat-123' }, 'cat-123'],
  ['icon', './logo.png', 1],
  ['documentationUrl', 'https://example.com/docs', 1],
  ['supportUrl', 'https://example.com/support', 1],
  ['privacyPolicyUrl', 'https://example.com/privacy', 1],
  ['termsOfServiceUrl', 'https://example.com/terms', 1],
  ['defaultEnabled', false, 'yes'],
  ['settings', { agent: 'reviewer' }, 'reviewer'],
  ['types', './types/index.d.ts', 1],
  ['$schema', 'https://example.com/schema.json', 1],
];

for (const [field, valid, invalid] of FIELDS) {
  spec(`manifest.field.${field}`, () => {
    test(`accepts a value of the documented type`, () => {
      expect(errorsOf({ [field]: valid })).toEqual([]);
      expect(loads({ [field]: valid }).manifest).toMatchObject({ [field]: valid });
    });
    test('a value of another type fails, and the plugin does not load', () => {
      const result = loads({ [field]: invalid });
      expect(result.manifest).toBeUndefined();
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', path: field }),
      );
    });
  });
}

spec('manifest.field.name', () => {
  test('is the only required key', () => {
    expect(readManifest({ name: 'deploy-tools' }).manifest).toEqual({ name: 'deploy-tools' });
  });
  test('a manifest without it does not load', () => {
    const result = readManifest({ description: 'x' });
    expect(result.manifest).toBeUndefined();
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', path: 'name' }),
    );
  });
});

spec('manifest.field.author', () => {
  test('takes a required name with an optional email and url', () => {
    const author = { name: 'Example Team', email: 'dev@example.com', url: 'https://example.com' };
    expect(loads({ author }).manifest?.author).toEqual(author);
  });
  test('an author without a name fails', () => {
    expect(errorsOf({ author: { email: 'dev@example.com' } })).not.toEqual([]);
  });
});

spec('manifest.field.homepage', () => {
  test('a URL loads', () => {
    expect(loads({ homepage: 'https://example.com/docs' }).manifest?.homepage).toBe(
      'https://example.com/docs',
    );
  });
  test('a value that does not parse as a URL keeps the plugin from loading', () => {
    expect(loads({ homepage: 'example dot com' }).manifest).toBeUndefined();
  });
});

spec('manifest.field.dependencies', () => {
  test('takes names, name@marketplace and objects', () => {
    const dependencies = [
      'secrets-vault',
      'audit@acme',
      { name: 'linter', marketplace: 'acme', version: '^2.0.0' },
    ];
    expect(loads({ dependencies }).manifest?.dependencies).toEqual(dependencies);
  });
  test('an entry of another shape fails', () => {
    expect(errorsOf({ dependencies: [42] })).not.toEqual([]);
  });
});

spec('manifest.field.experimental', () => {
  test('holds themes, monitors and evals', () => {
    const experimental = { themes: './themes/', monitors: './config/monitors.json', evals: 'qa' };
    expect(loads({ experimental }).manifest?.experimental).toEqual(experimental);
  });
});

test('an unrecognized top-level key is stripped with a warning, and the plugin loads', () => {
  const result = loads({ colour: 'blue' });
  expect(result.manifest).toEqual({ name: 'demo' });
  expect(result.issues).toEqual([expect.objectContaining({ severity: 'warning', path: 'colour' })]);
});
