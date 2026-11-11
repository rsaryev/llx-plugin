/**
 * Judgment (spec/judgments.md, `src/marketplace/archive-source.ts`, the plugin-root row): the docs
 * say only "The plugin root may be at the top of the zip or one directory down"
 * (plugins/marketplace-reference.md, "archive plugin source"). A zip that macOS Finder makes holds
 * a `__MACOSX` folder of resource forks next to the wrapped plugin; it is not counted when the
 * root is found, so tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { fetchWith, ok, refusal, stats } from '../support/marketplace-archive.ts';

describe('the plugin root of an archive', () => {
  test('a __MACOSX folder beside the one wrapping directory is not counted', async () => {
    for (const topLevel of [
      ['formatter', '__MACOSX'],
      ['__MACOSX/', 'formatter/'],
    ]) {
      expect(await fetchWith([ok], { scan: stats({ topLevel }) }).result).toMatchObject({
        root: 'formatter',
      });
    }
  });

  test('a __MACOSX folder alone is no plugin root', async () => {
    const issue = await refusal(fetchWith([ok], { scan: stats({ topLevel: ['__MACOSX'] }) }));
    expect(issue.message).toContain('plugin root');
  });
});
