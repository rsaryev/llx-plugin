import { z } from 'zod';
import { warning, type PluginIssue } from '../issues.ts';
import { defined } from './defined.ts';
import { isRecord, typeName, unknownField } from './marketplace-schema.ts';
import { zodIssues } from './schema-issues.ts';
import type { Relevance, RelevanceSignals } from './types.ts';

/**
 * `relevance` of a plugin entry (plugins/relevance.md, "Field reference" and "Validate your
 * marketplace"): the typed model and its limits. Unknown fields under `relevance` and
 * `relevance.signals` are ignored with a warning, "because ... older clients still load a
 * marketplace that uses `relevance` fields they don't recognize"; "a recognized field whose value
 * exceeds its limit ... invalidates the whole plugin entry". Limits count UTF-16 code units, the
 * length of a JavaScript string (spec/judgments.md). No signal matching happens here.
 */

const TOPIC_KEYS = ['topic', 'signals'] as const;
const SIGNAL_KEYS = ['cwd', 'cli', 'hosts', 'filesRead', 'manifestDeps'] as const;

/** A list of `count` strings of at most `length` characters. */
const list = (count: number, length: number) => z.array(z.string().max(length)).max(count);

/** "Bare lowercase hostname only: no scheme, port, or path". */
const host = z
  .string()
  .max(128)
  .refine((value) => !/[:/]/.test(value), {
    message: 'Invalid host: use a bare hostname, with no scheme, port, or path',
  });

const signalsSchema = z.looseObject({
  cwd: list(10, 256).optional(),
  cli: list(10, 64).optional(),
  hosts: z.array(host).max(20).optional(),
  filesRead: list(10, 256).optional(),
  manifestDeps: z
    .array(z.looseObject({ file: z.string().max(256), pattern: z.string().max(256) }))
    .max(10)
    .optional(),
});

const relevanceSchema = z.looseObject({
  topic: z.string().max(64).optional(),
  signals: signalsSchema.optional(),
});

const NOT_AN_OBJECT = (type: string): string =>
  `'relevance' must be an object containing topic and signals; got ${type}. It will be ignored at load time.`;

const unknownKeys = (
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  base: string,
): PluginIssue[] =>
  Object.keys(value)
    .filter((key) => !keys.includes(key))
    .map((key) => unknownField(key, `${base}.${key}`));

/** The signals as the model holds them: the recognized keys only. */
const signalsOf = (parsed: z.output<typeof signalsSchema>): RelevanceSignals =>
  defined({
    cwd: parsed.cwd,
    cli: parsed.cli,
    hosts: parsed.hosts,
    filesRead: parsed.filesRead,
    manifestDeps: parsed.manifestDeps?.map(({ file, pattern }) => ({ file, pattern })),
  });

export interface RelevanceReading {
  /** Undefined when the value is dropped (not an object) or invalid. */
  readonly relevance: Relevance | undefined;
  readonly issues: readonly PluginIssue[];
}

/** Reads `plugins[i].relevance` at `base` (`plugins[i].relevance`); a value that is not an object is a warning and is dropped. */
export function readRelevance(value: unknown, base: string): RelevanceReading {
  if (value === undefined) return { relevance: undefined, issues: [] };
  if (!isRecord(value)) {
    return { relevance: undefined, issues: [warning(base, NOT_AN_OBJECT(typeName(value)))] };
  }
  const issues = unknownKeys(value, TOPIC_KEYS, base);
  const signals = isRecord(value.signals)
    ? unknownKeys(value.signals, SIGNAL_KEYS, `${base}.signals`)
    : [];
  const parsed = relevanceSchema.safeParse(value);
  if (!parsed.success) {
    return {
      relevance: undefined,
      issues: [...zodIssues(parsed.error, base), ...issues, ...signals],
    };
  }
  const relevance: Relevance = defined({
    topic: parsed.data.topic,
    signals: parsed.data.signals === undefined ? undefined : signalsOf(parsed.data.signals),
  });
  return { relevance, issues: [...issues, ...signals] };
}

/**
 * The phrase of "Working with <topic>?": `relevance.topic`, which "defaults to the plugin name with
 * each hyphen segment capitalized" (`terraform-helpers` gives `Terraform Helpers`).
 */
export const effectiveTopic = (entry: {
  readonly name: string;
  readonly relevance?: Relevance;
}): string =>
  entry.relevance?.topic ??
  entry.name
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
