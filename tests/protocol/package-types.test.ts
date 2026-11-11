/**
 * Packaging judgment (spec/judgments.md): official type imports are dependencies of consumers,
 * not just of this checkout. An SDK used by a public declaration must be a dependency or a peer.
 * This is a distribution invariant, not a Claude Code compatibility requirement.
 */
import { expect, test } from 'bun:test';
import manifest from '../../package.json';
import { STANDARD_LAYOUT as publicLayout } from '@rsaryev/llx-plugin/layout';
import { STANDARD_LAYOUT } from '../../src/format/layout.ts';

const packageName = (specifier: string): string =>
  specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : (specifier.split('/')[0] ?? specifier);

test('every SDK imported by the official protocol boundary is declared for consumers', async () => {
  const declared = new Set([
    ...Object.keys(manifest.dependencies),
    ...Object.keys(manifest.peerDependencies),
  ]);
  const folder = new URL('../../src/protocol/', import.meta.url);
  for (const file of new Bun.Glob('*.ts').scanSync(folder.pathname)) {
    const text = await Bun.file(new URL(file, folder)).text();
    for (const match of text.matchAll(/from ['"](@[^'"]+)['"]/g)) {
      const specifier = match[1];
      if (specifier !== undefined) expect([...declared]).toContain(packageName(specifier));
    }
  }
});

test('the lightweight layout subpath is the same registry, without another implementation', () => {
  expect(publicLayout).toBe(STANDARD_LAYOUT);
});
