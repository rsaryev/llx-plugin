/**
 * marketplace-reference.md § Top-level fields (the `description`, `version`, `metadata.description`
 * and `metadata.version` rows) and § Validation messages ("No marketplace description provided").
 * The documented example file is the base of every case.
 */
import { expect, test } from 'bun:test';
import {
  effectiveDescription,
  effectiveVersion,
  readMarketplace,
  validateMarketplace,
} from '../../../src/format/marketplace/marketplace.ts';
import {
  docMarketplace,
  errorsOf,
  recordingEntryReader,
  withFields,
} from '../../support/marketplace-fixtures.ts';
import { spec } from '../../support/spec.ts';

const NO_DESCRIPTION =
  'No marketplace description provided. Adding a description helps users understand what this marketplace offers';

const read = (raw: unknown) => readMarketplace(raw, {}, recordingEntryReader().read);
const validate = (raw: unknown) => validateMarketplace(raw, {}, recordingEntryReader().read);

spec('marketplace.field.description', () => {
  test('is carried and is the description shown to users', () => {
    const marketplace = read(docMarketplace()).marketplace;
    expect(marketplace?.description).toBe('Plugins for my team');
    expect(marketplace && effectiveDescription(marketplace)).toBe('Plugins for my team');
  });

  test('"claude plugin validate" warns when it is missing, and the marketplace still loads', () => {
    const raw = withFields({ description: undefined });
    expect(read(raw).marketplace).toBeDefined();
    expect(validate(raw)).toEqual([
      { severity: 'warning', path: 'description', message: NO_DESCRIPTION },
    ]);
  });

  test('a description that is not a string is an error', () => {
    const result = read(withFields({ description: ['Plugins'] }));
    expect(result.marketplace).toBeUndefined();
    expect(errorsOf(result.issues).map((found) => found.path)).toEqual(['description']);
  });
});

spec('marketplace.field.version', () => {
  test('is the marketplace manifest version, carried and never required', () => {
    expect(read(withFields({ version: '1.2.0' })).marketplace?.version).toBe('1.2.0');
    const bare = read(docMarketplace());
    expect(bare.marketplace?.version).toBeUndefined();
    expect(bare.issues).toEqual([]);
  });

  test('effectiveVersion reads it', () => {
    const marketplace = read(withFields({ version: '1.2.0' })).marketplace;
    expect(marketplace && effectiveVersion(marketplace)).toBe('1.2.0');
  });

  test('a version that is not a string is an error', () => {
    expect(read(withFields({ version: 2 })).marketplace).toBeUndefined();
  });
});

spec('marketplace.field.metadata.description', () => {
  test('is an alternate location for description', () => {
    const raw = withFields({ description: undefined, metadata: { description: 'Via metadata' } });
    const result = read(raw);
    expect(result.marketplace && effectiveDescription(result.marketplace)).toBe('Via metadata');
    expect(result.marketplace?.description).toBeUndefined();
  });

  test('counts as the description: no "No marketplace description" warning', () => {
    const raw = withFields({ description: undefined, metadata: { description: 'Via metadata' } });
    expect(read(raw).issues).toEqual([]);
  });

  test('the top-level description wins when both are set', () => {
    const raw = withFields({ metadata: { description: 'Via metadata' } });
    const marketplace = read(raw).marketplace;
    expect(marketplace && effectiveDescription(marketplace)).toBe('Plugins for my team');
  });

  test('a description that is not a string is an error on metadata.description', () => {
    const result = read(withFields({ metadata: { description: 3 } }));
    expect(result.marketplace).toBeUndefined();
    expect(errorsOf(result.issues).map((found) => found.path)).toEqual(['metadata.description']);
  });
});

spec('marketplace.field.metadata.version', () => {
  test('is an alternate location for version', () => {
    const marketplace = read(withFields({ metadata: { version: '0.4.0' } })).marketplace;
    expect(marketplace && effectiveVersion(marketplace)).toBe('0.4.0');
    expect(marketplace?.version).toBeUndefined();
  });

  test('the top-level version wins when both are set', () => {
    const raw = withFields({ version: '2.0.0', metadata: { version: '0.4.0' } });
    const marketplace = read(raw).marketplace;
    expect(marketplace && effectiveVersion(marketplace)).toBe('2.0.0');
  });

  test('a key under metadata that Claude Code does not read is an "Unknown field" warning on it', () => {
    const result = read(withFields({ metadata: { version: '0.4.0', owner: 'x' } }));
    expect(result.marketplace).toBeDefined();
    expect(result.issues).toEqual([
      {
        severity: 'warning',
        path: 'metadata.owner',
        message: "Unknown field 'owner'. Claude Code ignores it at load time.",
      },
    ]);
  });

  test('a metadata that is not an object, or a version that is not a string, is an error', () => {
    expect(read(withFields({ metadata: 'x' })).marketplace).toBeUndefined();
    expect(read(withFields({ metadata: { version: 1 } })).marketplace).toBeUndefined();
  });
});

spec('marketplace.field.metadata.pluginRoot', () => {
  test('is read, not unknown, and carried on metadata.pluginRoot', () => {
    const result = read(withFields({ metadata: { pluginRoot: './plugins' } }));
    expect(result.issues).toEqual([]);
    expect(result.marketplace?.metadata?.pluginRoot).toBe('./plugins');
  });

  test('is absent when the file does not set it', () => {
    expect(read(withFields({ metadata: { version: '1.0.0' } })).marketplace?.metadata).toEqual({
      version: '1.0.0',
    });
  });

  test('a pluginRoot that is not a string is an error on metadata.pluginRoot', () => {
    const result = read(withFields({ metadata: { pluginRoot: 3 } }));
    expect(result.marketplace).toBeUndefined();
    expect(result.issues).toContainEqual({
      severity: 'error',
      path: 'metadata.pluginRoot',
      message: 'Invalid input: expected string, received number',
    });
  });
});
