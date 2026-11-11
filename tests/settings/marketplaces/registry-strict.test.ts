/**
 * settings-reference.md § `extraKnownMarketplaces`, "Marketplace source types", the `strict` bullet:
 * "an entry in settings doesn't need `"strict": false`, because a settings file carries no manifest
 * fields to inline".
 */
import { expect, test } from 'bun:test';
import { plan } from '../../support/marketplace-registry.ts';
import { spec } from '../../support/spec.ts';

spec('policy.reference.Marketplace source types.strict', () => {
  test('an inline plugin entry registers without a strict field and with no issue', () => {
    const settings = {
      extraKnownMarketplaces: {
        'team-tools': {
          source: {
            source: 'settings',
            name: 'team-tools',
            plugins: [
              {
                name: 'code-formatter',
                source: { source: 'github', repo: 'acme-corp/code-formatter' },
              },
            ],
          },
        },
      },
    };
    const [only] = plan([['user', settings]]);
    expect(only?.status).toBe('register');
    expect(only?.issues).toEqual([]);
  });
});
