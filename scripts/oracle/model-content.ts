/**
 * What the model reads when a plugin's skill or command is invoked, Claude Code's against the kit's.
 * Each case of tests/fixtures/model-content/<case>/ is a tiny plugin (`plugin/`) and a `case.json`:
 * the `/plugin:skill args` prompt, the skill and its arguments for the kit, and the settings both run
 * under. `bun run oracle:model-content` runs the model-request oracle (`model-request.ts`) per case
 * and writes the user message blocks Claude Code sent for the skill, normalized, to `expected.json`; `--check`
 * fails instead when they changed. tests/skills/model-content-oracle.test.ts compares the kit's
 * `expandSkill` with the recorded block without running Claude Code.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import {
  createPluginHost,
  createPolicyView,
  loadPlugin,
  readSettingsLayer,
} from '../../src/index.ts';
import { pluginDataId } from '../../src/entry/loading.ts';
import {
  fakeEnvironment,
  locations,
  recordingHttp,
  scriptedRunner,
} from '../../src/testing/index.ts';
import { diskFiles } from '../corpus/disk-files.ts';
import { ROOT } from '../docs/location.ts';
import { claudeVersion } from './claude-bin.ts';
import { inlineDataDir, normalize, runModelOracle, userTexts } from './model-request.ts';

export const MODEL_CONTENT_DIR = join(ROOT, 'tests', 'fixtures', 'model-content');

const caseSchema = z.object({
  prompt: z.string(),
  skill: z.string(),
  arguments: z.string(),
  settings: z.unknown().optional(),
});
export type ModelContentCase = z.infer<typeof caseSchema>;

export const expectedSchema = z.object({
  claudeCodeVersion: z.string(),
  /** The user text blocks of the first request, normalized. */
  blocks: z.array(z.string()),
});
export type ModelContentExpected = z.infer<typeof expectedSchema>;

export async function caseNames(): Promise<string[]> {
  const entries = await readdir(MODEL_CONTENT_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

export async function readCase(name: string): Promise<ModelContentCase> {
  return caseSchema.parse(
    JSON.parse(await readFile(join(MODEL_CONTENT_DIR, name, 'case.json'), 'utf8')),
  );
}

export async function readExpected(name: string): Promise<ModelContentExpected> {
  const path = join(MODEL_CONTENT_DIR, name, 'expected.json');
  return expectedSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

const KIT = {
  home: '/home/user',
  project: '/work/app',
  plugins: '/plugins',
  data: '/data',
} as const;
const SESSION_ID = 'oracle-session';

/** What the kit's session gives the model for the case's invocation, normalized like the oracle's. */
export async function kitExpansion(
  name: string,
): Promise<{ ok: boolean; text: string; issues: string[] }> {
  const dir = join(MODEL_CONTENT_DIR, name, 'plugin');
  const input = await readCase(name);
  const { plugin } = await loadPlugin({ files: diskFiles(dir), fallbackName: basename(dir) });
  if (plugin === undefined) return { ok: false, text: '', issues: ['the plugin did not load'] };
  const { layer } = readSettingsLayer('user', input.settings ?? {});
  const id = `${plugin.name}@inline`;
  const host = createPluginHost({
    plugins: [{ id, plugin }],
    ports: {
      commands: scriptedRunner(),
      http: recordingHttp(),
      locations: locations(KIT),
      environment: fakeEnvironment(),
    },
    settings: createPolicyView([layer]),
  });
  const session = host.openSession({
    sessionId: SESSION_ID,
    cwd: KIT.project,
    permissionMode: 'default',
    transcriptPath: '/work/oracle.jsonl',
  });
  const expansion = await session.expandSkill(input.skill, {
    arguments: input.arguments,
    signal: AbortSignal.timeout(30_000),
  });
  const issues = expansion.issues.map((issue) => issue.message);
  if (!expansion.ok) return { ok: false, text: '', issues };
  const text = normalize(expansion.text, {
    pluginRoot: `${KIT.plugins}/${id}`,
    pluginData: `${KIT.data}/${pluginDataId(id)}`,
    cwd: KIT.project,
  }).replaceAll(SESSION_ID, '<SESSION_ID>');
  return { ok: true, text, issues };
}

async function oracleBlocks(name: string): Promise<string[]> {
  const input = await readCase(name);
  const run = await runModelOracle({
    plugin: join(MODEL_CONTENT_DIR, name, 'plugin'),
    prompt: input.prompt,
    settings: input.settings,
  });
  const first = run.requests[0];
  if (first === undefined) throw new Error(`${name}: Claude Code sent no request`);
  const pluginName = input.skill.split(':')[0] ?? '';
  // The harness's own reminders are not the skill's text and name the model of whoever recorded.
  const skillTexts = userTexts(first).filter((text) => !text.startsWith('<system-reminder>'));
  return skillTexts.map((text) =>
    normalize(text, {
      pluginRoot: run.paths.pluginRoot,
      pluginData: inlineDataDir(run.paths.config, pluginName),
      cwd: run.paths.cwd,
    }),
  );
}

async function main(): Promise<void> {
  const version = await claudeVersion();
  if (version === undefined) throw new Error('claude is not installed');
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const name of await caseNames()) {
    const fresh: ModelContentExpected = {
      claudeCodeVersion: version,
      blocks: await oracleBlocks(name),
    };
    const previous = await readExpected(name).catch(() => undefined);
    const same = JSON.stringify(previous?.blocks) === JSON.stringify(fresh.blocks);
    console.log(`${same ? 'same ' : 'NEW  '} ${name}`);
    if (same) continue;
    stale += 1;
    if (!check) {
      await writeFile(
        join(MODEL_CONTENT_DIR, name, 'expected.json'),
        `${JSON.stringify(fresh, null, 2)}\n`,
      );
    }
  }
  if (check && stale > 0) {
    console.error(`${stale} case(s) differ from Claude Code: run \`bun run oracle:model-content\``);
    process.exit(1);
  }
}

if (import.meta.main) await main();
