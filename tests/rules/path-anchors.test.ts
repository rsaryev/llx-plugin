/**
 * permissions.md § How path patterns match: "Read and Edit rules both use gitignore pattern syntax
 * with four distinct pattern types" (`//path`, `~/path`, `/path`, `path` or `./path`), the examples
 * under the table, and the warning that "a pattern like `/Users/alice/file` isn't an absolute path".
 * Every case is asserted as an allow, a deny and an ask rule, because the anchor of a pattern does
 * not depend on the behaviour (the depth of a single-segment directory does; path-depth.test.ts).
 */
import { expect, test } from 'bun:test';
import { allows, asks, denies, withPaths } from '../support/path-rules.ts';
import { spec } from '../support/spec.ts';

const CHECKS = { allow: allows, deny: denies, ask: asks } as const;

/** One rule against paths it covers and paths it does not, in every behaviour. */
function row(
  rule: string,
  matches: readonly string[],
  doesNot: readonly string[],
  tool = 'Read',
): void {
  for (const [behavior, check] of Object.entries(CHECKS)) {
    for (const path of matches) {
      expect([behavior, rule, path, check(rule, path, { tool })]).toEqual([
        behavior,
        rule,
        path,
        true,
      ]);
    }
    for (const path of doesNot) {
      expect([behavior, rule, path, check(rule, path, { tool })]).toEqual([
        behavior,
        rule,
        path,
        false,
      ]);
    }
  }
}

spec('permissions.rule.//path', () => {
  test('Read(//Users/alice/secrets/**) is the absolute path /Users/alice/secrets/**', () => {
    row(
      'Read(//Users/alice/secrets/**)',
      ['/Users/alice/secrets/key', '/Users/alice/secrets/deep/er/key'],
      ['/work/app/Users/alice/secrets/key', '/Users/bob/secrets/key', '/Users/alice/other/key'],
    );
  });

  test('Edit(//tmp/scratch.txt) edits the absolute path /tmp/scratch.txt and nothing else', () => {
    row(
      'Edit(//tmp/scratch.txt)',
      ['/tmp/scratch.txt'],
      ['/tmp/scratch.txt.bak', '/work/app/tmp/scratch.txt', '/tmp/other/scratch.txt'],
      'Edit',
    );
  });

  test('the same rule means the same path from every settings source', () => {
    for (const kind of ['project', 'user', 'local', 'cli', 'session'] as const) {
      expect(denies('Read(//tmp/scratch.txt)', '/tmp/scratch.txt', { source: { kind } })).toBe(
        true,
      );
      expect(
        denies('Read(//tmp/scratch.txt)', '/work/app/tmp/scratch.txt', { source: { kind } }),
      ).toBe(false);
    }
  });
});

spec('permissions.rule.~/path', () => {
  test('Read(~/Documents/*.pdf) is the pdf files directly in the home Documents folder', () => {
    row(
      'Read(~/Documents/*.pdf)',
      ['/home/alice/Documents/report.pdf'],
      [
        '/home/alice/Documents/report.txt',
        '/home/alice/Documents/sub/report.pdf',
        '/home/alice/Other/report.pdf',
        '/home/bob/Documents/report.pdf',
        '/work/app/Documents/report.pdf',
      ],
    );
  });

  test('Read(~/.zshrc) reads the home directory .zshrc', () => {
    row('Read(~/.zshrc)', ['/home/alice/.zshrc'], ['/work/app/.zshrc', '/home/alice/x/.zshrc']);
  });

  test('the home directory comes from the context, whatever the source', () => {
    const ctx = withPaths({ home: '/Users/carol' });
    expect(denies('Read(~/.zshrc)', '/Users/carol/.zshrc', { ctx })).toBe(true);
    expect(denies('Read(~/.zshrc)', '/home/alice/.zshrc', { ctx })).toBe(false);
  });
});

