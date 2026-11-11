import type {
  BaseHookInput,
  ClientCapabilities,
  ElicitationHookInput,
  ElicitationHookSpecificOutput,
  ElicitationRequest,
  ElicitationResult,
  ElicitationResultHookSpecificOutput,
} from '../protocol/official.ts';
import { contentOf, formAnswer, type ElicitationAnswer } from './mcp-elicitation-form.ts';

export {
  elicitationFieldProblems,
  elicitationFormFields,
  type ElicitationAnswer,
  type ElicitationField,
  type ElicitationFieldType,
  type ElicitationFormat,
  type ElicitationValue,
} from './mcp-elicitation-form.ts';

/**
 * MCP elicitation (mcp.md, "Respond to MCP elicitation requests", "Elicitation modes Claude Code
 * declares"): a server asks for input mid-task, in form mode (fields the server defines) or URL mode
 * (a link to open). Pure data: the dialog, the browser and the connection are the host's. The request,
 * the answer and the hook fields are the official types.
 */
export type ElicitationMode = 'form' | 'url';

/** What the client declares in `capabilities.elicitation`: both modes, or the bare `{}` (form only). */
export type ElicitationCapability = NonNullable<ClientCapabilities['elicitation']>;

export interface McpConnection {
  /** The MCP protocol revision the connection runs on, such as `2026-07-28`. */
  readonly protocolRevision: string;
  /** A stdio, sse, http or ws server of the user's Claude Code MCP configuration (not a claude.ai connector). */
  readonly userConfigured: boolean;
}

/** "Connections that use protocol revision 2026-07-28". */
const NEW_REVISION = '2026-07-28';

/**
 * What `elicitation` is declared on a connection: `{form: {}, url: {}}` on revision 2026-07-28 and
 * later, and on earlier revisions to the servers of a user's configuration; the bare `{}` on other
 * connections of the earlier revisions. Revisions are dates, so they compare as text.
 */
export function declaredElicitation(connection: McpConnection): ElicitationCapability {
  const both = connection.protocolRevision >= NEW_REVISION || connection.userConfigured;
  return both ? { form: {}, url: {} } : {};
}

/** The modes a server may request: "the bare `elicitation: {}` ... permits elicitation requests in form mode only". */
export function elicitationModes(capability: ElicitationCapability): readonly ElicitationMode[] {
  const declared = (['form', 'url'] as const).filter((mode) => capability[mode] !== undefined);
  return declared.length === 0 ? ['form'] : declared;
}

/**
 * "Caps how long that argument can be": 8,000, "A URL with none of them reaches the cap at about 8,000
 * characters", and "every third character a `%` ... roughly 4,000".
 */
export const ELICITATION_URL_ARGUMENT_CAP = 8_000;

/**
 * Judgment (spec/judgments.md): the docs name `%` and `&` as examples of "every character that needs
 * escaping"; the kit takes the characters a Windows command line treats specially.
 */
const NEEDS_ESCAPING = /[%&^|<>()"!]/g;

/** "Its own character plus three escape characters": each such character counts four times. */
export const urlArgumentLength = (url: string): number =>
  url.length + 3 * (url.match(NEEDS_ESCAPING)?.length ?? 0);

/** What the person can do with a URL request: over the cap "you can only decline the request". */
export function elicitationUrlChoices(url: string): readonly ('open' | 'decline')[] {
  return urlArgumentLength(url) > ELICITATION_URL_ARGUMENT_CAP ? ['decline'] : ['open', 'decline'];
}

/** What the person did with the dialog. */
export type ElicitationResponse =
  | { readonly action: 'accept'; readonly values: Readonly<Record<string, unknown>> }
  | { readonly action: 'decline' | 'cancel' };

/** URL mode carries no content: the answer is that the link was opened. */
const urlAnswer = (): ElicitationAnswer => ({ result: { action: 'accept' } });

const ANSWERS: {
  readonly [M in ElicitationMode]: (
    request: ElicitationRequest,
    values: Readonly<Record<string, unknown>>,
  ) => ElicitationAnswer;
} = { form: formAnswer, url: urlAnswer };

/**
 * The answer to a request: a form's values checked against the fields its schema defines (judgment,
 * spec/judgments.md: the docs say the person "fills in the fields and submits", and do not say how the
 * client checks them; a value for a field the schema lacks is not sent), or the acceptance of a link;
 * declining or cancelling sends no content. A request in no mode is a form (the MCP default).
 */
export function answerElicitation(
  request: ElicitationRequest,
  response: ElicitationResponse,
): ElicitationAnswer {
  return 'values' in response
    ? ANSWERS[request.mode ?? 'form'](request, response.values)
    : { result: { action: response.action } };
}

/** What the `Elicitation` hook receives, in the official field names (hooks.md, "Elicitation"). */
export type ElicitationHookFacts = Omit<
  ElicitationHookInput,
  keyof BaseHookInput | 'hook_event_name'
>;

export function elicitationHookFacts(request: ElicitationRequest): ElicitationHookFacts {
  return {
    mcp_server_name: request.serverName,
    message: request.message,
    ...(request.mode === undefined ? {} : { mode: request.mode }),
    ...(request.url === undefined ? {} : { url: request.url }),
    ...(request.elicitationId === undefined ? {} : { elicitation_id: request.elicitationId }),
    ...(request.requestedSchema === undefined ? {} : { requested_schema: request.requestedSchema }),
  };
}

/**
 * An answer, with the content only the actions in `carrying` send. Judgment (spec/judgments.md): MCP
 * defines `content` for `accept`; the docs add that an `ElicitationResult` hook's `cancel` goes to the
 * server "along with the values the user submitted", and that a decline is "without the user's values".
 */
const answered = (
  action: ElicitationResult['action'],
  content: Readonly<Record<string, unknown>> | undefined,
  carrying: readonly ElicitationResult['action'][],
): ElicitationResult =>
  carrying.includes(action) && content !== undefined
    ? { action, content: contentOf(content) }
    : { action };

/** What the session says about the dialog: with `permissions.denyInsteadOfPrompting` none is shown. */
export interface ElicitationSession {
  readonly denyInsteadOfPrompting?: boolean;
}

/** No hook answered and no dialog may show: "Claude Code cancels an elicitation request". */
const CANCELLED: ElicitationResult = { action: 'cancel' };

/**
 * "To auto-respond to elicitation requests without showing a dialog, use the `Elicitation` hook": an
 * output that names an `action` is the answer; one without is ignored (hooks.md), and the dialog shows
 * (`undefined`). With `permissions.denyInsteadOfPrompting` there is no dialog: a request no hook
 * answers is cancelled (settings-reference.md, "What else `denyInsteadOfPrompting` stops").
 */
export function autoRespondElicitation(
  output: ElicitationHookSpecificOutput | undefined,
  session: ElicitationSession = {},
): ElicitationResult | undefined {
  if (output?.action !== undefined) return answered(output.action, output.content, ['accept']);
  return session.denyInsteadOfPrompting === true ? CANCELLED : undefined;
}

/** The `ElicitationResult` hook "can override the action or content before the response is sent". */
export function overrideElicitationResult(
  result: ElicitationResult,
  output: ElicitationResultHookSpecificOutput,
): ElicitationResult {
  return answered(output.action ?? result.action, output.content ?? result.content, [
    'accept',
    'cancel',
  ]);
}
