import { ROOT } from '../docs/location.ts';

/** Files git tracks or would track (untracked but not ignored), relative to the root. */
export function repositoryFiles(): string[] {
  const listed = Bun.spawnSync(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    stdout: 'pipe',
  });
  return new TextDecoder()
    .decode(listed.stdout)
    .split('\n')
    .filter((path) => path.length > 0);
}

/** Reports problems and exits: 1 with the list when there are any, 0 with `ok` otherwise. */
export function finish(rule: string, problems: readonly string[], ok: string): never {
  if (problems.length > 0) {
    console.error(`${rule}:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`${rule} ok: ${ok}`);
  process.exit(0);
}
