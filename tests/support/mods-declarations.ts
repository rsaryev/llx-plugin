import { z } from 'zod';
import declared from '../../spec/mods-declarations.json' with { type: 'json' };
import { declarationsSchema, type Declarations } from '../../scripts/spec/declarations/snapshot.ts';

/**
 * The mods declarations of the pinned release (AGENTS.md, E2a), as the committed snapshot
 * `spec/mods-declarations.json` holds them (`bun run types:extract`); `check:spec` (SP8) compares it
 * with the pulled declarations, so a test never reads `.cache/claude-types`.
 */
export const DECLARED: Declarations = declarationsSchema.parse(declared);

/** A field of the kit's: its name and whether the kit lets it be left out. */
export interface KitField {
  readonly name: string;
  readonly optional: boolean;
}

const optionalIn = (schema: z.core.$ZodType): boolean => z.safeParse(schema, undefined).success;

/** The fields a zod schema names: an object's, or every option's of a union (one some options lack is optional). */
export function zodFields(schema: z.core.$ZodType): readonly KitField[] {
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).map(([name, field]) => ({
      name,
      optional: optionalIn(field),
    }));
  }
  if (!(schema instanceof z.ZodUnion)) return [];
  const options: readonly z.core.$ZodType[] = schema.options;
  const each = options.map((option) => zodFields(option));
  const names = new Set(each.flatMap((fields) => fields.map((one) => one.name)));
  return [...names].map((name) => ({
    name,
    optional: each.some((fields) => fields.find((one) => one.name === name)?.optional ?? true),
  }));
}

/**
 * The differences between the fields the kit names and the declared ones, as lines: a field the
 * kit names that is not declared, and one the kit requires that the declarations let be left out.
 * A declared field the kit does not name is not one: the kit carries every field it does not name.
 */
export function fieldDifferences(
  at: string,
  kit: readonly KitField[],
  declaredFields: readonly { readonly name: string; readonly optional: boolean }[],
): string[] {
  const byName = new Map(declaredFields.map((one) => [one.name, one]));
  return kit.flatMap((field) => {
    const known = byName.get(field.name);
    if (!known) return [`${at} ${field.name}: named by the kit, not declared`];
    return known.optional && !field.optional
      ? [`${at} ${field.name}: required by the kit, optional in the declarations`]
      : [];
  });
}

/** The two sides of a set of names, as lines: what is declared and missing, and what the kit adds. */
export function nameDifferences(
  at: string,
  kit: Iterable<string>,
  declaredNames: Iterable<string>,
): string[] {
  const ours = new Set(kit);
  const theirs = new Set(declaredNames);
  return [
    ...[...theirs]
      .filter((name) => !ours.has(name))
      .map((name) => `${at} ${name}: declared, not in the kit`),
    ...[...ours]
      .filter((name) => !theirs.has(name))
      .map((name) => `${at} ${name}: in the kit, not declared`),
  ];
}
