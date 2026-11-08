/**
 * plugins/host-marketplace.md § Keep plugin files out of Git LFS: "When users add a marketplace
 * hosted in a git repository, or install a git-based plugin it lists, Claude Code clones that
 * marketplace or plugin repository onto their machine. The clone never downloads LFS content, so
 * LFS-tracked files arrive as pointer files." The pointer's own text is Git LFS's, a judgment
 * (spec/judgments.md), tested outside `spec(...)`.
 */
import { describe, expect, test } from 'bun:test';
import { planMarketplaceFetch } from '../../src/marketplace/marketplace-fetch-plan.ts';
import { planPluginFetch } from '../../src/marketplace/fetch-plan.ts';
import { lfsPointerIssue, readLfsPointer } from '../../src/marketplace/lfs-pointer.ts';
import { spec } from '../support/spec.ts';

const OID = 'a'.repeat(64);
const POINTER = `version https://git-lfs.github.com/spec/v1\noid sha256:${OID}\nsize 12345\n`;

spec('marketplace.hosting.Keep plugin files out of Git LFS', () => {
  test('the clone of every git-based plugin source arrives as pointer files, never as LFS content', () => {
    const sources = [
      { kind: 'github', repo: 'acme/formatter' },
      { kind: 'url', url: 'https://git.example.com/p.git' },
      { kind: 'git-subdir', url: 'acme/mono', path: 'tools/p' },
    ] as const;
    for (const source of sources) {
      expect(planPluginFetch(source, { platform: 'posix' }).plan).toMatchObject({
        kind: 'git',
        lfs: 'pointer-files',
      });
    }
  });

  test('the clone of a marketplace hosted in a git repository does the same, whatever skipLfs says', () => {
    for (const skipLfs of [undefined, false, true]) {
      const planned = planMarketplaceFetch({
        kind: 'github',
        repo: 'acme/marketplace',
        path: '.claude-plugin/marketplace.json',
        ...(skipLfs === undefined ? {} : { skipLfs }),
      });
      expect(planned).toMatchObject({ kind: 'git', lfs: 'pointer-files' });
    }
  });

  test('a file that is a pointer is told apart from content, and warned about', () => {
    expect(readLfsPointer(POINTER)).toEqual({ oid: OID, size: 12345 });
    expect(lfsPointerIssue('skills/model.bin').message).toContain(
      'Keep plugin files out of Git LFS',
    );
    expect(lfsPointerIssue('skills/model.bin').severity).toBe('warning');
  });
});

describe('judgments: LFS pointers', () => {
  test('other text is not a pointer', () => {
    for (const text of [
      '',
      '# a skill\n',
      `version https://git-lfs.github.com/spec/v1\noid sha256:${'g'.repeat(64)}\nsize 1\n`,
      `version https://git-lfs.github.com/spec/v1\noid sha256:${OID}\n`,
      `${POINTER}extra line\n`,
      `x${POINTER}`,
      POINTER.padEnd(5000, ' '),
    ]) {
      expect(readLfsPointer(text)).toBeUndefined();
    }
  });
});
