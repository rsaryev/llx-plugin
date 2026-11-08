import type { SDKMessageOrigin } from '../../protocol/official.ts';
import type { PolicyView } from '../view.ts';
import { workflowsDecision, type WorkflowsContext } from './enablement.ts';

/**
 * How a prompt reaches the session (workflows.md, "Where the keyword works"): typed at the
 * interactive prompt, in an IDE extension panel or in a Remote Control client; sent by an Agent SDK
 * application; passed with `-p`; run as a scheduled task; or relayed from a webhook payload or a pull
 * request comment.
 */
export const PROMPT_SURFACES = [
  'interactive',
  'ideExtension',
  'remoteControl',
  'sdk',
  'print',
  'scheduledTask',
  'relayedEvent',
] as const;
export type PromptSurface = (typeof PROMPT_SURFACES)[number];

export interface PromptInput {
  readonly surface: PromptSurface;
  readonly text: string;
  /** An SDK application's stamp on the prompt; read only for the `sdk` surface. */
  readonly origin?: SDKMessageOrigin;
  /** The person dismissed the highlight for this prompt (`Option+W`, `Alt+W`, or backspace after it). */
  readonly dismissed?: boolean;
}

/**
 * Why a prompt does not trigger a workflow, in the order the kit checks them (spec/judgments.md). The
 * setting is named only for a prompt that has the keyword: `/effort ultracode` reads the same either way.
 */
export type KeywordMiss =
  | 'workflowsOff'
  | 'notTypedByHuman'
  | 'dismissed'
  | 'keywordSettingOff'
  | 'noKeyword';

export interface KeywordVerdict {
  readonly triggers: boolean;
  /** Why not, when it does not trigger. */
  readonly reason: KeywordMiss | undefined;
  /** The keyword Claude Code highlights in the input, as a range of the text. */
  readonly highlight: { readonly start: number; readonly end: number } | undefined;
}

/** The origin kinds of `SDKMessageOrigin`: only the one for keyboard input is a prompt a person typed. */
const TYPED_BY_HUMAN: { readonly [K in SDKMessageOrigin['kind']]: boolean } = {
  human: true,
  channel: false,
  peer: false,
  'task-notification': false,
  'auto-continuation': false,
  coordinator: false,
  observer: false,
  'observer-activity': false,
  unclassified: false,
};

const originTyped = (origin: SDKMessageOrigin | undefined): boolean =>
  origin !== undefined && TYPED_BY_HUMAN[origin.kind];

/** Whether a prompt on each surface is one the person typed. An SDK prompt counts only when stamped. */
const TYPED: { readonly [S in PromptSurface]: (origin: SDKMessageOrigin | undefined) => boolean } =
  {
    interactive: () => true,
    ideExtension: () => true,
    remoteControl: () => true,
    sdk: originTyped,
    print: () => false,
    scheduledTask: () => false,
    relayedEvent: () => false,
  };

/**
 * The keyword is `ultracode` (workflows.md names it and no more). Judgment (spec/judgments.md): a whole
 * word in any letter case, anywhere in the prompt, and a prompt that is a slash command (`/effort
 * ultracode`) is not scanned: that command is the effort setting, which the key leaves alone.
 */
const KEYWORD = /\bultracode\b/i;

function find(text: string): { start: number; end: number } | undefined {
  if (text.trimStart().startsWith('/')) return undefined;
  const match = KEYWORD.exec(text);
  return match ? { start: match.index, end: match.index + match[0].length } : undefined;
}

const miss = (reason: KeywordMiss): KeywordVerdict => ({
  triggers: false,
  reason,
  highlight: undefined,
});

/**
 * Whether typing `ultracode` in `prompt` starts a dynamic workflow: workflows are on, the prompt is one
 * a person typed (settings-reference.md, `workflowKeywordTriggerEnabled`; workflows.md, "Where the keyword
 * works"), its highlight was not dismissed, the keyword is in the text and `workflowKeywordTriggerEnabled` is
 * not `false` (default `true`). The key switches the keyword only: `/effort ultracode`,
 * `/workflows` and saved workflow commands do not read it.
 */
export function keywordTrigger(
  view: PolicyView,
  context: WorkflowsContext,
  prompt: PromptInput,
): KeywordVerdict {
  if (!workflowsDecision(view, context).enabled) return miss('workflowsOff');
  if (!TYPED[prompt.surface](prompt.origin)) return miss('notTypedByHuman');
  if (prompt.dismissed === true) return miss('dismissed');
  const highlight = find(prompt.text);
  if (highlight === undefined) return miss('noKeyword');
  if (view.get('workflowKeywordTriggerEnabled') === false) return miss('keywordSettingOff');
  return { triggers: true, reason: undefined, highlight };
}
