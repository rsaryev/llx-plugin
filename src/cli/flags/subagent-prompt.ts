import { warning } from '../../format/issues.ts';
import { refuse, type Contribution, type FlagContext } from './types.ts';

/**
 * `--append-subagent-system-prompt`, `--append-subagent-system-prompt-file` and
 * `--forward-subagent-text` (cli-reference.md, "CLI flags"; errors.md, "Conflict between a
 * system-prompt flag and its file form"; headless.md, "Follow subagent messages"). The first two
 * append text to every subagent's system prompt and "only apply in non-interactive mode with `-p`";
 * the two "can't be combined". The last forwards subagent text and thinking blocks and "requires
 * `--print` and `--output-format stream-json`". What a flag does when its requirement is missing is
 * not stated: it has no effect (spec/judgments.md).
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

export function forwardSubagentText(_value: true, context: FlagContext): Contribution {
  const { print, outputFormat } = context.facts;
  if (print && outputFormat === STREAM_JSON) return { forwardSubagentText: true };
  return {
    warnings: [
      warning(
        '--forward-subagent-text',
        'has no effect without --print and --output-format stream-json',
      ),
    ],
  };
}
