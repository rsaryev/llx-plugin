import type { PluginIssue } from '../../format/issues.ts';
import type { ScratchFiles } from '../../ports/scratch-files.ts';
import type { HookEvent } from '../../protocol/official.ts';
import type { BackgroundDelivery, LimitedOutputs, TaggedOutput } from '../verdict/types.ts';
import { stringIn } from './fields.ts';
import { OUTPUT_CAPS, type CappedField } from './caps.ts';
import { escapeReminderTags } from './reminder-tags.ts';
import type { CheckedOutput } from './schemas.ts';
import { cutText, limitText } from './text-cap.ts';

/**
 * The 10,000-character cap on each string of each hook (hooks.md, "JSON output"): the JSON fields
 * `additionalContext`, `systemMessage` and `initialUserMessage`, each on its own, and the plain
 * stdout whole. Every hook is measured alone, "even when several hooks run for the same event".
 */

export interface LimitRequest {
  readonly scratch?: ScratchFiles;
  readonly signal: AbortSignal;
}

/** One capped string of a JSON output: how to read it and how to put a replacement back. */
interface Slot {
  readonly field: string;
  /** The event's cap that must accept the field: a field the event discards is never written out. */
  readonly cap: CappedField;
  read(output: CheckedOutput): string | undefined;
  write(output: CheckedOutput, text: string): CheckedOutput;
}

const specificSlot = (key: string): Slot => ({
  field: key,
  cap: 'specific',
  read: (output) => stringIn(output.hookSpecificOutput, key),
  write: (output, text) => ({
    ...output,
    hookSpecificOutput: { ...output.hookSpecificOutput, [key]: text },
  }),
});

const SLOTS: readonly Slot[] = [
  {
    field: 'systemMessage',
    cap: 'systemMessage',
    read: (output) => output.systemMessage,
    write: (output, text) => ({ ...output, systemMessage: text }),
  },
  specificSlot('additionalContext'),
  specificSlot('initialUserMessage'),
];

const nameOf = (event: HookEvent, handlerId: string, field: string): string =>
  `hook-${event}-${handlerId}-${field}`;

async function limitJson(
  event: HookEvent,
  tagged: TaggedOutput,
  request: LimitRequest,
): Promise<{ output: CheckedOutput | undefined; issues: PluginIssue[] }> {
  if (tagged.output === undefined) return { output: undefined, issues: [] };
  let current = tagged.output;
  const issues: PluginIssue[] = [];
  for (const slot of SLOTS) {
    // "Some events discard" the field ("JSON output"): spilling it would only write a file nobody reads.
    if (!OUTPUT_CAPS[event].accepts.has(slot.cap)) continue;
    const value = slot.read(current);
    if (value === undefined) continue;
    const limited = await limitText(
      nameOf(event, tagged.handler.id, slot.field),
      value,
      request.scratch,
      request.signal,
    );
    current = slot.write(current, limited.text);
    issues.push(...limited.issues);
  }
  return { output: current, issues };
}

/** Plain stdout: spilled like the JSON strings, except `PreCompact`'s, which is cut at the cap. */
async function limitPlain(
  event: HookEvent,
  tagged: TaggedOutput,
  request: LimitRequest,
): Promise<{ plainText: TaggedOutput['plainText']; issues: readonly PluginIssue[] }> {
  const plain = tagged.plainText;
  if (plain === undefined) return { plainText: undefined, issues: [] };
  if (plain.as === 'compaction-instructions') {
    return { plainText: { ...plain, text: cutText(plain.text) }, issues: [] };
  }
  const limited = await limitText(
    nameOf(event, tagged.handler.id, 'stdout'),
    plain.text,
    request.scratch,
    request.signal,
  );
  return { plainText: { ...plain, text: limited.text }, issues: limited.issues };
}

export async function limitOutputs(
  event: HookEvent,
  outputs: readonly TaggedOutput[],
  request: LimitRequest,
): Promise<LimitedOutputs> {
  const limited: TaggedOutput[] = [];
  const issues: PluginIssue[] = [];
  for (const tagged of outputs) {
    const json = await limitJson(event, tagged, request);
    const plain = await limitPlain(event, tagged, request);
    issues.push(...json.issues, ...plain.issues);
    limited.push({
      ...tagged,
      ...(json.output === undefined ? {} : { output: json.output }),
      ...(plain.plainText === undefined ? {} : { plainText: plain.plainText }),
    });
  }
  return { outputs: limited, issues };
}

/**
 * What a background hook delivers, under the same cap and escape as a foreground hook's text: "A
 * hook's `additionalContext`, `systemMessage` ... strings ... are capped at 10,000 characters"
 * whether it ran in the foreground or not, and the context reaches Claude with its reminder tags
 * escaped (`escapeReminderTags`). A delivery carries no issues: a text cut for want of a
 * `ScratchFiles` port says so in its own marker.
 */
export async function limitDelivery(
  event: HookEvent,
  delivery: BackgroundDelivery,
  request: LimitRequest,
): Promise<BackgroundDelivery> {
  const limit = (field: 'additionalContext' | 'systemMessage', text: string | undefined) =>
    text === undefined
      ? undefined
      : limitText(nameOf(event, delivery.handlerId, field), text, request.scratch, request.signal);
  const context = await limit('additionalContext', delivery.additionalContext);
  const message = await limit('systemMessage', delivery.systemMessage);
  return {
    ...delivery,
    ...(context === undefined ? {} : { additionalContext: escapeReminderTags(context.text) }),
    ...(message === undefined ? {} : { systemMessage: message.text }),
  };
}
