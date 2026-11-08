/** Fakes of every port (docs/TESTING.md, "Ports"): what a test passes in place of a host. */
export { fixedClock } from './clock.ts';
export { fakeEnvironment, memoryScratch } from './environment.ts';
export { memoryFiles } from './files.ts';
export { recordingHttp } from './http.ts';
export { locations } from './locations.ts';
export { fakeMcp } from './mcp.ts';
export { fakeModel } from './model.ts';
export { scriptedRunner } from './runner.ts';
