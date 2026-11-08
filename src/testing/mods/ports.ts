import type { PluginIssue } from '../../format/issues.ts';
import type { TestKit } from './kit.ts';

/**
 * The port that evaluates a test file, as `ModRuntime` does a hooks module: the host runs the
 * compiled test in an isolate it chooses with `claude-code/testing` bound to `kit`, and hands back
 * when the file has finished declaring its tests. The kit never runs a test file's source.
 */
export interface ModTestRuntime {
  loadTests(
    input: {
      readonly plugin: string;
      /** The test file's path in the plugin folder. */
      readonly file: string;
      /** The compiler's run output for the file, and the format the host's compiler chose for it. */
      readonly code: string;
      readonly format: string;
      readonly kit: TestKit;
    },
    signal: AbortSignal,
  ): Promise<{ readonly issues: readonly PluginIssue[] }>;
}

/** A runtime that runs the declaring function of each file in this process, for the kit's own tests and hosts without an isolate. */
export function inlineTests(
  declare: (kit: TestKit, file: string) => void | Promise<void>,
): ModTestRuntime {
  return {
    loadTests: async ({ kit, file }) => {
      await declare(kit, file);
      return { issues: [] };
    },
  };
}
