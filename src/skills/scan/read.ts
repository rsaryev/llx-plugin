import { readCommand } from '../../format/command.ts';
import { blocksLoading } from '../../format/issues.ts';
import { readSkill } from '../../format/skill.ts';
import type { BodyReader } from '../../format/skill-types.ts';
import { readTextOf } from '../../foundation/folder-read.ts';
import { listChildren } from '../../foundation/folder-walk.ts';
import { readScopeFiles } from '../../foundation/scope-folders.ts';
import { headOf } from './head.ts';
import { EMPTY, merge, type ScanOutcome, type ScannedEntry, type Where } from './scan-types.ts';

/**
 * Reads the skills and the command files of one scope folder into catalog entries (skills.md,
 * "Choose where skills load", "How a skill gets its command name"). Each entry keeps the frontmatter
 * and a `BodyReader`, never the body.
 */

/** The file a skill folder holds. */
export const SKILL_FILE = 'SKILL.md';
/** Where Claude Code moves the skill folders it removes; they stay out of every scan (skills.md, "Personal skills disappeared"). */
const TRASH = '.trash';

/**
 * The text of the file as it is now: the folder is opened again, so a host whose `ScanFolder` pins
 * what it saw at the scan (a handle, a resolved root) is asked afresh. `undefined` when the folder or
 * the file is gone.
 */
async function textNow(
  where: Where,
  path: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const folder = await where.context.folders.open(where.folder.dir, signal);
  return folder?.files.readText(path, signal);
}

/** The body of the skill at `path` as it is now, or `undefined` when it is gone or no longer loads. */
function skillBodyReader(
  where: Where,
  path: string,
  read: (text: string) => ReturnType<typeof readSkill>,
): BodyReader {
  return async (signal) => {
    const text = await textNow(where, path, signal);
    if (text === undefined) return undefined;
    const again = read(text);
    return blocksLoading(again.issues) ? undefined : again.skill.body;
  };
}

/** Reads one skill folder `<container>/<name>`; absent file, no entry. */
export async function readSkillFolder(
  where: Where,
  name: string,
  path: string,
  canonical?: string,
) {
  const { folder, context, rule, scope } = where;
  const file = path === '.' ? SKILL_FILE : `${path}/${SKILL_FILE}`;
  const { text, issue } = await readTextOf(folder, file, context.signal);
  if (text === undefined) return { ...EMPTY, issues: issue === undefined ? [] : [issue] };
  const hostFile = folder.hostPath(file);
  const reading = (source: string) =>
    readSkill(hostFile, source, { origin: rule.origin, dirName: name });
  const read = reading(text);
  const entry: ScannedEntry = {
    invocable: headOf(read.skill),
    readBody: skillBodyReader(where, file, reading),
    scope,
    dirName: name,
    base: folder.dir,
    ...(canonical === undefined ? {} : { canonical }),
  };
  const loads = !blocksLoading(read.issues);
  return { ...EMPTY, entries: loads ? [entry] : [], issues: read.issues };
}

/** `.claude/skills/<name>/SKILL.md`: one level, a folder (or a link to one) per skill. */
export async function readSkills(
  where: Where,
  container: string,
  plugins: (name: string, path: string) => Promise<ScanOutcome['plugins']>,
): Promise<ScanOutcome> {
  const listed = await listChildren(where.folder, container, where.context.signal);
  const folders = listed.found.filter((child) => child.isDirectory && child.name !== TRASH);
  const parts = await Promise.all(
    folders.map(async (child) => ({
      ...(await readSkillFolder(where, child.name, child.path, child.canonical)),
      plugins: await plugins(child.name, child.path),
    })),
  );
  const found = merge(parts);
  return { ...found, issues: [...listed.issues, ...found.issues] };
}

/** `.claude/commands/<path>.md`: the file name, and each folder before it joined by `:`. */
export async function readCommands(where: Where, container: string): Promise<ScanOutcome> {
  const { folder, context, rule, scope } = where;
  const read = await readScopeFiles(folder, container, {
    extension: '.md',
    depth: 'tree',
    signal: context.signal,
  });
  const commands = read.files.map((file) => {
    const layout = { origin: rule.origin, relativePath: file.segments.join('/') };
    return { file, layout, read: readCommand(file.hostPath, file.text, layout) };
  });
  const entries = commands.flatMap(({ file, layout, read: { command } }): ScannedEntry[] => {
    if (command === undefined) return [];
    const readBody: BodyReader = async (signal) => {
      const now = await textNow(where, file.path, signal);
      return now === undefined ? undefined : readCommand(file.hostPath, now, layout).command?.body;
    };
    return [
      {
        invocable: headOf(command),
        readBody,
        scope,
        dirName: command.name,
        base: folder.dir,
        ...(file.canonical === undefined ? {} : { canonical: file.canonical }),
      },
    ];
  });
  return {
    ...EMPTY,
    entries,
    issues: [...read.issues, ...commands.flatMap(({ read: { issues } }) => issues)],
  };
}
