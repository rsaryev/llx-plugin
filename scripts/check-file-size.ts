/**
 * Rule S1: no source file exceeds 300 lines. A long file is split by responsibility, never moved
 * into an ignored or generated folder.
 */
import { join } from 'node:path';
import { ROOT } from './docs/location.ts';
import { finish, repositoryFiles } from './lib/files.ts';

const MAX_LINES = 300;
const files = repositoryFiles().filter((path) => /\.(ts|js)$/.test(path));
const problems: string[] = [];
for (const path of files) {
  const file = Bun.file(join(ROOT, path));
  if (!(await file.exists())) continue;
  const lines = (await file.text()).split('\n').length;
  if (lines > MAX_LINES) problems.push(`${path}: ${lines} lines (max ${MAX_LINES})`);
}
finish('S1 file budget', problems, `${files.length} files within ${MAX_LINES} lines`);
