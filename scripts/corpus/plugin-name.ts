import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';

const manifestName = z.object({ name: z.string() });

/** The name Claude Code looks a `--plugin-dir` plugin up by: the manifest's, else the folder's. */
export async function lookupName(dir: string): Promise<string> {
  try {
    const raw: unknown = JSON.parse(
      await readFile(join(dir, '.claude-plugin', 'plugin.json'), 'utf8'),
    );
    const parsed = manifestName.safeParse(raw);
    if (parsed.success) return parsed.data.name;
  } catch {
    // no manifest, or not JSON: the folder name
  }
  return basename(dir);
}
