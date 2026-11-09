/**
 * `bun run corpus:fetch`: clones the official and community marketplaces, reads each
 * `marketplace.json` with the kit's own `readMarketplace`, plans every entry with `planPluginFetch`,
 * and runs the plan as a host would: a local path is used in place, a git plan is a shallow clone
 * (sparse for a subdirectory, pinned to the entry's `sha` or `ref`). npm, archive and command
 * sources are recorded as skipped. Writes `.cache/corpus/index.json`.
 */
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { planPluginFetch, readMarketplace, type FetchPlan } from '../../src/entry/marketplace.ts';
import { git } from './git.ts';
import {
  CORPUS_DIR,
  INDEX_FILE,
  MARKETPLACES,
  PLUGINS_DIR,
  type CorpusPlugin,
} from './location.ts';
import { pool } from './pool.ts';

type GitPlan = Extract<FetchPlan, { kind: 'git' }>;

const refresh = process.argv.includes('--refresh');

async function cloneMarketplace(name: string, repo: string): Promise<string> {
  const dir = join(CORPUS_DIR, name);
  if (!existsSync(dir)) await git(['clone', '-q', '--depth', '1', repo, dir]);
  else if (refresh) await git(['-C', dir, 'pull', '-q', '--ff-only']);
  return dir;
}

const repoUrl = (plan: GitPlan): string =>
  'url' in plan.repo ? plan.repo.url : `https://github.com/${plan.repo.shorthand}.git`;

/** A shallow fetch of exactly the commit the plan ends on, sparse when it names a subdirectory. */
async function cloneGit(plan: GitPlan, dir: string): Promise<string> {
  if (existsSync(join(dir, '.git')) && !refresh) return plan.subdir ? join(dir, plan.subdir) : dir;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await git(['-C', dir, 'init', '-q']);
  await git(['-C', dir, 'remote', 'add', 'origin', repoUrl(plan)]);
  if (plan.subdir) {
    await git(['-C', dir, 'sparse-checkout', 'set', '--no-cone', `/${plan.subdir}/`]);
  }
  const target = plan.sha ?? plan.ref ?? 'HEAD';
  await git(['-C', dir, 'fetch', '-q', '--depth', '1', '--filter=blob:limit=2m', 'origin', target]);
  await git(['-C', dir, 'checkout', '-q', 'FETCH_HEAD']);
  return plan.subdir ? join(dir, plan.subdir) : dir;
}

async function fetchPlugin(
  marketplace: string,
  root: string,
  entry: { readonly name: string; readonly plan: FetchPlan | undefined; readonly refusal: string },
): Promise<CorpusPlugin> {
  const base = { marketplace, name: entry.name, planKind: entry.plan?.kind ?? 'refused' };
  const { plan } = entry;
  if (!plan) return { ...base, skipped: entry.refusal };
  if (plan.kind === 'local') return { ...base, dir: join(root, plan.fromMarketplaceRoot) };
  if (plan.kind !== 'git') return { ...base, skipped: `${plan.kind} sources are not fetched` };
  try {
    const dir = await cloneGit(plan, join(PLUGINS_DIR, marketplace, entry.name));
    return existsSync(dir) ? { ...base, dir } : { ...base, skipped: 'subdirectory not found' };
  } catch (cause) {
    return { ...base, skipped: `fetch failed: ${String(cause).slice(0, 300)}` };
  }
}

/** The marketplace as Claude Code reads it when added from its GitHub repository. */
async function entriesOf(root: string, name: string) {
  const raw: unknown = await Bun.file(join(root, '.claude-plugin', 'marketplace.json')).json();
  const origin = { kind: 'github', repo: `anthropics/${name}`, path: '.' } as const;
  const { marketplace, issues } = readMarketplace(raw, { platform: 'posix', origin });
  if (!marketplace) throw new Error(`${root}: ${issues.map((i) => i.message).join('; ')}`);
  return marketplace.plugins.map((entry) => {
    const planned = planPluginFetch(entry.source, { platform: 'posix', marketplaceOrigin: origin });
    return {
      name: entry.name,
      plan: planned.plan,
      refusal: planned.issues.map((issue) => issue.message).join('; '),
    };
  });
}

const index: CorpusPlugin[] = [];
for (const { name, repo } of MARKETPLACES) {
  const root = await cloneMarketplace(name, repo);
  const entries = await entriesOf(root, name);
  let done = 0;
  const fetched = await pool(entries, 12, async (entry) => {
    const result = await fetchPlugin(name, root, entry);
    done += 1;
    if (done % 100 === 0) console.log(`${name}: ${done}/${entries.length}`);
    return result;
  });
  index.push(...fetched);
}
await Bun.write(INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`);
const ok = index.filter((plugin) => plugin.dir !== undefined).length;
console.log(`Corpus: ${ok} of ${index.length} plugins fetched (${INDEX_FILE})`);
