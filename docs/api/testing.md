# `@rsaryev/llx-plugin/testing`

Fakes of every port, for a host's tests.

One row per export; `scripts/check-docs.ts` (DOC3) keeps this table equal to the entry's exports.

| Name | Kind | What it is |
| --- | --- | --- |
| `catalogAgentFixture` | function | An agent row as `agentCatalog()` lists it, read from `agents/<name>.md` of its source |
| `CatalogAgentFixture` | type | The `fixture` argument of `catalogAgentFixture` |
| `DiskEntry` | type | A file's text, or a symbolic link to another absolute path of the disk |
| `DiskOptions` | type | The `options` argument of `folderScan` |
| `fakeEnvironment` | function | An `Environment` over a fixed record |
| `fakeMcp` | function | An `McpCaller` over fixed servers and tool results, recording every call in `calls` |
| `FakeMcpOptions` | type | The `options` argument of `fakeMcp` |
| `fakeModel` | function | A `ModelRunner` that answers `evaluate` and `runAgent` from one script, in order, and records every call |
| `fixedClock` | function | A `Clock` that stands still until the test calls `advance(ms)`, which moves `now()` and fires every timer that falls due |
| `folderScan` | function | An in-memory disk for the scope folders: the record is read again at each `open`, so a test that adds, edits or deletes a key sees it at the next reload |
| `HttpReply` | type | The `replies` argument of `recordingHttp` |
| `LocationOptions` | type | The `options` argument of `locations` |
| `locations` | function | `Locations` over fixed POSIX-style paths; `dataCreated` lists the plugins whose data was asked for |
| `MemoryEntry` | type | A file's text or bytes, or a symbolic link to another path of the folder (or outside it) |
| `memoryFiles` | function | An in-memory plugin folder: keys are `/`-separated paths relative to the folder, values the file's text or bytes |
| `memoryScratch` | function | `ScratchFiles` that keeps what it is given: `files` maps the returned path to the content |
| `ModelReply` | type | The `replies` argument of `fakeModel` |
| `RecordedModelCall` | type | The agent verifier's tool and safety limits are present only for `runAgent` |
| `recordingHttp` | function | An `HttpClient` that answers from a script, in order (status 200, no headers and an empty body unless given |
| `RunnerReply` | type | What one scripted run answers: a result with defaults (exit 0, no output), or a function of the run |
| `scriptedRunner` | function | A `CommandRunner` that answers from a script, in order, and records every run in `calls` |
| `sessionSkillFixture` | function | A skill row as `skillCatalog()` lists it: on, with no `skillOverrides`, never dormant, answering to its command alone |
| `SessionSkillFixture` | type | The `fixture` argument of `sessionSkillFixture` |
