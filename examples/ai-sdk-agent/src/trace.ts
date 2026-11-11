/** Everything the agent did, in order: what a scenario asserts on and what the CLI prints. */
export type TraceEvent =
  | { readonly kind: 'hook'; readonly event: string; readonly detail: string }
  | {
      readonly kind: 'tool';
      readonly name: string;
      readonly input: unknown;
      readonly output: string;
    }
  | { readonly kind: 'blocked'; readonly name: string; readonly reason: string }
  | {
      readonly kind: 'skill';
      readonly name: string;
      readonly by: 'user' | 'model';
      readonly ok: boolean;
    }
  | { readonly kind: 'agent'; readonly name: string; readonly text: string }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'issue'; readonly message: string };

export class Trace {
  readonly events: TraceEvent[] = [];
  constructor(private readonly echo: boolean) {}

  add(event: TraceEvent): void {
    this.events.push(event);
    if (this.echo) console.log(describe(event));
  }

  of<K extends TraceEvent['kind']>(kind: K): Extract<TraceEvent, { kind: K }>[] {
    return this.events.filter(
      (event): event is Extract<TraceEvent, { kind: K }> => event.kind === kind,
    );
  }
}

const short = (text: string, max = 160) =>
  text.length > max ? `${text.slice(0, max).replaceAll('\n', ' ')}…` : text.replaceAll('\n', ' ');

function describe(event: TraceEvent): string {
  switch (event.kind) {
    case 'hook':
      return `  ⚓ ${event.event}: ${short(event.detail)}`;
    case 'tool':
      return `  🔧 ${event.name} ${short(JSON.stringify(event.input), 100)} → ${short(event.output)}`;
    case 'blocked':
      return `  ⛔ ${event.name}: ${short(event.reason)}`;
    case 'skill':
      return `  📘 skill ${event.name} (${event.by}) ${event.ok ? 'expanded' : 'refused'}`;
    case 'agent':
      return `  🤖 subagent ${event.name}: ${short(event.text)}`;
    case 'text':
      return `  💬 ${short(event.text, 400)}`;
    case 'issue':
      return `  ⚠️  ${short(event.message, 300)}`;
    default:
      return JSON.stringify(event satisfies never);
  }
}
