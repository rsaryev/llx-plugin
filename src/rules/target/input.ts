import type { AgentInput, ArtifactInput, WebFetchInput } from '../../protocol/official-tools.ts';

/**
 * The input fields the target matchers read: the SDK's own field names, so a rename in `AgentInput`,
 * `WebFetchInput` or `ArtifactInput` stops compiling here (E2). `skill` is the one the SDK has no
 * input type for (permissions.md, "Match by input parameter": `Skill(skill:<name>)`).
 */
type TargetField = keyof AgentInput | keyof WebFetchInput | keyof ArtifactInput | 'skill';

/** A string field of a tool's input, or `undefined` when the input has no such string. */
export function inputString(input: unknown, field: TargetField): string | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  if (!Object.hasOwn(input, field)) return undefined;
  const value: unknown = Reflect.get(input, field);
  return typeof value === 'string' ? value : undefined;
}
