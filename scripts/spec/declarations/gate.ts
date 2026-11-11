/**
 * SP8 (scripts/spec/check.ts): the committed declarations snapshot names the release of the
 * requirements; when the declarations are pulled, they are that release's, and the snapshot is what
 * they declare. Pulled declarations of another release are refused, as pulled docs are (SP4).
 */
import { join } from 'node:path';
import { TYPES_DIR } from '../../docs/location.ts';
import { pulledDeclarations } from './extract.ts';
import { DECLARATIONS_FILE, declarationsSchema } from './snapshot.ts';

export async function declarationProblems(release: string): Promise<string[]> {
  const committed = declarationsSchema.safeParse(
    await Bun.file(DECLARATIONS_FILE)
      .json()
      .catch(() => undefined),
  );
  if (!committed.success) return ['SP8 spec/mods-declarations.json: run `bun run types:extract`'];
  const problems: string[] = [];
  if (committed.data.claudeCode !== release) {
    problems.push(
      `SP8 spec/mods-declarations.json is Claude Code ${committed.data.claudeCode}; the requirements are ${release}`,
    );
  }
  const version = Bun.file(join(TYPES_DIR, 'VERSION'));
  if (!(await version.exists())) return problems;
  const pulled = (await version.text()).trim();
  if (pulled !== release) {
    return [
      ...problems,
      `SP8 declarations ${pulled} are pulled but the requirements are ${release}`,
    ];
  }
  const fresh = await pulledDeclarations();
  if (JSON.stringify(fresh) !== JSON.stringify(committed.data)) {
    problems.push(
      'SP8 spec/mods-declarations.json differs from the pulled declarations: run `bun run types:extract`',
    );
  }
  return problems;
}
