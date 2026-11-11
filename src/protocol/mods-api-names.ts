/**
 * The mods API by namespace and method name as the reference page lists it (plugins/mods/reference.md,
 * "Mods API methods"), in its order.
 */
export const MODS_API_REFERENCE = {
  plugin: ['name', 'root'],
  ui: [
    'resolve',
    'invalidate',
    'open',
    'close',
    'panes',
    'place',
    'focus',
    'scroll',
    'toast',
    'notify',
    'status',
    'log',
    'notice',
    'ask',
    'copy',
    'selection',
    'blit',
    'view',
  ],
  theme: ['set', 'clear'],
  command: ['register', 'run', 'list'],
  tool: ['register', 'call', 'check', 'list'],
  agent: ['register', 'spawn', 'list'],
  model: ['complete', 'fork', 'classify'],
  prompt: ['submit', 'read', 'fill', 'suggest', 'compose'],
  turn: ['abort'],
  session: [
    'messages',
    'cwd',
    'root',
    'model',
    'turns',
    'id',
    'repo',
    'surfaces',
    'usage',
    'version',
    'compact',
    'send',
    'append',
    'authorize',
  ],
  config: ['list', 'set'],
  settings: ['read'],
  env: ['get', 'set'],
  fs: ['read', 'write', 'list', 'exists', 'stat', 'ancestors'],
  store: ['get', 'set', 'delete', 'keys'],
  state: ['get', 'set'],
  clock: ['now', 'sleep', 'after', 'every'],
  http: ['fetch'],
  process: ['run', 'spawn'],
  mcp: ['call', 'connect'],
  audio: ['play', 'speak'],
  telemetry: ['log', 'mark'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

/**
 * The members of `$` the declarations name and the reference page does not (AGENTS.md, E2a: the
 * declarations win): `$.ui.cancelNotify` (claude-code/index.d.ts:2536), `$.prompt.media` (:3143) and
 * `$.prompt.paint` (:3168), `$.session.surface` (:2980) and `$.session.identity` (:3081).
 */
export const DECLARED_API_MEMBERS = {
  ui: ['cancelNotify'],
  prompt: ['media', 'paint'],
  session: ['surface', 'identity'],
} as const satisfies { readonly [N in keyof typeof MODS_API_REFERENCE]?: readonly string[] };

/**
 * The mods API by namespace and method name: the `$` argument every hook receives, the reference's
 * members and then the declarations' others. Every method is also an event named
 * `<namespace>.<method>` (reference.md, "Mods API calls"), so this table is where the names of those
 * events come from.
 */
export const MODS_API = {
  ...MODS_API_REFERENCE,
  ui: [...MODS_API_REFERENCE.ui, ...DECLARED_API_MEMBERS.ui],
  prompt: [...MODS_API_REFERENCE.prompt, ...DECLARED_API_MEMBERS.prompt],
  session: [...MODS_API_REFERENCE.session, ...DECLARED_API_MEMBERS.session],
} as const;

/**
 * The `status` of each entry `$.agent.list()` returns (reference.md, "Mods API methods"); `idle`
 * and `waiting` require Claude Code v2.1.289 or later, and the kit implements the current behaviour.
 */
export const AGENT_STATUSES = [
  'pending',
  'running',
  'waiting',
  'idle',
  'completed',
  'failed',
  'killed',
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export type ModsNamespace = keyof typeof MODS_API;
export type ModsMethod<N extends ModsNamespace> = (typeof MODS_API)[N][number];

/**
 * The calls whose time is the calling hook's own: "A `$` call's time never counts against the calling
 * hook's budget" (claude-code/index.d.ts:6589), but `$.clock.sleep`'s wait "is the hook's own time and
 * its budget runs on through it, as through no other `$` call" (:3641).
 */
export const OWN_TIME_CALLS: ReadonlySet<string> = new Set(['clock.sleep']);

/**
 * The calls declared to answer nothing (`=> void`, claude-code/index.d.ts:2400 `notice`, :2416
 * `invalidate`, :2470 `log`, :2503 `toast`, :2550 `status`): each returns at once and its event goes
 * on through the chain on its own.
 */
export const FIRED_CALLS = [
  'ui.notice',
  'ui.invalidate',
  'ui.log',
  'ui.toast',
  'ui.status',
] as const;
export type FiredEventName = (typeof FIRED_CALLS)[number];

/**
 * The calls that answer at once, not with a promise: `$.ui.resolve`, the timers and the fired calls.
 * A misused one throws where it is called.
 */
export const AT_ONCE_CALLS: ReadonlySet<string> = new Set([
  'ui.resolve',
  'clock.after',
  'clock.every',
  ...FIRED_CALLS,
]);
