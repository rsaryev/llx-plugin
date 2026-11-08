import { readSettingsLayer } from '../../settings/read-layer.ts';
import type { PolicyScope } from '../../settings/layers.ts';
import { refuse, type Contribution, type FlagContext } from './types.ts';

/**
 * `--setting-sources` and `--settings` (cli-reference.md, "CLI flags"). `--setting-sources` is "a
 * comma-separated list of setting sources to load (`user`, `project`, `local`)": managed policy is
 * read whatever the list says (agent-sdk/claude-code-features.md, "Control filesystem settings with
 * settingSources"). `--settings` is "a path to a settings JSON file or an inline JSON string": its
 * values "override the same keys in your `settings.json` files ... Keys you omit keep their
 * file-based values"; "the file must be a regular file no larger than 2 MiB". The refusals of the
 * file are errors.md's, "Settings file exceeds the 2MiB limit". Wording the docs do not give is in
 * spec/judgments.md.
 */

const FILE_SOURCES = ['user', 'project', 'local'] as const;
type FileSource = (typeof FILE_SOURCES)[number];

const isFileSource = (name: string): name is FileSource =>
  FILE_SOURCES.some((source) => source === name);

/** The scopes no list takes away: the policy tier and the `--settings` layer. */
const ALWAYS: readonly PolicyScope[] = ['managed', 'parent', 'flag'];

/** An `--add-dir` directory's settings are part of what `project` stands for (judgment). */
const SCOPES_OF: { readonly [S in FileSource]: readonly PolicyScope[] } = {
  user: ['user'],
  project: ['project', 'addDir'],
  local: ['local'],
};

export function settingSources(value: string): Contribution {
  const names = value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  const unknown = names.filter((name) => !isFileSource(name));
  if (unknown.length > 0) {
    return refuse(`Invalid setting source: ${unknown.join(', ')}. Use user, project or local`);
  }
  const chosen = FILE_SOURCES.filter((source) => names.includes(source));
  return { settingScopes: [...ALWAYS, ...chosen.flatMap((source) => SCOPES_OF[source])] };
}

/** "The file must be a regular file no larger than 2 MiB." */
export const SETTINGS_FILE_LIMIT = 2 * 1024 * 1024;

const parseObject = (text: string): { readonly value: unknown } | { readonly problem: string } => {
  try {
    return { value: JSON.parse(text) };
  } catch (failure) {
    return { problem: failure instanceof Error ? failure.message : 'invalid JSON' };
  }
};

/** The text of the settings and the place a refusal names. */
function settingsText(value: string, context: FlagContext): { text: string } | { refusal: string } {
  if (value.trimStart().startsWith('{')) return { text: value };
  const file = context.facts.files[value];
  if (file === undefined) return { refusal: `Error: Settings file not found: ${value}` };
  if (!file.regular) {
    return {
      refusal: `Error: Cannot use settings file (Not a regular file (device, FIFO, or socket)): ${value}`,
    };
  }
  if (file.bytes > SETTINGS_FILE_LIMIT) {
    return { refusal: `Error: Settings file exceeds the 2MiB limit: ${value}` };
  }
  return { text: file.text };
}

export function settings(value: string, context: FlagContext): Contribution {
  const found = settingsText(value, context);
  if ('refusal' in found) return refuse(found.refusal);
  const parsed = parseObject(found.text);
  if ('problem' in parsed)
    return refuse(`Error: Invalid JSON passed to --settings: ${parsed.problem}`);
  const read = readSettingsLayer('flag', parsed.value);
  return { flagSettings: read.layer, warnings: read.issues };
}
