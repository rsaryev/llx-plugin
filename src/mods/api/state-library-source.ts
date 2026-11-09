/**
 * The `atom`, `read` and `update` of `state-library.ts` as the JavaScript text a host puts behind
 * `import { atom, read, update } from 'claude-code'` when it bundles a hooks module or a surface
 * module, so the same helpers run in the host's process and in an isolate that never loads the
 * kit. The text is the helpers' own source, and `tests/mods/api/state-library-source.test.ts` runs
 * both over the same `$.state` and compares the answers (judgment, spec/judgments.md: the docs
 * name the helpers, not how a bundler hands them to a module).
 */
export const STATE_LIBRARY_SOURCE = `export const atom = (key, initial) =>
  Object.freeze({ plugin: key.plugin, key: key.key, initial })
export const read = async ($, value) => {
  const stored = await $.state.get({ plugin: value.plugin, key: value.key })
  return stored === undefined ? value.initial : stored
}
export const update = async ($, value, change) => {
  const next = change(await read($, value))
  await $.state.set({ plugin: value.plugin, key: value.key }, next)
}
`;
