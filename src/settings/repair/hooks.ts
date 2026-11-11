import { readHooksSettings } from '../../format/hooks-settings.ts';
import { blocksLoading, type PluginIssue } from '../../format/issues.ts';
import { kept, type Repair, type RepairAt } from './support.ts';
import { isRecord } from '../../protocol/is-record.ts';

/** Whether the hooks reader accepts `groups` as the matcher groups of `event` (no error). */
const loads = (event: string, groups: unknown): boolean =>
  !blocksLoading(readHooksSettings({ [event]: groups }).issues);

/**
 * The matcher group with only the handlers that load: none when the group itself (its shape, its
 * `matcher`, its `hooks` array) cannot load, one otherwise.
 */
function survivingGroup(event: string, group: unknown): unknown[] {
  if (!isRecord(group) || !Array.isArray(group.hooks)) return [];
  if (!loads(event, [{ ...group, hooks: [] }])) return [];
  const handlers = group.hooks.filter((handler) => loads(event, [{ ...group, hooks: [handler] }]));
  return [{ ...group, hooks: handlers }];
}

/** Every event whose value is a list, with the groups and handlers that load. */
const survivingEvents = (raw: Readonly<Record<string, unknown>>): Record<string, unknown[]> =>
  Object.fromEntries(
    Object.entries(raw).flatMap(([event, groups]) =>
      Array.isArray(groups)
        ? [[event, groups.flatMap((group) => survivingGroup(event, group))]]
        : [],
    ),
  );

/** The reader's issues, each tied to the source; an error becomes the warning that its entry is dropped. */
function sourceIssues(issues: readonly PluginIssue[], at: RepairAt, dropsEntries: boolean) {
  return issues.map((issue) => {
    const path = `${at.scope}:${issue.path}`;
    if (!dropsEntries || issue.severity !== 'error') return { ...issue, path };
    return {
      severity: 'warning' as const,
      path,
      message: `${issue.message}; the entry is skipped`,
    };
  });
}

/**
 * `hooks`, read with the hooks reader so a settings file and a plugin's `hooks.json` agree on what
 * loads. The policy tier (managed, parent) ignores the whole field on any error: errors.md says
 * "when a line lists the source's `hooks` field as ignored, none of that source's hooks run". Any
 * other source skips only the entries that fail, handler by handler, and keeps the rest of the file
 * in effect (settings.md, "Fix a broken settings file": "only individual entries fail, such as ...
 * an unknown hook event name. Claude Code skips those values and keeps the rest of the file in
 * effect"). A `hooks` value that is not an object leaves nothing to keep. Each issue names the scope.
 */
export const hooks: Repair = (value, at) => {
  const read = readHooksSettings(value);
  if (!blocksLoading(read.issues)) return kept(read.hooks, sourceIssues(read.issues, at, false));
  if (at.closed) return { value: undefined, issues: sourceIssues(read.issues, at, false) };
  const issues = sourceIssues(read.issues, at, true);
  if (!isRecord(value)) return { value: undefined, issues };
  return kept(readHooksSettings(survivingEvents(value)).hooks, issues);
};
