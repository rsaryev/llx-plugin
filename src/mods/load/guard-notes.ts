import { GUARDED_DOORS, GUARDED_EVENTS } from './guard-surfaces.ts';
import { type ScannedHook } from './scan/index.ts';
import { hookLabel } from './scan/uses.ts';

function rowHook(label: string): boolean {
  const condition = /(?:[{,])\s*door=["']?(attachment|hook-context|compaction)["']?(?=[,}])/.exec(
    label,
  );
  return GUARDED_DOORS[condition?.[1] ?? ''] === true;
}

const CONDITIONAL_NOTES: Readonly<Record<string, ((label: string) => boolean) | undefined>> = {
  'session.append': rowHook,
};

/** admin.md § Know which hooks ...: preserve each hook's registration label in the note. */
export function protectedHookNotes(hooks: readonly ScannedHook[]): readonly string[] {
  const skipped = hooks
    .filter(
      (hook) =>
        GUARDED_EVENTS[hook.event] === true ||
        (CONDITIONAL_NOTES[hook.event]?.(hookLabel(hook)) ?? false),
    )
    .map(hookLabel);
  if (skipped.length === 0) return [];
  return [
    `Its hooks on ${skipped.join(', ')} do not run here: where an organization manages Claude Code, these events pass over the plugins you install`,
    "Only a plugin that counts as your organization's own runs hooks on these events. An administrator sets that up in managed settings",
  ];
}
