import { type ComponentKind } from '../../format/validate/component-frontmatter.ts';
import type { ValidationIssue } from '../../format/validate/finding.ts';
import type { PluginFiles } from '../../ports/index.ts';
import {
  componentIssues,
  frontmatterIssues,
  scanMarkdownFolder,
  scanSkillFolders,
  type Scan,
} from './components.ts';
import { childOf, entriesOf } from './paths.ts';

/**
 * A folder with no manifest still validates when it holds components Claude Code loads without one
 * (oracle 2.1.319): a skills tree (`skills/<name>/SKILL.md`), a project's `.claude/skills`,
 * `.claude/commands` or `.claude/agents`, or a folder that is itself named `skills`, `commands` or
 * `agents`. Anything else has no manifest to find.
 */
const KINDS: readonly ComponentKind[] = ['skill', 'agent', 'command'];
const FOLDER_OF: { readonly [K in ComponentKind]: string } = {
  skill: 'skills',
  agent: 'agents',
  command: 'commands',
};
/** Agents of a bare folder are only looked at for links, not for frontmatter (oracle 2.1.319). */
const READ_FRONTMATTER: { readonly [K in ComponentKind]: boolean } = {
  skill: true,
  agent: false,
  command: true,
};

async function hasSkillsTree(files: PluginFiles, signal?: AbortSignal): Promise<boolean> {
  for (const entry of await entriesOf(files, 'skills', signal)) {
    const skill = childOf(childOf('skills', entry.name), 'SKILL.md');
    if (entry.isDirectory && (await files.exists(skill, signal))) return true;
  }
  return false;
}

/** The last segment of what the report calls the folder. */
const baseName = (label: string): string => label.replace(/\/+$/, '').split(/[\\/]/).pop() ?? '';

const scanBare = (
  kind: ComponentKind,
  files: PluginFiles,
  where: { readonly dir: string; readonly style: 'plugin' | 'project' },
  signal?: AbortSignal,
): Promise<Scan> =>
  kind === 'skill'
    ? scanSkillFolders(files, where.dir, where.style, signal)
    : scanMarkdownFolder(files, where.dir, where.style, signal);

async function bareIssues(
  kind: ComponentKind,
  files: PluginFiles,
  where: { readonly dir: string; readonly report: string; readonly style: 'plugin' | 'project' },
  signal?: AbortSignal,
): Promise<ValidationIssue[]> {
  const scan = await scanBare(kind, files, where, signal);
  if (!READ_FRONTMATTER[kind]) return [...scan.issues];
  const shown = scan.files.map((path) => (where.report === '' ? path : `${where.report}/${path}`));
  const found = await frontmatterIssues(kind, files, scan.files, { signal });
  return [
    ...scan.issues,
    ...found.map((issue, index) => ({ ...issue, file: shown[index] ?? issue.file })),
  ];
}

export interface BareInput {
  readonly files: PluginFiles;
  readonly label: string;
  readonly signal?: AbortSignal;
}

/** The components of a folder with no manifest, or `undefined` when it holds none the validator knows. */
export async function componentsOnly(input: BareInput): Promise<ValidationIssue[] | undefined> {
  const { files, label, signal } = input;
  const tree = await hasSkillsTree(files, signal);
  const project = (
    await Promise.all(
      KINDS.map(async (kind) =>
        (await files.exists(childOf('.claude', FOLDER_OF[kind]), signal)) ? [kind] : [],
      ),
    )
  ).flat();
  const own = KINDS.filter((kind) => FOLDER_OF[kind] === baseName(label));
  if (!tree && project.length === 0 && own.length === 0) return undefined;
  const found: ValidationIssue[] = tree ? await componentIssues(files, signal) : [];
  for (const kind of project) {
    const dir = childOf('.claude', FOLDER_OF[kind]);
    found.push(...(await bareIssues(kind, files, { dir, report: '', style: 'project' }, signal)));
  }
  for (const kind of own) {
    const where = { dir: '.', report: FOLDER_OF[kind], style: 'plugin' } as const;
    found.push(...(await bareIssues(kind, files, where, signal)));
  }
  return found;
}
