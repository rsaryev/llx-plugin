/**
 * Rule G1: commit messages follow Conventional Commits.
 * Rule G2: a user-visible change (feat, fix, perf) stages CHANGELOG.md in the same commit.
 */
const TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'style'];
const NEEDS_CHANGELOG = new Set(['feat', 'fix', 'perf']);
const HEADER = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9-]+(,[a-z0-9-]+)*\\))?(!)?: .{3,100}$`);

const path = process.argv[2];
if (!path) {
  console.error('usage: check-commit-msg <commit-msg-file>');
  process.exit(2);
}
const header = (await Bun.file(path).text()).split('\n')[0]?.trim() ?? '';
if (header.startsWith('Merge ') || header.startsWith('Revert ')) process.exit(0);

const match = HEADER.exec(header);
if (!match) {
  console.error(`G1: "${header}" is not a Conventional Commit: <type>(<scope>): <summary>`);
  console.error(`types: ${TYPES.join(', ')}`);
  process.exit(1);
}
if (NEEDS_CHANGELOG.has(match[1] ?? '')) {
  const staged = Bun.spawnSync(['git', 'diff', '--cached', '--name-only'], { stdout: 'pipe' });
  if (!new TextDecoder().decode(staged.stdout).split('\n').includes('CHANGELOG.md')) {
    console.error(
      `G2: a "${match[1]}" commit must add its entry to CHANGELOG.md under [Unreleased]`,
    );
    process.exit(1);
  }
}
