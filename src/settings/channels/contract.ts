import type { ChannelVerdict } from './verdict.ts';

/**
 * The channel contract a host reads from a server and applies to its events (channels-reference.md,
 * "Server options", "Notification format", "Gate inbound messages"; channels.md, "Security"). Pure
 * over data the host read from the MCP connection; the kit starts no server.
 */

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a server's capabilities declare. */
export interface ChannelCapabilities {
  /** `experimental['claude/channel']`: "Required. Always `{}`. Presence registers the notification listener." */
  readonly channel: boolean;
  /** `experimental['claude/channel/permission']`: `{}` declares relay; "omit the key or set it to `false`" opts out. */
  readonly permission: boolean;
  /** `tools`: "Two-way only", the standard MCP tool capability. */
  readonly tools: boolean;
}

/** Reads the `capabilities` object of the server's initialize result. */
export function channelCapabilities(capabilities: unknown): ChannelCapabilities {
  const record = isRecord(capabilities) ? capabilities : {};
  const experimental = isRecord(record.experimental) ? record.experimental : {};
  return {
    channel: Object.hasOwn(experimental, 'claude/channel'),
    permission: isRecord(experimental['claude/channel/permission']),
    tools: isRecord(record.tools),
  };
}

/** "To create a one-way channel, omit `capabilities.tools`": a channel with tools can take replies. */
export const isTwoWay = (capabilities: ChannelCapabilities): boolean => capabilities.tools;

/**
 * `instructions` "Claude Code delivers ... to Claude as context when the server connects": the text
 * to add to the context, or `undefined` when the server gave none.
 */
export const channelInstructions = (instructions: unknown): string | undefined =>
  typeof instructions === 'string' && instructions !== '' ? instructions : undefined;

/** The `notifications/claude/channel` params. */
export interface ChannelNotification {
  readonly content: string;
  readonly meta?: Readonly<Record<string, string>>;
}

/**
 * The `notifications/claude/channel` params a server sent, read as a `ChannelNotification`: `content` is a
 * required string ("The event body"), so a notification without one is `undefined`; `meta` keeps the
 * entries whose key is an identifier and whose value is a string. Judgment (spec/judgments.md): the docs type
 * `meta` as `Record<string, string>` and say nothing about a value of another type; it is dropped, as a key
 * that is not an identifier is.
 */
export function readChannelNotification(params: unknown): ChannelNotification | undefined {
  if (typeof params !== 'object' || params === null) return undefined;
  const { content, meta } = params as { content?: unknown; meta?: unknown };
  if (typeof content !== 'string') return undefined;
  const kept: Record<string, string> = {};
  if (typeof meta === 'object' && meta !== null) {
    for (const [key, value] of Object.entries(meta)) {
      if (IDENTIFIER.test(key) && typeof value === 'string') kept[key] = value;
    }
  }
  return { content, meta: kept };
}

/** "Keys must be identifiers: letters, digits, and underscores only ... other characters are silently dropped." */
const IDENTIFIER = /^[A-Za-z0-9_]+$/;

/**
 * Judgment (spec/judgments.md): the docs show attributes as `key="value"` and do not say how a quote in
 * a value is written; the kit escapes `&`, `"`, `<` and `>` as XML does.
 */
const escapeAttribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/**
 * The event as Claude sees it: `<channel source="..." key="value">content</channel>`. `source` "is set
 * automatically from your server's configured name"; each valid `meta` entry is an attribute.
 */
export function channelTag(source: string, notification: ChannelNotification): string {
  const attributes = Object.entries(notification.meta ?? {})
    .filter(([key]) => IDENTIFIER.test(key) && key !== 'source')
    .map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`);
  const head = `<channel source="${escapeAttribute(source)}"${attributes.join('')}>`;
  return `${head}\n${notification.content}\n</channel>`;
}

/**
 * Whether an event reaches the session. "If the session hasn't loaded your server as a channel, or the
 * organization policy blocks it, Claude Code drops the events silently and returns no error": the
 * server must be named by a flag (`verdict` is set) and the verdict must admit it. Being in `.mcp.json`
 * alone is not enough (channels.md, "Security").
 */
export const deliversChannelEvents = (verdict: ChannelVerdict | undefined): boolean =>
  verdict?.allowed === true;

/**
 * "Events queue into the session and are processed in order. If several notifications arrive while
 * Claude is busy, they're delivered together on the next turn and Claude handles them as a group."
 */
export const groupChannelEvents = (tags: readonly string[]): string | undefined =>
  tags.length === 0 ? undefined : tags.join('\n');

/** A message from a chat platform: who sent it and in which room. */
export interface InboundMessage {
  readonly from: { readonly id: string };
  readonly chat: { readonly id: string };
}

/**
 * "Gate on the sender's identity, not the chat or room identity": a message passes when its sender is
 * on the list, whatever room it came from.
 */
export const senderAllowed = (allowed: ReadonlySet<string>, message: InboundMessage): boolean =>
  allowed.has(message.from.id);
