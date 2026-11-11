/** Runs `git` without a terminal prompt; throws with its stderr when it fails or takes over 3 minutes. */
export async function git(args: readonly string[]): Promise<void> {
  const child = Bun.spawn(['git', ...args], {
    stdout: 'ignore',
    stderr: 'pipe',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' },
    timeout: 180_000,
  });
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (code !== 0) throw new Error(`git ${args.slice(0, 3).join(' ')}: ${stderr.trim()}`);
}
