/**
 * Compares the kit's registry of a fixture with the oracle's expected one, field by field. A field
 * may differ on purpose: `judgments.json` beside the fixtures names the value the kit gives and the
 * row of spec/judgments.md that explains it; anything else that differs is a failure.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { EXPECTED_FILE, type Registry } from './runtime.ts';

export const FIXTURES_DIR = join(import.meta.dir, '..', '..', 'tests', 'fixtures', 'runtime');

export const FIELDS = [
  'loaded',
  'agents',
  'slashCommands',
  'skills',
  'mcpServers',
  'outputStyle',
] as const satisfies readonly (keyof Registry)[];
export type Field = (typeof FIELDS)[number];

export const registrySchema = z.object({
  loaded: z.boolean(),
  agents: z.array(z.string()),
  slashCommands: z.array(z.string()),
  skills: z.array(z.string()),
  mcpServers: z.array(z.string()),
  outputStyle: z.string(),
});

const judgmentsSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.object({ kit: z.union([z.boolean(), z.string(), z.array(z.string())]), row: z.string() }),
  ),
);
export type Judgments = z.infer<typeof judgmentsSchema>;

export interface FieldVerdict {
  readonly field: Field;
  readonly status: 'agrees' | 'judged' | 'differs';
  readonly expected: Registry[Field];
  readonly kit: Registry[Field];
  /** The row of spec/judgments.md when the difference is a judgment. */
  readonly row?: string;
}

export async function readExpected(dir: string): Promise<Registry | undefined> {
  try {
    return registrySchema.parse(JSON.parse(await readFile(join(dir, EXPECTED_FILE), 'utf8')));
  } catch {
    return undefined;
  }
}

export async function readJudgments(): Promise<Judgments> {
  try {
    return judgmentsSchema.parse(
      JSON.parse(await readFile(join(FIXTURES_DIR, 'judgments.json'), 'utf8')),
    );
  } catch {
    return {};
  }
}

/** One verdict per field of the registry. */
export function compareRegistries(
  name: string,
  kit: Registry,
  expected: Registry,
  judgments: Judgments,
): FieldVerdict[] {
  return FIELDS.map((field) => {
    const same = JSON.stringify(kit[field]) === JSON.stringify(expected[field]);
    const judged = judgments[name]?.[field];
    const base = { field, expected: expected[field], kit: kit[field] };
    if (same) return { ...base, status: 'agrees' };
    if (judged !== undefined && JSON.stringify(judged.kit) === JSON.stringify(kit[field]))
      return { ...base, status: 'judged', row: judged.row };
    return { ...base, status: 'differs' };
  });
}
