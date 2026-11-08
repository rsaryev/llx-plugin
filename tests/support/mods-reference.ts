import { snapshotSchema } from '../../scripts/spec/mods-reference.ts';
import tables from '../../spec/docs-tables.json' with { type: 'json' };
import requirements from '../../spec/requirements.json' with { type: 'json' };

/**
 * The tables of plugins/mods/reference.md the mods tests compare the kit with. A committed
 * snapshot written by `bun run spec:extract`; `check:spec` (SP5) compares it with the pulled docs,
 * so a test never reads `.cache/claude-docs` (docs/TESTING.md).
 */
export const MODS_REFERENCE = snapshotSchema.parse(tables);

/** The ids of the requirements under a prefix (`mods.event.`), with the prefix removed. */
export const requirementKeys = (prefix: string): string[] =>
  requirements.requirements
    .map((requirement) => requirement.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => id.slice(prefix.length));
