/**
 * How Claude Code clones with the credentials already on the machine (plugins/install.md, "Add a
 * private marketplace"; env-vars.md, `CLAUDE_CODE_PLUGIN_PREFER_HTTPS`): pure, the host runs git. The
 * variable names that switch git's prompts off are the kit's choice (spec/judgments.md); the docs say
 * only that "Git's prompts and askpass programs are off, including one set in `GIT_ASKPASS`".
 */

export type CloneTransport = 'https' | 'ssh';

/** Facts about the machine the host reads. */
export interface ShorthandFacts {
  /** `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`: "skip that check and always clone over HTTPS". */
  readonly preferHttps: boolean;
  /** Whether the user's SSH key authenticates to `github.com`; consulted only without `preferHttps`. */
  readonly sshAuthenticates: () => boolean;
}

/**
 * A GitHub `owner/repo` shorthand: "Claude Code checks whether your SSH key authenticates to
 * `github.com`, then clones over SSH if it does and over HTTPS if it doesn't"; `PREFER_HTTPS` skips
 * the check.
 */
export function shorthandTransport(facts: ShorthandFacts): CloneTransport {
  if (facts.preferHttps) return 'https';
  return facts.sshAuthenticates() ? 'ssh' : 'https';
}

/** Environment settings that make git fail instead of asking. They replace what the user's environment holds. */
export const NO_PROMPT_ENVIRONMENT: Readonly<Record<string, string>> = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
  GCM_INTERACTIVE: 'never',
};

/** Where the user's git setup names an SSH program; the host reads these three. */
export interface SshProgramFacts {
  readonly gitSshCommand?: string;
  readonly gitSsh?: string;
  /** `core.sshCommand` of the git configuration. */
  readonly coreSshCommand?: string;
}

export interface ClonePlan {
  /** Set on top of the inherited environment. */
  readonly environment: Readonly<Record<string, string>>;
  /** Runs the program the user's git setup names; otherwise `ssh` with `BatchMode`, which never asks for a passphrase. */
  readonly sshProgram: 'user-configured' | 'ssh-batch-mode';
}

const named = (value: string | undefined): boolean => (value ?? '') !== '';

/**
 * The environment and SSH program of a clone, for an HTTPS credential helper (prompts off), an SSH
 * key that "must work without a passphrase prompt", and "if your git setup names an SSH program ...
 * Claude Code runs that program".
 */
export function clonePlan(ssh: SshProgramFacts = {}): ClonePlan {
  const configured = [ssh.gitSshCommand, ssh.gitSsh, ssh.coreSshCommand].some(named);
  return {
    environment: NO_PROMPT_ENVIRONMENT,
    sshProgram: configured ? 'user-configured' : 'ssh-batch-mode',
  };
}

/**
 * The transports tried in order for a GitHub `owner/repo` (plugins/host-marketplace.md, "Grant access
 * to a private marketplace"): `ssh -T git@github.com` first, SSH when it succeeds; "if the probe
 * fails, or the SSH clone itself fails, it clones over HTTPS". `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` skips
 * the probe.
 */
export function shorthandAttempts(facts: ShorthandFacts): readonly CloneTransport[] {
  return shorthandTransport(facts) === 'ssh' ? ['ssh', 'https'] : ['https'];
}
