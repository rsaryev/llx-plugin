import type { ScanContext } from './locations.ts';
import { scanScope, type ScanOutcome } from './scan.ts';

/**
 * Skills of a `.claude/skills` below the working directory (skills.md, "Load skills in monorepos and
 * subdirectories"): "Skills in a `.claude/skills/` directory below where you started don't load at
 * startup. They load the first time Claude reads or edits a file in that subdirectory and stay
 * available for the rest of the session."
 */
export interface NestedScan extends ScanOutcome {
  /** The directories scanned now: the session keeps them as loaded and never asks again. */
  readonly directories: readonly string[];
}

/**
 * The skills of the directories between the working directory and the file Claude touched, outermost
 * first, leaving out the ones the session already scanned (`loaded`). A file outside the working
 * directory loads nothing: that is `/add-dir`'s.
 */
export async function scanNested(
  context: ScanContext,
  touched: string,
  loaded: ReadonlySet<string> = new Set(),
): Promise<NestedScan> {
  const below = await context.folders.directoriesBelow(
    context.request.cwd,
    touched,
    context.signal,
  );
  const directories = below.filter((directory) => !loaded.has(directory));
  const outcome = await scanScope(
    { ...context, request: { ...context.request, nestedDirectories: directories } },
    'nested',
  );
  return { ...outcome, directories };
}
