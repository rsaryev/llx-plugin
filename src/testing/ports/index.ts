/**
 * Fakes of every port (docs/API.md, "Testing kit"): what a test passes in place of a host. The
 * scripted ones answer in order, record every call and throw when the script is spent, so a test
 * never passes by accident.
 */
export { fixedClock } from './clock.ts';
export { fakeEnvironment, memoryScratch } from './environment.ts';
export { memoryFiles, type MemoryEntry } from './files.ts';
export { recordingHttp, type HttpReply } from './http.ts';
export { locations, type LocationOptions } from './locations.ts';
export { fakeMcp, type FakeMcpOptions } from './mcp.ts';
export { fakeModel, type ModelCall, type ModelReply } from './model.ts';
export { scriptedRunner, type RunnerReply } from './runner.ts';
