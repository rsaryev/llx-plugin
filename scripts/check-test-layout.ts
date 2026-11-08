/**
 * Rule T2: tests live in `tests/<module>/`, mirroring `src/<module>/`, and nowhere else; test
 * support lives in `tests/support/`. `src/` holds no test file, so the published package never
 * ships one. A file under `tests/` that does not end in `.ts` (a stray editor or `sed -i` backup)
 * is a problem too, since no tool would ever run it.
 */
import { finish, repositoryFiles } from './lib/files.ts';

const files = repositoryFiles();
const problems = files.filter(
  (path) =>
    (path.endsWith('.test.ts') && !path.startsWith('tests/')) ||
    (path.startsWith('tests/') && !path.endsWith('.ts')) ||
    (path.startsWith('src/') && /(^|\/)(tests?|__tests__|fixtures?)\//.test(path)),
);
const tests = files.filter((path) => path.startsWith('tests/') && path.endsWith('.test.ts'));
finish('T2 test layout', problems, `${tests.length} test files, all under tests/`);
