import { CLASSIC_EVENT_NAMES } from '../../protocol/mods-events.ts';

/** admin.md § Know which hooks of a user's mod don't run. */
export const GUARDED_EVENTS: Readonly<Record<string, boolean | undefined>> = Object.fromEntries(
  [
    ...CLASSIC_EVENT_NAMES,
    'classic.*',
    'prompt.compose',
    'prompt.section',
    'prompt.context',
    'prompt.attachment',
    'skill.prompt',
    'attribution.text',
    'session.compact',
    'settings.read',
  ].map((name): readonly [string, boolean] => [name, true]),
);

export const GUARDED_DOORS: Readonly<Record<string, boolean | undefined>> = {
  attachment: true,
  'hook-context': true,
  compaction: true,
};
