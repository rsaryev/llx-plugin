/**
 * The Anthropic API key: `ANTHROPIC_API_KEY`, else the one llx keeps in `~/.config/llx/key-anthropic`.
 * Never printed.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export async function anthropicKey(): Promise<string> {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const file = join(homedir(), '.config', 'llx', 'key-anthropic');
  const key = (await readFile(file, 'utf8').catch(() => '')).trim();
  if (!key.startsWith('sk-ant-'))
    throw new Error(`No Anthropic key: set ANTHROPIC_API_KEY or ${file}`);
  return key;
}
