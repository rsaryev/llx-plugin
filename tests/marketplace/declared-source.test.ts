/**
 * plugins/troubleshooting.md § `Cannot add marketplace "<name>": its source doesn't match its
 * extraKnownMarketplaces entry in user or managed settings`: the refusal, what counts as a match, and the
 * fix the docs give. The pre-2.1.287 wording is not produced.
 */
import { expect, test } from 'bun:test';
import { concludeMarketplaceAdd } from '../../src/cli/marketplace-add.ts';
import {
  declaredSourceFix,
  declaredSourceMismatch,
  declaredSourceRefusal,
} from '../../src/marketplace/declared-source.ts';
import type { MarketplaceSource } from '../../src/format/marketplace/types.ts';
import { fetched, started } from '../support/marketplace-add.ts';
import { spec } from '../support/spec.ts';

const PATH = '.claude-plugin/marketplace.json';
const github = (repo: string, ref?: string): MarketplaceSource => ({
  kind: 'github',
  repo,
  path: PATH,
  ...(ref === undefined ? {} : { ref }),
});
const gitUrl = (url: string): MarketplaceSource => ({ kind: 'git', url, path: PATH });

spec(
  `install.troubleshooting.Cannot add marketplace "<name>": its source doesn't match its extraKnownMarketplaces entry in user or managed settings`,
  () => {
    test('the message is the quoted one, naming the marketplace', () => {
      expect(declaredSourceMismatch('acme')).toBe(
        `Cannot add marketplace "acme": its source doesn't match its extraKnownMarketplaces entry in user or managed settings`,
      );
      expect(declaredSourceMismatch('acme')).not.toContain('network source');
    });
    test('sources of the same type and the same value in every field match, so the add goes on', () => {
      const same = github('acme-corp/claude-plugins', 'v1.2.0');
      expect(
        declaredSourceRefusal({
          name: 'acme',
          given: same,
          declared: github('acme-corp/claude-plugins', 'v1.2.0'),
        }),
      ).toBeUndefined();
    });
    test('an entry that sets a ref you did not pass counts as different', () => {
      expect(
        declaredSourceRefusal({
          name: 'acme',
          given: github('acme-corp/claude-plugins'),
          declared: github('acme-corp/claude-plugins', 'v1.2.0'),
        }),
      ).toBe(declaredSourceMismatch('acme'));
    });
    test('a github entry counts as different when the repository is given as an https://github.com/ URL', () => {
      expect(
        declaredSourceRefusal({
          name: 'acme',
          given: gitUrl('https://github.com/acme-corp/claude-plugins'),
          declared: github('acme-corp/claude-plugins'),
        }),
      ).toBe(declaredSourceMismatch('acme'));
    });
    test('with no declared entry nothing is refused', () => {
      expect(declaredSourceRefusal({ name: 'acme', given: github('a/b') })).toBeUndefined();
    });
    test('the add registers nothing: a failed result and no declaration is written', () => {
      const start = started({ source: 'acme-corp/claude-plugins' });
      const done = concludeMarketplaceAdd(
        start,
        fetched('acme', { declared: github('acme-corp/claude-plugins', 'v1.2.0') }),
      );
      expect(done.declare).toBeUndefined();
      expect(JSON.stringify(done.output)).toContain('its source doesn');
    });
    test('the first fix is the declared source typed as the entry writes it, with #ref', () => {
      expect(declaredSourceFix(github('acme-corp/claude-plugins', 'v1.2.0'))).toBe(
        '/plugin marketplace add acme-corp/claude-plugins#v1.2.0',
      );
      expect(declaredSourceFix(github('acme-corp/claude-plugins'))).toBe(
        '/plugin marketplace add acme-corp/claude-plugins',
      );
    });
  },
);
