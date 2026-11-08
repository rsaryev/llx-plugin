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
import {
  lfsPointerIssue,
  lfsPointerIssues,
  readLfsPointer,
} from '../../src/marketplace/lfs-pointer.ts';
import { memoryFiles } from '../support/ports.ts';
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

  test('a cloned plugin with a pointer file for a component gets a warning that names the file', async () => {
    const files = memoryFiles({
      '.claude-plugin/plugin.json': '{"name":"p"}',
      'skills/review/SKILL.md': '# Review\n',
      'skills/review/model.bin': POINTER,
      'hooks/hooks.json': POINTER.replaceAll('\n', '\r\n'),
    });
    const issues = await lfsPointerIssues(files);
    expect(issues.map((one) => [one.severity, one.path])).toEqual([
      ['warning', 'hooks/hooks.json'],
      ['warning', 'skills/review/model.bin'],
    ]);
    expect(issues[0]?.message).toContain('hooks/hooks.json is a Git LFS pointer file');
    expect(issues[0]?.message).toContain('Keep plugin files out of Git LFS');
  });

  test('a plugin whose files are real content gets no warning, however small', async () => {
    const files = memoryFiles({
      'skills/a/SKILL.md': '# A\n',
      'commands/x.md': 'version 1\n',
      'big.txt': POINTER.padEnd(5000, ' '),
    });
    expect(await lfsPointerIssues(files)).toEqual([]);
  });

  test('a pointer in .git, behind a link or past 1 KiB is not reported', async () => {
    const files = memoryFiles({
      '.git/lfs/pointer': POINTER,
      'linked.bin': { symlink: 'skills/model.bin' },
      'skills/model.bin': 'real content',
    });
    expect(await lfsPointerIssues(files)).toEqual([]);
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

  test('a pointer whose lines end with CRLF, as a checkout that converts line ends leaves it, is one', () => {
    expect(readLfsPointer(POINTER.replaceAll('\n', '\r\n'))).toEqual({ oid: OID, size: 12345 });
  });
});
