import { answer, noFields, text, type EventSpec } from './spec.ts';

/** `attribution.text`: Claude Code composes commit or pull request attribution text; a hook answers `{ text }` (reference.md, "Prompts and what Claude reads"). The docs name no field of its input. */
export const ATTRIBUTION_SPEC: EventSpec = { input: noFields, result: answer({ text }) };
