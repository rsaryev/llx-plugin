/**
 * settings-reference.md § `extraKnownMarketplaces` (`headersHelper` ignored from an `--add-dir` directory;
 * "Header filter" of an inline plugin entry), plugins/host-marketplace.md § "When Claude Code skips a
 * headersHelper command or drops its output" (a non-`https://` `url` source, routing and identity
 * headers).
 */
import { describe, expect, test } from 'bun:test';
import { plan } from '../../support/marketplace-registry.ts';
import { spec } from '../../support/spec.ts';

const helped = (headersHelper: string) => ({
  extraKnownMarketplaces: {
    m: {
      source: {
        source: 'url',
        url: 'https://m.example.com/marketplace.json',
        headers: { 'X-Team': 'a' },
        headersHelper,
      },
    },
    'team-tools': {
      source: {
        source: 'settings',
        name: 'team-tools',
        plugins: [
          {
            name: 'p',
            source: { source: 'archive', url: 'https://a.example.com/p.zip' },
            headers: { 'X-Team': 'a' },
            headersHelper,
          },
        ],
      },
    },
  },
});

const urlSource = (address: string) => ({
  extraKnownMarketplaces: {
    m: {
      source: {
        source: 'url',
        url: address,
        headers: { 'X-Team': 'a' },
        headersHelper: '/opt/bin/mint',
      },
    },
  },
});

/** An inline marketplace with one archive plugin that sends `headers`. */
const archiveSource = (headers: Record<string, string>) => ({
  source: 'settings' as const,
  name: 'archive',
  plugins: [
    {
      name: 'p',
      source: { source: 'archive' as const, url: 'https://a.example.com/p.zip' },
      headers,
    },
  ],
});

const declaring = (headers: Record<string, string>) => ({
  extraKnownMarketplaces: { archive: { source: archiveSource(headers) } },
});

spec(
  [
    'settings.key.extraKnownMarketplaces',
    'policy.reference.Marketplace source types.Header filter',
  ],
  () => {
    describe('headersHelper', () => {
      test('is ignored in an --add-dir directory, on a url source and on an inline plugin entry alike; the fixed headers stay', () => {
        const registrations = plan([['addDir', helped('/opt/bin/mint')]]);
        const text = JSON.stringify(registrations.map((r) => r.entry.source));
        expect(text).not.toContain('headersHelper');
        expect(text).not.toContain('/opt/bin/mint');
        expect(text.match(/X-Team/g)).toHaveLength(2);
        expect(registrations.map((r) => r.status)).toEqual(['register', 'register']);
      });

      test('is kept from user, project, local, --settings and managed files', () => {
        for (const scope of ['user', 'project', 'local', 'flag', 'managed'] as const) {
          const registrations = plan([[scope, helped('/opt/bin/mint')]]);
          expect(
            JSON.stringify(registrations.map((r) => r.entry.source)).match(/\/opt\/bin\/mint/g),
          ).toHaveLength(2);
        }
      });

      test('a url source whose address does not start with https:// keeps only its headers, in any file', () => {
        for (const scope of ['user', 'project', 'local', 'flag', 'managed', 'addDir'] as const) {
          const [insecure] = plan([[scope, urlSource('http://m.example.com/marketplace.json')]]);
          expect(insecure?.status).toBe('register');
          expect(insecure?.entry.source).toEqual({
            source: 'url',
            url: 'http://m.example.com/marketplace.json',
            headers: { 'X-Team': 'a' },
          });
        }
        const [secure] = plan([['user', urlSource('https://m.example.com/marketplace.json')]]);
        expect(secure?.entry.source).toMatchObject({ headersHelper: '/opt/bin/mint' });
      });
    });

    describe('the header filter of an inline plugin entry', () => {
      const sent = { Host: 'internal', Cookie: 'a=b', 'X-Forwarded-For': '1.2.3.4' };

      test('drops routing and identity names from a project, local or --add-dir file and keeps Authorization', () => {
        for (const scope of ['project', 'local', 'addDir'] as const) {
          const registrations = plan([
            [scope, declaring({ ...sent, Authorization: 'Bearer t', 'X-Team': 'a' })],
          ]);
          expect(registrations[0]?.status).toBe('register');
          expect(registrations[0]?.entry.source).toEqual(
            archiveSource({ Authorization: 'Bearer t', 'X-Team': 'a' }),
          );
        }
      });

      test('matches names without regard to case', () => {
        const registrations = plan([
          [
            'project',
            declaring({ HOST: 'a', cookie: 'b', 'x-forwarded-proto': 'https', Authorization: 't' }),
          ],
        ]);
        expect(registrations[0]?.entry.source).toEqual(archiveSource({ Authorization: 't' }));
      });

      test('is not applied to a user, --settings or managed file', () => {
        for (const scope of ['user', 'flag', 'managed'] as const) {
          const headers = { ...sent, Authorization: 'Bearer t' };
          expect(plan([[scope, declaring(headers)]])[0]?.entry.source).toEqual(
            archiveSource(headers),
          );
        }
      });
    });
  },
);
