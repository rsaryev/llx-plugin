import { readCommand } from '../../format/command.ts';
import { blocksLoading, type PluginIssue } from '../../format/issues.ts';
import { readSkill } from '../../format/skill.ts';
import type { BodyReader } from '../../format/skill-types.ts';
import { readTextOf } from '../../foundation/folder-read.ts';
import { listChildren, walkFiles } from '../../foundation/folder-walk.ts';
import { headOf } from './head.ts';
import { EMPTY, merge, type ScanOutcome, type ScannedEntry, type Where } from './scan-types.ts';

/**
 * Reads the skills and the command files of one scope folder into catalog entries (skills.md,
 * "Choose where skills load", "How a skill gets its command name"). Each entry keeps the frontmatter
 * and a `BodyReader`, never the body.
 */

const SKILL_FILE = 'SKILL.md';
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

/** What one command file gave. */
interface CommandRead {
  readonly entries: readonly ScannedEntry[];
  readonly issues: readonly PluginIssue[];
}

/** `.claude/commands/<path>.md`: the file name, and each folder before it joined by `:`. */
export async function readCommands(where: Where, container: string): Promise<ScanOutcome> {
  const { folder, context, rule, scope } = where;
  const walked = await walkFiles(folder, container, {
    extension: '.md',
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
  const reads = await Promise.all(
    walked.found.map(async (file): Promise<CommandRead> => {
      const { text, issue } = await readTextOf(folder, file.path, context.signal);
      if (text === undefined) return { issues: issue === undefined ? [] : [issue], entries: [] };
      const layout = { origin: rule.origin, relativePath: file.segments.join('/') };
      const hostFile = folder.hostPath(file.path);
      const read = readCommand(hostFile, text, layout);
      const { command } = read;
      if (command === undefined) return { entries: [], issues: read.issues };
      const readBody: BodyReader = async (signal) => {
        const now = await textNow(where, file.path, signal);
        return now === undefined ? undefined : readCommand(hostFile, now, layout).command?.body;
      };
      const entry: ScannedEntry = {
        invocable: headOf(command),
        readBody,
        scope,
        dirName: command.name,
        base: folder.dir,
        ...(file.canonical === undefined ? {} : { canonical: file.canonical }),
      };
      return { entries: [entry], issues: read.issues };
    }),
  );
  return {
    ...EMPTY,
    entries: reads.flatMap((read) => read.entries),
    issues: [...walked.issues, ...reads.flatMap((read) => read.issues)],
  };
}
