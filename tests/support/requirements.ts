import requirements from '../../spec/requirements.json' with { type: 'json' };

/** The ids of the requirements under a prefix (`mods.event.`), with the prefix removed. */
export const requirementKeys = (prefix: string): string[] =>
  requirements.requirements
    .map((requirement) => requirement.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => id.slice(prefix.length));
