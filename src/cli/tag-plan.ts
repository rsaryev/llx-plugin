import { blocksLoading, type PluginIssue } from '../format/issues.ts';
import { validateManifest } from '../format/manifest.ts';
import type { PluginManifest } from '../format/manifest-schema.ts';

/** Host observations, after walking upward for the marketplace that lists this directory. */
export interface TagFacts {
  readonly directory: string;
  readonly manifest: PluginManifest;
  readonly validationIssues: readonly PluginIssue[];
  readonly marketplace?: { readonly file: string; readonly version?: string };
  readonly dirty: boolean;
  readonly tagExists: boolean;
}

export interface TagOptions {
  readonly dryRun?: boolean;
  readonly force?: boolean;
  readonly message?: string;
  readonly push?: boolean;
  readonly remote?: string;
}

export interface TagCommand {
  readonly command: 'git';
  readonly args: readonly string[];
  readonly cwd: string;
}

export interface TagPlan {
  readonly ready: boolean;
  readonly tag: string;
  readonly preview: readonly string[];
  readonly commands: readonly TagCommand[];
  readonly push: TagCommand;
  readonly remote: string;
  readonly dryRun: boolean;
  readonly pushes: boolean;
  readonly refusal?: string;
}

/** Judgment: labels and refusal wording are not specified; no undocumented text is a spec claim. */
function tagRefusal(facts: TagFacts, force: boolean): string | undefined {
  const issues = [...validateManifest(facts.manifest), ...facts.validationIssues];
  if (blocksLoading(issues)) return 'Plugin validation failed';
  if (!facts.manifest.version) return 'The plugin has no version';
  if (facts.marketplace !== undefined && facts.marketplace.version !== facts.manifest.version) {
    return 'The plugin and marketplace entry must declare the same version';
  }
  if (!force && facts.dirty) return 'The plugin working tree is dirty';
  return !force && facts.tagExists ? 'The release tag already exists' : undefined;
}

/** Human preview is copyable shell text; execution still uses the original argument vector. */
const displayArgument = (value: string): string =>
  /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
const lineOf = (command: TagCommand): string => command.args.map(displayArgument).join(' ');

/** plugins/cli-reference.md § plugin tag. Commands are exec arguments, never interpolated shell text. */
export function planPluginTag(options: TagOptions, facts: TagFacts): TagPlan {
  const version = facts.manifest.version ?? '';
  const tag = `${facts.manifest.name}--v${version}`;
  const remote = options.remote ?? 'origin';
  const annotation = (options.message ?? `${facts.manifest.name} ${version}`).replaceAll(
    '%s',
    version,
  );
  const create: TagCommand = {
    command: 'git',
    args: ['tag', '-a', ...(options.force ? ['-f'] : []), tag, '-m', annotation],
    cwd: facts.directory,
  };
  const push: TagCommand = { command: 'git', args: ['push', remote, tag], cwd: facts.directory };
  const refusal = tagRefusal(facts, options.force === true);
  const dryRun = options.dryRun === true;
  return {
    ready: refusal === undefined,
    tag,
    push,
    remote,
    dryRun,
    pushes: options.push === true,
    preview: [
      `Plugin: ${facts.manifest.name}`,
      `Version: ${version} (${facts.directory}/.claude-plugin/plugin.json)`,
      ...(facts.marketplace === undefined ? [] : [`Marketplace entry: ${facts.marketplace.file}`]),
      `Tag: ${tag}`,
      `git ${lineOf(create)}`,
      `git ${lineOf(push)}`,
    ],
    commands: refusal !== undefined || dryRun ? [] : [create, ...(options.push ? [push] : [])],
    ...(refusal === undefined ? {} : { refusal }),
  };
}

/** A failed push does not undo the tag already created locally. */
export function finishPluginTag(
  plan: TagPlan,
  effects: { readonly created: boolean; readonly pushed?: boolean; readonly error?: string },
): { readonly exitCode: 0 | 1; readonly tagCreated: boolean; readonly lines: readonly string[] } {
  if (!plan.ready)
    return { exitCode: 1, tagCreated: false, lines: [plan.refusal ?? 'Cannot tag this plugin'] };
  if (plan.dryRun) return { exitCode: 0, tagCreated: false, lines: plan.preview };
  if (!effects.created)
    return { exitCode: 1, tagCreated: false, lines: [effects.error ?? 'Tag creation failed'] };
  const created = `Created tag ${plan.tag}`;
  if (!plan.pushes)
    return { exitCode: 0, tagCreated: true, lines: [created, `git ${lineOf(plan.push)}`] };
  return effects.pushed === true
    ? { exitCode: 0, tagCreated: true, lines: [created, `Pushed to ${plan.remote}`] }
    : { exitCode: 1, tagCreated: true, lines: [created, effects.error ?? 'Tag push failed'] };
}
