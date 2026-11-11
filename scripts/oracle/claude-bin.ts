/**
 * The Claude Code program every oracle runs, as a black box: `CLAUDE_ORACLE_BIN` when it is set (the
 * path of one installed release, such as `~/.local/share/claude/versions/2.1.319`), else `claude` on
 * `PATH`. Its release is read from the program's own `--version`, so a cache or a recorded fixture
 * names the program that answered, never the release the requirements were extracted from.
 */
export const CLAUDE_BIN = process.env['CLAUDE_ORACLE_BIN'] ?? 'claude';

/** `x.y.z` from `<bin> --version`, or undefined when the program does not run. */
export async function claudeVersion(): Promise<string | undefined> {
  try {
    const run = Bun.spawn([CLAUDE_BIN, '--version'], { stdout: 'pipe', stderr: 'ignore' });
    const text = await new Response(run.stdout).text();
    await run.exited;
    return /^(\d+\.\d+\.\d+)/.exec(text.trim())?.[1];
  } catch {
    return undefined;
  }
}

/**
 * The release of the program the corpus asks: it must run, and when it is not the release the
 * requirements name, the run says so first, since the oracle then answers for another release.
 */
export async function oracleRelease(pinned: string): Promise<string> {
  const version = await claudeVersion();
  if (version === undefined) throw new Error(`${CLAUDE_BIN} --version did not run`);
  if (version !== pinned) {
    console.log(`note: oracle is Claude Code ${version}; the requirements are ${pinned}`);
    console.log(`      set CLAUDE_ORACLE_BIN to the ${pinned} program to ask that release`);
  }
  return version;
}
