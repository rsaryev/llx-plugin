/**
 * The mods API by namespace and method name (plugins/mods/reference.md, "Mods API methods"): the
 * `$` argument every hook receives. Every method is also an event named `<namespace>.<method>`
 * (reference.md, "Mods API calls"), so this table is where the names of those events come from.
 */
export const MODS_API = {
  plugin: ['name', 'root'],
  ui: [
    'resolve',
    'invalidate',
    'open',
    'close',
    'panes',
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
  ],
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
