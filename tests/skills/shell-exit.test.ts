/**
 * skills.md § When an injected command fails ("With the default `bash` shell, any non-zero exit code
 * counts as a failure. One carveout applies: ... exit code 1 from search and comparison commands";
 * "Exit codes of 2 or higher fail even for those commands"); tools-reference.md § Output limits (the
 * commands: `grep`, `rg`, `egrep`, `fgrep`, `find`, `diff`, `test`, `[`, `git diff`, `git grep`; not
 * `pgrep`, `jq -e`, `cmp`) and § Exit code 1 from searches and `git diff` in PowerShell (`findstr`
 * instead of `find` and `diff`).
 */
import { describe, expect, test } from 'bun:test';
import { run } from '../support/shell-run.ts';

describe('"exit code 1 from search and comparison commands is a normal result" (bash)', () => {
  const benign = [
    'grep foo file',
    'rg foo',
    'egrep foo file',
    'fgrep foo file',
    'find . -name x',
    'diff a b',
    'test -f x',
    '[ -f x ]',
    'git diff --quiet',
    'git grep foo',
    'cat file | grep foo',
    'timeout 5 grep foo file',
    'FOO=1 grep foo file',
    'echo a && grep foo file',
  ];
  test.each(benign)('%s exits 1 and its output is injected', async (command) => {
    const { result } = await run([command], [{ exitCode: 1, stdout: 'out' }]);
    expect(result).toEqual({ ok: true, outputs: ['out'] });
  });

  const failing = [
    'pgrep foo',
    'jq -e .x file',
    'cmp a b',
    'git status',
    'npm test',
    'grep foo file | wc -l | cmp - x',
  ];
  test.each(failing)(
    '%s exits 1 and fails (the docs name pgrep, jq -e and cmp)',
    async (command) => {
      const { result } = await run([command], [{ exitCode: 1 }]);
      expect(result.ok).toBe(false);
    },
  );

  test('"Exit codes of 2 or higher fail even for those commands"', async () => {
    for (const command of ['grep foo missing', 'diff a b', 'git diff x']) {
      const { result } = await run([command], [{ exitCode: 2, stdout: 'err' }]);
      expect(result.ok).toBe(false);
    }
  });
});

describe('the PowerShell list differs (tools-reference.md)', () => {
  const powershell = { context: { shell: 'powershell' } } as const;

  test('grep, rg, egrep, fgrep, findstr, git grep and git diff are results at exit 1', async () => {
    for (const command of [
      'grep x f',
      'rg x',
      'egrep x f',
      'fgrep x f',
      'findstr x f',
      'git grep x',
      'git diff',
    ]) {
      const { result } = await run([command], [{ exitCode: 1, stdout: 'o' }], powershell);
      expect(result.ok).toBe(true);
    }
  });

  test('"but not `find` or `diff`"', async () => {
    for (const command of ['find x', 'diff a b', 'test -f x']) {
      const { result } = await run([command], [{ exitCode: 1 }], powershell);
      expect(result.ok).toBe(false);
    }
  });

  test('findstr is no carveout of the default bash shell', async () => {
    const { result } = await run(['findstr x f'], [{ exitCode: 1 }]);
    expect(result.ok).toBe(false);
  });
});
