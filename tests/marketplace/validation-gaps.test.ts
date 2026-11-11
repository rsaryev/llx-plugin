/**
 * plugins/marketplace-reference.md § Failures that validation doesn't catch: "`claude plugin
 * validate` doesn't report every failure. An entry `hooks` written as a file path or array passes
 * validation, and the error appears only when the plugin loads ... Errors fetching a `source` also
 * appear only after install, not in validation."
 */
import { expect, test } from 'bun:test';
import { mergeEntryWithManifest } from '../../src/format/marketplace/entry-merge.ts';
import { validateMarketplace } from '../../src/format/marketplace/marketplace.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import { withFields } from '../support/marketplace-fixtures.ts';
import { loaded, rawEntry } from '../support/marketplace-entries.ts';
import { spec } from '../support/spec.ts';

const withEntry = (entry: Record<string, unknown>) =>
  withFields({ plugins: [{ name: 'formatter', ...entry }] });

spec("marketplace.rule.Failures that validation doesn't catch", () => {
  test('an entry hooks written as a file path or an array passes validation; the error appears only when the plugin loads', () => {
    for (const hooks of ['./hooks/extra.json', ['./hooks/extra.json']]) {
      const market = withEntry({ source: './plugins/formatter', hooks });
      expect(validateMarketplace(market)).toEqual([]);
      const merged = mergeEntryWithManifest(loaded(rawEntry({ hooks })), undefined);
      expect(merged.issues[0]?.message).toContain('not yet supported in a marketplace entry');
    }
  });

  test('an error fetching a source appears only after install: validation reports nothing for a source that cannot be fetched', () => {
    const sources = [
      { source: 'archive', url: 'https://localhost/formatter.zip' },
      { source: 'npm', package: 'github:acme/formatter' },
      { source: 'github', repo: 'your-org/formatter' },
    ];
    for (const source of sources) {
      expect(validateMarketplace(withEntry({ source }))).toEqual([]);
    }
  });

  test('the same sources are refused when the install plans the fetch', () => {
    const refused = [
      { kind: 'archive', url: 'https://localhost/formatter.zip' },
      { kind: 'npm', package: 'github:acme/formatter' },
    ] as const;
    for (const source of refused) {
      expect(planPluginFetch(source, { platform: 'posix' }).issues).toHaveLength(1);
    }
  });
});
