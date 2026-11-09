/**
 * `bun src/cli.ts --plugin <dir> [--plugin <dir>…] [--cwd <dir>] [--permission-mode <mode>] "prompt"`:
 * one turn of the agent
 * with the given plugins, printing every hook, tool call and skill as it happens.
 */
import { createPluginAgent } from './agent.ts';
import { anthropicKey } from './key.ts';

const args = process.argv.slice(2);
const plugins: string[] = [];
let cwd = process.cwd();
let permissionMode: string | undefined;
const words: string[] = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i] ?? '';
  if (arg === '--plugin') plugins.push(args[++i] ?? '');
  else if (arg === '--cwd') cwd = args[++i] ?? cwd;
  else if (arg === '--permission-mode') permissionMode = args[++i];
  else words.push(arg);
}

const agent = await createPluginAgent({
  plugins,
  cwd,
  apiKey: await anthropicKey(),
  echo: true,
  ...(permissionMode === undefined ? {} : { permissionMode }),
});
const answer = await agent.send(words.join(' ') || 'Say hello.');
await agent.close();
console.log(`\n${answer}`);
