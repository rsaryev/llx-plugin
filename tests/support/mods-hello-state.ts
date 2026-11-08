import { memoryFiles } from './ports.ts';

/**
 * hello-tabs of interface.md after "Change `hello-tabs` to use `$.state`": the text of its hooks
 * module, which the kit scans (a test's `register` function runs the same hooks), its type
 * declaration file and the manifest that points at it.
 */
export const helloStateModule = (withHook: boolean): string => `
import { atom, read, update } from 'claude-code'
const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0)
${
  withHook
    ? `async function loadCount($) {
  const saved = Number((await $.store.get('count')) ?? 0)
  await update($, count, () => saved)
}`
    : ''
}
export function register(on) {
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const n = await read($, count)
    return next(e)
  })
  ${withHook ? `on('session.start', async ($, e, next) => { await loadCount($); return next(e) })` : ''}
  ${
    withHook
      ? `on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => { await loadCount($); return next(e) })`
      : ''
  }
}`;

/** hello-tabs/types/index.d.ts (interface.md, "Declare the values"). */
export const HELLO_TYPES = `declare module 'claude-code' {
  interface PluginState {
    'hello-tabs': {
      tab: 'one' | 'two'
      count: number
    }
  }
}`;

/** hello-tabs/.claude-plugin/plugin.json (interface.md, "Point the manifest at the declaration"). */
export const HELLO_MANIFEST = JSON.stringify({
  name: 'hello-tabs',
  version: '0.1.0',
  description: 'Opens a pane with two tabs and a counter',
  author: { name: 'Your Name' },
  types: './types/index.d.ts',
});

/** The folder of hello-tabs with the `$.state` version of its module. */
export const helloStateFolder = (withHook: boolean) =>
  memoryFiles({
    '.claude-plugin/plugin.json': HELLO_MANIFEST,
    'types/index.d.ts': HELLO_TYPES,
    'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
    'hooks/register.js': helloStateModule(withHook),
  });
