import { warning } from '../../format/issues.ts';
import { refuse, type Contribution, type FlagContext, type FlagFacts } from './types.ts';

/**
 * `--append-subagent-system-prompt`, `--append-subagent-system-prompt-file` and
 * `--forward-subagent-text` (cli-reference.md, "CLI flags"; errors.md, "Conflict between a
 * system-prompt flag and its file form"; headless.md, "Follow subagent messages"). The first two
 * append text to every subagent's system prompt and "only apply in non-interactive mode with `-p`";
 * the two "can't be combined". The last forwards subagent text and thinking blocks and "requires
 * `--print` and `--output-format stream-json`"; `CLAUDE_CODE_FORWARD_SUBAGENT_TEXT=1` "enables the
 * same behavior" and, "unlike the flag", "is ignored" outside that mode (env-vars.md). What a flag
 * does when its requirement is missing is not stated: it has no effect (spec/judgments.md).
 */

const CONFLICT =
  'Error: Cannot use both --append-subagent-system-prompt and --append-subagent-system-prompt-file. Please use only one.';

const STREAM_JSON = 'stream-json';

/** Both forms give a refusal; the inline form reports it, so the file form stays silent when both are given. */
export function appendSubagentPrompt(text: string, context: FlagContext): Contribution {
  if (context.given['--append-subagent-system-prompt-file'] !== undefined) return refuse(CONFLICT);
  return context.facts.print ? { subagentPromptAppend: text } : {};
}

export function appendSubagentPromptFile(path: string, context: FlagContext): Contribution {
  if (context.given['--append-subagent-system-prompt'] !== undefined) return {};
  if (!context.facts.print) return {};
  const file = context.facts.files[path];
  if (file === undefined) {
    return refuse(`Error: --append-subagent-system-prompt-file file not found: ${path}`);
  }
  return { subagentPromptAppend: file.text };
}

const streamsJson = ({ print, outputFormat }: FlagFacts): boolean =>
  print && outputFormat === STREAM_JSON;

/** The variable alone: ignored, without a warning, outside `--print` with `stream-json`. */
export const forwardSubagentTextVariable = (facts: FlagFacts): Contribution =>
  facts.env.CLAUDE_CODE_FORWARD_SUBAGENT_TEXT === '1' && streamsJson(facts)
    ? { forwardSubagentText: true }
    : {};

export function forwardSubagentText(_value: true, context: FlagContext): Contribution {
  if (streamsJson(context.facts)) return { forwardSubagentText: true };
  return {
    warnings: [
      warning(
        '--forward-subagent-text',
        'has no effect without --print and --output-format stream-json',
      ),
    ],
  };
}
