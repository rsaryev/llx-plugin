/**
 * Rule T1: no focused or switched-off test is committed. `.only` silently skips the rest of a file
 * and `.skip`/`.todo` switch a test off for everyone; either would also make the compatibility
 * report (docs/SPEC.md) count what did not run. A test that needs something the machine may lack
 * says so with `skipIf(!available)`.
 */
import { join } from 'node:path';
import { ROOT } from './docs/location.ts';
import { finish, repositoryFiles } from './lib/files.ts';

const RULES: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /\b(?:describe|test|it|spec)(?:\.\w+)*\.only\b/g, why: 'focused' },
  {
    pattern: /\b(?:describe|test|it)(?:\.\w+)*\.(?:todo\b\s*\(|skip\b\s*\(\s*[)'"`])/g,
    why: 'switched off',
  },
];
const TEST_FILE = /\.test\.ts$/;

const given = process.argv.slice(2);
const files = (given.length > 0 ? given : repositoryFiles()).filter((path) => TEST_FILE.test(path));
const problems: string[] = [];
for (const path of files) {
  const file = Bun.file(join(ROOT, path));
  if (!(await file.exists())) continue;
  const text = await file.text();
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      const line = text.slice(0, match.index).split('\n').length;
      problems.push(`${path}:${line}: ${rule.why}`);
    }
  }
}
finish('T1 tests run', problems, `${files.length} test files, none focused or switched off`);
