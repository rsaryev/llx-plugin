import type { ApiEventName } from '../../src/protocol/mods-events.ts';
import type { RegisterTier } from '../../src/mods/types.ts';

/**
 * The smallest arguments each mods API call accepts, by the event the call fires: what a test
 * passes to `$.<namespace>.<method>(...args)` to see the call reach its hooks. Typed over every
 * `ApiEventName`, so a call added to the table fails to compile until it has a sample.
 */
export const CALL_SAMPLES: Readonly<Record<ApiEventName, readonly unknown[]>> = {
  'ui.resolve': [
    { plugin: 'my-mod', component: 'Pane', surface: 'terminal', requestId: 'r', props: {} },
  ],
  'ui.invalidate': ['ui.render'],
  'ui.open': [{ id: 'my-pane' }],
  'ui.close': [{ id: 'my-pane' }],
  'ui.panes': [],
  'ui.place': [{ id: 'build-status' }],
  'ui.focus': [{ requestId: 'r', key: 'k' }],
  'ui.scroll': [{ to: 'end' }],
  'ui.toast': ['saved'],
  'ui.notify': ['saved'],
  'ui.cancelNotify': ['build'],
  'ui.status': ['saved'],
  'ui.log': ['saved'],
  'ui.notice': ['toolu_1', 'saved'],
  'ui.ask': ['Run it?', ['Run it', 'Skip']],
  'ui.copy': [{ text: 'saved' }],
  'ui.selection': [],
  'ui.blit': [{ requestId: 'r', key: 'grid', cells: '' }],
  'ui.view': [{}],
  'theme.set': [{ backdrop: { id: 'night-sky' } }],
  'theme.clear': [],
  'command.register': [{ name: 'tally', description: 'Counts' }],
  'command.run': [{ command: 'help' }],
  'command.list': [],
  'tool.register': [{ name: 'tally', description: 'Counts', inputSchema: { type: 'object' } }],
  'tool.call': [{ tool: 'Bash', command: 'ls' }],
  'tool.check': [{ tool: 'Bash', input: { command: 'ls' } }],
  'tool.list': [],
  'agent.register': [{ name: 'reviewer', description: 'Reviews', prompt: 'Review it' }],
  'agent.spawn': [{ prompt: 'look' }],
  'agent.list': [],
  'model.complete': [{ model: 'haiku', prompt: 'hi' }],
  'model.fork': [{ prompt: 'hi' }],
  'model.classify': ['hi', ['bug', 'feature']],
  'prompt.submit': [{ text: 'go on' }],
  'prompt.read': [],
  'prompt.fill': [{ text: 'draft' }],
  'prompt.paint': [{ decorations: [{ start: 0, end: 1, bold: true }] }],
  'prompt.suggest': [{ text: 'draft' }],
  'prompt.compose': [],
  'turn.abort': [{ turnId: 'turn-1' }],
  'session.messages': [],
  'session.cwd': [],
  'session.root': [],
  'session.model': [],
  'session.turns': [],
  'session.id': [],
  'session.repo': [],
  'session.surfaces': [],
  'session.surface': [],
  'session.usage': [],
  'session.version': [],
  'session.compact': [],
  'session.send': [{ to: { sessionId: 'abc-123' }, text: 'hello' }],
  'session.append': [{ message: { type: 'user', content: [{ type: 'text', text: 'hello' }] } }],
  'session.authorize': [],
  'session.identity': [],
  'config.list': [],
  'config.set': [{ key: 'theme', value: 'dark' }],
  'settings.read': [],
  'env.get': ['HOME'],
  'env.set': ['MY_FLAG', '1'],
  'fs.read': ['/work/notes.md'],
  'fs.write': ['/work/notes.md', 'text'],
  'fs.list': ['/work'],
  'fs.exists': ['/work/notes.md'],
  'fs.stat': ['/work/notes.md'],
  'fs.ancestors': [{ names: ['AGENTS.md'] }],
  'store.get': ['count'],
  'store.set': ['count', 1],
  'store.delete': ['count'],
  'store.keys': [],
  'state.get': [{ plugin: 'my-mod', key: 'count' }],
  'state.set': [{ plugin: 'my-mod', key: 'count' }, 1],
  'clock.now': [],
  'clock.sleep': [0],
  'clock.after': [100, () => undefined],
  'clock.every': [100, () => undefined],
  'http.fetch': ['https://example.com/'],
  'process.run': [['echo', 'hi']],
  'process.spawn': [{ argv: ['echo', 'hi'] }],
  'mcp.call': ['docs', 'search', {}],
  'mcp.connect': ['docs'],
  'audio.play': [{ asset: 'ding.wav' }],
  'audio.speak': ['done'],
  'telemetry.log': [
    { to: 'collector', event: 'tally', attributes: {}, loggedAt: '2026-01-01T00:00:00.000Z' },
  ],
  'telemetry.mark': [{ feature: 'tally', kind: 'ok' }],
};

/**
 * The calls whose event a plain mod's call does not fire at the call, with where the rule is proven
 * for them instead (spec/judgments.md has a row for each).
 */
export const NOT_FIRED_BY_A_CALL: Readonly<Partial<Record<ApiEventName, string>>> = {
  'ui.resolve':
    'fires once per app and site when mods load (tests/mods/ui/resolve.test.ts); $.ui.resolve reads that table',
  'ui.ask': 'fires a tool.call of AskUserQuestion, not a ui.ask event (tests/mods/ui/api.test.ts)',
};

/** The tier a call must be made from: telemetry events fire only for a mod built into Claude Code. */
export const CALLER_TIER: Readonly<Partial<Record<ApiEventName, RegisterTier>>> = {
  'telemetry.log': 'builtin',
  'telemetry.mark': 'builtin',
  // `$.session.identity` answers a mod the organization's managed settings install alone.
  'session.identity': 'prepend',
};

/**
 * What a hook answers where the result of the call is its event's own, and the event's shape is not
 * the plain `{ value }` (events.md, "Approve or refuse a tool call before the user is asked": a
 * `tool.check` hook answers `{ decision }`).
 */
export const OWN_ANSWERS: Readonly<
  Partial<Record<ApiEventName, { readonly value: unknown; readonly deny: unknown }>>
> = {
  'tool.check': {
    value: { decision: 'allow' },
    deny: { decision: 'deny', reason: 'not now' },
  },
  // events.md, "Change the system prompt": a `prompt.compose` hook answers `{ sections }`; the event has no refusal.
  'prompt.compose': {
    value: { sections: [] },
    deny: { sections: [{ id: 'policy', text: 'not now', scope: 'session' }] },
  },
};

/** The ports a call reads to build the event its hooks see, before any hook runs (`$.settings.read` hands the hook the layers). */
export const READ_FOR_THE_EVENT: Readonly<Partial<Record<ApiEventName, readonly string[]>>> = {
  'settings.read': ['settings.layers'],
  // The working directory of a command that was not given one.
  'process.run': ['session.cwd'],
  'process.spawn': ['session.cwd'],
  // The row's `previous` and `provider`, which the event pins.
  'config.set': ['config.list'],
};