spec('permissions.rule./path', () => {
  test('Edit(/docs/**) edits <primary working directory>/docs/, not /docs/ or .claude/docs/', () => {
    row(
      'Edit(/docs/**)',
      ['/work/app/docs/a.md', '/work/app/docs/deep/a.md'],
      ['/docs/a.md', '/work/app/.claude/docs/a.md', '/work/app/src/docs/a.md'],
      'Edit',
    );
  });

  test('Edit(/src/**/*.ts) is <primary working directory>/src/**/*.ts in project settings', () => {
    row(
      'Edit(/src/**/*.ts)',
      ['/work/app/src/a.ts', '/work/app/src/a/b/c.ts'],
      ['/work/app/src/a.js', '/work/app/lib/src/a.ts', '/src/a.ts'],
      'Edit',
    );
  });

  test('a pattern like /Users/alice/file is not an absolute path: it anchors at the source', () => {
    row('Read(/Users/alice/file)', ['/work/app/Users/alice/file'], ['/Users/alice/file']);
  });

  test('the primary working directory, not the current directory, is the project anchor', () => {
    const ctx = withPaths({ cwd: '/work/app/sub', primaryWorkingDirectory: '/work/app' });
    expect(denies('Edit(/src/**)', '/work/app/src/a.ts', { ctx, tool: 'Edit' })).toBe(true);
    expect(denies('Edit(/src/**)', '/work/app/sub/src/a.ts', { ctx, tool: 'Edit' })).toBe(false);
  });
});

spec('permissions.rule.path', () => {
  test('Read(*.env) is <cwd>/*.env: any file ending in .env at or under the current directory', () => {
    const ctx = withPaths({ cwd: '/work/app/sub', primaryWorkingDirectory: '/work/app' });
    for (const [behavior, check] of Object.entries(CHECKS)) {
      const covered = (path: string) => check('Read(*.env)', path, { ctx });
      expect([behavior, covered('/work/app/sub/.env')]).toEqual([behavior, true]);
      expect([behavior, covered('/work/app/sub/prod.env')]).toEqual([behavior, true]);
      expect([behavior, covered('/work/app/sub/a/b/prod.env')]).toEqual([behavior, true]);
      expect([behavior, covered('/work/app/prod.env')]).toEqual([behavior, false]);
      expect([behavior, covered('/work/app/sub/prod.envx')]).toEqual([behavior, false]);
    }
  });

  test('a pattern with a directory is relative to the current directory, not the primary one', () => {
    const ctx = withPaths({ cwd: '/work/app/sub', primaryWorkingDirectory: '/work/app' });
    expect(allows('Read(config/*.json)', '/work/app/sub/config/a.json', { ctx })).toBe(true);
    expect(allows('Read(config/*.json)', '/work/app/config/a.json', { ctx })).toBe(false);
  });
});

spec('permissions.rule../path', () => {
  test('Read(./src/*.ts) is the same as Read(src/*.ts): relative to the current directory', () => {
    const ctx = withPaths({ cwd: '/work/app/sub', primaryWorkingDirectory: '/work/app' });
    for (const [behavior, check] of Object.entries(CHECKS)) {
      for (const rule of ['Read(./src/*.ts)', 'Read(src/*.ts)']) {
        expect([behavior, rule, check(rule, '/work/app/sub/src/a.ts', { ctx })]).toEqual([
          behavior,
          rule,
          true,
        ]);
        expect([behavior, rule, check(rule, '/work/app/src/a.ts', { ctx })]).toEqual([
          behavior,
          rule,
          false,
        ]);
      }
    }
  });

  test('./ is the current directory itself, even when it differs from the primary one', () => {
    const ctx = withPaths({ cwd: '/work/app/sub', primaryWorkingDirectory: '/work/app' });
    expect(denies('Edit(./out/**)', '/work/app/sub/out/a.js', { ctx, tool: 'Edit' })).toBe(true);
    expect(denies('Edit(./out/**)', '/work/app/out/a.js', { ctx, tool: 'Edit' })).toBe(false);
  });
});
