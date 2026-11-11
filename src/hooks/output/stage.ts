import type { ScratchFiles } from '../../ports/scratch-files.ts';
import type { OutputStage } from '../verdict/types.ts';
import { limitOutputs } from './limit.ts';
import { mergeOutputs } from './merge.ts';
import { parseHookOutput } from './parse.ts';

export interface OutputStageOptions {
  /** Where text over the 10,000-character cap is saved; without it such text is cut at the cap. */
  readonly scratch?: ScratchFiles;
}

/** The real output stage the engine takes: parse, cap, merge (hooks.md, "JSON output"). */
export function createOutputStage(options: OutputStageOptions = {}): OutputStage {
  return {
    parse: parseHookOutput,
    limit: (event, outputs, signal) =>
      limitOutputs(event, outputs, {
        signal,
        ...(options.scratch === undefined ? {} : { scratch: options.scratch }),
      }),
    merge: mergeOutputs,
  };
}
