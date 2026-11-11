# `@rsaryev/llx-plugin/sdk`

A session's plugin hooks as the `hooks` option of a Claude Agent SDK query.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `sdkHooks` | function | The `hooks` option of an SDK query that runs the session's plugin hooks |
| `SdkHooksOptions` | type | The plugins' hooks of a session as the `hooks` option of a Claude Agent SDK query |
| `toSdkHookOutput` | function | The outcome of the plugins' hooks of one event as the answer of one SDK hook callback |
