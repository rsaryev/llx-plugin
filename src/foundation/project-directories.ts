import type { FolderScan } from '../ports/folder-scan.ts';

/**
 * The project directories whose `.claude` folder is read: the working directory and every parent up
 * to the repository root, nearest first. In a linked worktree whose top has no `.claude/skills`, the
 * main checkout's loads as well, last (v2.1.277 and later; skills.md, "Load skills in monorepos and
 * subdirectories"). Judgment (spec/judgments.md): worktrees.md titles that bullet "skills, agents, and
 * commands", so the same rule gives the agents and commands folders, and the main checkout is never
 * a base of a skill-folder plugin. Shared by the skills and the agents scans.
 */
export async function projectDirectories(
  folders: FolderScan,
  cwd: string,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const chain = await folders.repository(cwd, signal);
  const top = chain.directories.at(-1);
  if (chain.mainCheckout === undefined || top === undefined) return chain.directories;
  const folder = await folders.open(top, signal);
  const has = folder !== undefined && (await folder.files.exists('.claude/skills', signal));
  return has ? chain.directories : [...chain.directories, chain.mainCheckout];
}
