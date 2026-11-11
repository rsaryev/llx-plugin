/**
 * The differences between the kit and the mods declarations of the pinned release (AGENTS.md, E2a)
 * that stand, each with the `spec/judgments.md` row that says why: `**D2**` and the others.
 * `tests/mods/declarations/surface.test.ts` fails on a difference not listed here and on a listing
 * no longer a difference, so the list is exactly what stands.
 */
export const JUDGED_DIFFERENCES: Readonly<Record<string, string>> = {
  // D6: a mark's event keeps `to: 'collector'`, the filter a telemetry hook names.
  'event telemetry.mark input: e.to is given by the kit, not declared': 'D6',
  // D9: facts of a call's event that the engine resolves (the transcript, ids, the window, the session's).
  'event ui.scroll input: e.bodyRows is missing, declared required': 'D9',
  'event ui.scroll input: e.by is missing, declared required': 'D9',
  'event ui.scroll input: e.component is missing, declared required': 'D9',
  'event ui.scroll input: e.contentRows is missing, declared required': 'D9',
  'event ui.scroll input: e.offset is missing, declared required': 'D9',
  'event ui.scroll input: e.requestId is missing, declared required': 'D9',
  'event ui.scroll input: e.to is given by the kit, not declared': 'D9',
  'event ui.focus input: e.component is missing, declared required': 'D9',
  'event ui.focus input: e.key is given by the kit, not declared': 'D9',
  'event session.compact input: e.messages is missing, declared required': 'D9',
  'event session.append input: e.uuid is missing, declared required': 'D9',
  'event prompt.compose input: e.model is missing, declared required': 'D9',
  'event prompt.compose input: e.outputStyle is missing, declared required': 'D9',
  'event prompt.compose input: e.promptModel is missing, declared required': 'D9',
  'event prompt.compose input: e.surfaces is missing, declared required': 'D9',
  'event prompt.compose input: e.tools is missing, declared required': 'D9',
  'event prompt.compose input: e.traits is missing, declared required': 'D9',
  'event tool.call input: e.tool_use_id is missing, declared required': 'D9',
  'event agent.spawn input: e.background is missing, declared required': 'D9',
  'event agent.spawn input: e.description is missing, declared required': 'D9',
  'event agent.spawn input: e.fork is missing, declared required': 'D9',
  'event agent.spawn input: e.parentModel is missing, declared required': 'D9',
  'event agent.spawn input: e.provider is missing, declared required': 'D9',
  'event agent.spawn input: e.subagentType is missing, declared required': 'D9',
  'event agent.spawn input: e.tool_use_id is missing, declared required': 'D9',
  // D2: `$.ui.ask` fires an op event of the kit's.
  'event ui.ask: in the kit, not declared': 'D2',
  // D4: the mobile table has no `Client`; the kit's mobile column is the desktop's.
  'elements of mobile Client: in the kit, not declared': 'D4',
  // D5: tools of the SDK the pulled build's BuiltinToolInputs leaves out.
  'tool Glob: in the tools table, not declared': 'D5',
  'tool Grep: in the tools table, not declared': 'D5',
  'tool PowerShell: in the tools table, not declared': 'D5',
  'tool SubagentHandback: in the tools table, not declared': 'D5',
  'tool TaskOutput: in the tools table, not declared': 'D5',
};
