import type { PluginIssue } from '../../format/issues.ts';
import type { ScratchFiles } from '../../ports/scratch-files.ts';
import type { HookEvent } from '../../protocol/official.ts';
import type { LimitedOutputs, TaggedOutput } from '../verdict/types.ts';
import { stringIn } from './fields.ts';
import { checkOutput } from './parse.ts';
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
  read(output: CheckedOutput): string | undefined;
  write(output: CheckedOutput, text: string): CheckedOutput;
}

const specificSlot = (key: string): Slot => ({
  field: key,
  read: (output) => stringIn(output.hookSpecificOutput, key),
  write: (output, text) => ({
    ...output,
    hookSpecificOutput: { ...output.hookSpecificOutput, [key]: text },
  }),
});

const SLOTS: readonly Slot[] = [
  {
    field: 'systemMessage',
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
): Promise<{ output: object; issues: PluginIssue[] }> {
  const checked = tagged.output === undefined ? undefined : checkOutput(event, tagged.output).data;
  if (checked === undefined) return { output: tagged.output ?? {}, issues: [] };
  let current = checked;
  const issues: PluginIssue[] = [];
  for (const slot of SLOTS) {
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
      ...(tagged.output === undefined ? {} : { output: json.output }),
      ...(plain.plainText === undefined ? {} : { plainText: plain.plainText }),
    });
  }
  return { outputs: limited, issues };
}
