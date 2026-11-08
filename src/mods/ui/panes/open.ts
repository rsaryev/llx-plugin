import { z } from 'zod';
import { nameProblem } from '../../api/names.ts';
import { isRecord } from '../elements/node.ts';

/** What `$.ui.open` takes (interface.md, "Open a pane at the right time"). */
export type OpenRequest = {
  readonly id: string;
  readonly title?: string;
  readonly focus?: true;
  readonly closeOnEscape?: true;
  readonly holdToasts?: true;
  /** The height to ask for above the prompt. */
  readonly rows?: number;
  /** The width to ask for beside the transcript. */
  readonly columns?: number;
};

/** The fields that "accept only `true`": `false` throws `ui.open: focus is true or left out`. */
const TRUE_ONLY_FIELDS = ['focus', 'closeOnEscape', 'holdToasts'] as const;

const size = z.number().int().min(1);
const fields = z.looseObject({
  title: z.string().optional(),
  rows: size.optional(),
  columns: size.optional(),
});

/** The `true`-only fields a call gives, or the error that names the one that is `false`. */
function flagsOf(value: Readonly<Record<string, unknown>>): Record<string, true> {
  const flags: Record<string, true> = {};
  for (const flag of TRUE_ONLY_FIELDS) {
    const given = value[flag];
    if (given === undefined) continue;
    if (given !== true) throw new Error(`ui.open: ${flag} is true or left out`);
    flags[flag] = true;
  }
  return flags;
}

/** The fields of a request that are not flags, left out when not given. */
function optionalFields(value: unknown): Omit<OpenRequest, 'id'> {
  const parsed = fields.safeParse(value);
  if (!parsed.success) {
    throw new Error(`ui.open: ${parsed.error.issues[0]?.path.join('.') ?? 'a field'} does not fit`);
  }
  const { title, rows, columns } = parsed.data;
  return {
    ...(title === undefined ? {} : { title }),
    ...(rows === undefined ? {} : { rows }),
    ...(columns === undefined ? {} : { columns }),
  };
}

/**
 * The request of a `$.ui.open` call, or an error that starts `ui.open:` (the docs quote
 * `ui.open: focus is true or left out`; the other messages are the kit's wording, judgment).
 */
export function parseOpen(value: unknown): OpenRequest {
  if (!isRecord(value)) throw new Error('ui.open: takes an object with an id');
  const problem = nameProblem('pane', value.id);
  if (problem !== undefined || typeof value.id !== 'string') {
    throw new Error(`ui.open: ${problem ?? 'the id is not valid'}`);
  }
  return { id: value.id, ...optionalFields(value), ...flagsOf(value) };
}
