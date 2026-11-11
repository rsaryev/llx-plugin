/**
 * The `atom`, `read`, `update`, `derive` and `memberOf` of `state-library.ts` as the JavaScript
 * text a host puts behind `import { atom, read, update, derive, memberOf } from 'claude-code'` when
 * it bundles a hooks module or a surface module, so the same helpers run in the host's process and
 * in an isolate that never loads the kit. The text is the helpers' own logic, and
 * `tests/mods/api/state-library-source.test.ts` runs both over the same `$.state` and compares the
 * answers (judgment, spec/judgments.md: the docs name the helpers, not how a bundler hands them to
 * a module).
 */
export const STATE_LIBRARY_SOURCE = `const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
export const TIERS = Object.freeze(['prepend', 'user', 'append', 'builtin', 'core'])
export const INSTRUCTION_FILE_KINDS = Object.freeze(['managed', 'user', 'project', 'local', 'memory'])
const refFrom = (key) =>
  key.id === undefined ? { plugin: key.plugin, key: key.key } : { plugin: key.plugin, key: key.key, id: key.id }
export const atom = (key, initial, options = {}) =>
  Object.freeze({
    ref: refFrom(key),
    initial,
    ...(options.shape === undefined ? {} : { shape: options.shape }),
  })
export const derive = (sources, compute) => Object.freeze({ sources, compute })
export const memberOf = (source, event) => {
  const id = isRecord(event) && typeof event.requestId === 'string' ? event.requestId : undefined
  if (id === undefined) return source
  return 'ref' in source ? Object.freeze({ ...source, ref: { ...source.ref, id } }) : { ...source, id }
}
const versionOf = (entry) => (isRecord(entry) && typeof entry.version === 'number' ? entry.version : 0)
const valueOf = (source, entry) => {
  const held = isRecord(entry) && 'value' in entry
  if (!('ref' in source)) return held ? entry.value : undefined
  if (!held) return source.initial
  if (source.shape === undefined) return entry.value
  const stored = entry.value
  return isRecord(stored) && stored.shape === source.shape ? stored.value : source.initial
}
const memos = new WeakMap()
const sameVersions = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
const readingOf = async ($, source) => {
  if (!('sources' in source)) {
    const entry = await $.state.get('ref' in source ? source.ref : source)
    return { value: valueOf(source, entry), versions: [versionOf(entry)] }
  }
  const readings = await Promise.all(source.sources.map((each) => readingOf($, each)))
  const versions = readings.flatMap((r) => r.versions)
  const memo = memos.get(source)
  if (memo !== undefined && memo.state === $.state && sameVersions(memo.versions, versions)) return memo
  const value = source.compute(...readings.map((r) => r.value))
  memos.set(source, { state: $.state, value, versions })
  return { value, versions }
}
export const read = async ($, source) => (await readingOf($, source)).value
export const update = async ($, source, change) => {
  const ref = 'ref' in source ? source.ref : source
  const shape = 'ref' in source ? source.shape : undefined
  for (;;) {
    const held = await $.state.get(ref)
    const next = change(valueOf(source, held))
    const stored = shape === undefined ? next : { shape, value: next }
    const written = await $.state.set(ref, stored, { ifVersion: versionOf(held) })
    if (!isRecord(written) || written.isSet !== false) return next
  }
}
`;
