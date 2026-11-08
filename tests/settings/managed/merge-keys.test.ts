/**
 * settings-reference.md, `managedSourcesBehavior` (the table: every key of the restriction
 * allowlist, values-taken-whole and highest-source-only rows, and the locks) and managed-settings.md
 * § Compose every managed source (the same table): each key of those rows, under `"merge"`.
 *
 * The managed-settings.md row "Keys read from the highest-ranked source only" has no requirement id
 * (its label is longer than the extractor's identifier limit), so its block is not under spec().
 */
import { describe, expect, test } from 'bun:test';
import type { Settings } from '../../../src/protocol/official.ts';
import { valueAt, withValueAt } from '../../../src/settings/managed/paths.ts';
import { compose, policyOf } from '../../support/managed.ts';
import { spec } from '../../support/spec.ts';

const COMPOSE = 'settingsMerge.managed.Compose every managed source';
const MERGE = { managedSourcesBehavior: 'merge' } as const;

/** The remote source opts in; the file below it is the one being combined. */
const merged = (remote: object, file: object) =>
  policyOf({ remote: { ...MERGE, ...remote }, file });

/** The settings holding `value` at the dotted `path`. */
const holding = (path: string, value: unknown): Settings => withValueAt({}, path, value);
const read = (settings: Settings, path: string): unknown => valueAt(settings, path);

type Row = readonly [path: string, high: unknown, low: unknown];

/** Every key of the highest-source-only row (settings-reference.md), each with two distinct valid values. */
const HIGHEST_ONLY: readonly Row[] = [
  ['apiKeyHelper', '/bin/key-high', '/bin/key-low'],
  ['awsAuthRefresh', 'aws sso login --high', 'aws sso login --low'],
  ['awsCredentialExport', '/bin/export-high', '/bin/export-low'],
  ['gcpAuthRefresh', 'gcloud auth login --high', 'gcloud auth login --low'],
  ['otelHeadersHelper', '/bin/otel-high', '/bin/otel-low'],
  ['proxyAuthHelper', '/bin/proxy-high', '/bin/proxy-low'],
  ['parentSettingsBehavior', 'merge', 'first-wins'],
  [
    'modelPicker',
    { options: [{ model: 'opus', label: 'High' }] },
    { options: [{ model: 'sonnet', label: 'Low' }] },
  ],
  ['policyHelper', { path: '/usr/local/bin/high' }, { path: '/usr/local/bin/low' }],
  ['permissions.defaultMode', 'plan', 'acceptEdits'],
];

describe('keys read from the highest-ranked source only (settings-reference.md, managedSourcesBehavior)', () => {
  test.each(HIGHEST_ONLY)('%s: the highest source supplies its own value', (path, high, low) => {
    const settings = merged(holding(path, high), holding(path, low));
    expect(read(settings, path)).toEqual(high);
  });

  test.each(HIGHEST_ONLY)(
    '%s: a lower source value is ignored even when the highest source sets none',
    (path, _high, low) => {
      const settings = merged({ model: 'a' }, holding(path, low));
      expect(read(settings, path)).toBeUndefined();
    },
  );

  test.each(HIGHEST_ONLY)('%s: a source that is the highest delivers its value', (path, high) => {
    expect(read(compose({ file: holding(path, high) }).layer.settings, path)).toEqual(high);
  });

  test('a key other than these still comes from the highest source that sets it', () => {
    expect(merged({ model: 'a' }, { model: 'b', cleanupPeriodDays: 7 }).cleanupPeriodDays).toBe(7);
  });
});

/** The locks beyond the four the docs name, each with its strict value and a looser one a source may set. */
const LOCKS: readonly (readonly [path: string, strict: unknown, loose: unknown])[] = [
  ['allowManagedMcpServersOnly', true, false],
  ['allowManagedPermissionRulesOnly', true, false],
  ['sandbox.filesystem.allowManagedReadPathsOnly', true, false],
  ['sandbox.network.allowManagedDomainsOnly', true, false],
  ['sandbox.network.strictAllowlist', true, false],
  ['disableSideloadFlags', true, false],
  ['disableCommandPluginSources', true, false],
];

spec(`${COMPOSE}.Locks`, () => {
  test.each(LOCKS)('%s: the strictest value any source sets applies', (path, strict, loose) => {
    expect(read(merged(holding(path, loose), holding(path, strict)), path)).toBe(strict);
    expect(read(merged(holding(path, strict), holding(path, loose)), path)).toBe(strict);
    expect(read(merged({ model: 'a' }, holding(path, strict)), path)).toBe(strict);
  });

  test.each(LOCKS)(
    '%s: a looser value applies only from the highest source',
    (path, _strict, loose) => {
      expect(read(merged(holding(path, loose), { model: 'b' }), path)).toBe(loose);
      expect(read(merged(holding(path, loose), holding(path, loose)), path)).toBe(loose);
      expect(read(merged({ model: 'a' }, holding(path, loose)), path)).toBeUndefined();
    },
  );

  test('disableAutoMode: "disable" from any source applies, and it is the only strict value', () => {
    expect(merged({ model: 'a' }, { disableAutoMode: 'disable' }).disableAutoMode).toBe('disable');
    expect(merged({ disableAutoMode: 'disable' }, { model: 'b' }).disableAutoMode).toBe('disable');
    expect(merged({ model: 'a' }, { model: 'b' }).disableAutoMode).toBeUndefined();
  });
});

spec(`${COMPOSE}.Restriction allowlists`, () => {
  test('allowedProviders is taken whole from the highest source that sets it, else from the next down', () => {
    const both = compose({
      plist: { ...MERGE, allowedProviders: ['anthropic'] },
      file: { allowedProviders: ['bedrock', 'vertex'] },
    });
    expect(both.layer.settings.allowedProviders).toEqual(['anthropic']);
    const below = compose({
      plist: { ...MERGE, model: 'a' },
      file: { allowedProviders: ['bedrock', 'vertex'] },
    });
    expect(below.layer.settings.allowedProviders).toEqual(['bedrock', 'vertex']);
  });
});

const pair = (name: string) => ({
  accessKeyIdVar: `${name}_ID`,
  secretAccessKeyVar: `${name}_KEY`,
});

spec(`${COMPOSE}.Values taken whole`, () => {
  test('sandbox.credentials.awsPairs is not combined with a lower source', () => {
    const settings = merged(
      { sandbox: { credentials: { awsPairs: [pair('HIGH')] } } },
      { sandbox: { credentials: { awsPairs: [pair('LOW')] } } },
    );
    expect(settings.sandbox?.credentials?.awsPairs).toEqual([pair('HIGH')]);
  });

  test('the next source down supplies it when the highest does not set it', () => {
    const settings = merged(
      { model: 'a' },
      { sandbox: { credentials: { awsPairs: [pair('LOW')] } } },
    );
    expect(settings.sandbox?.credentials?.awsPairs).toEqual([pair('LOW')]);
  });
});
