/** The test kit of plugins/mods/test.md, and the fakes a host tests its mods integration with. */
export {
  fakeModInterface,
  fakePorts,
  idleClock,
  noImplementation,
  type FakePorts,
} from './fake-ports.ts';
export {
  inlineRuntime,
  type HookFunction,
  type OnFunction,
  type RegisterFunction,
} from './inline-runtime.ts';
export { ExpectationError, expect } from './expect.ts';
export { createMockClock, type MockClock } from './mock-clock.ts';
export { mock, type MockSession, type On } from './mock.ts';
export {
  createTestKit,
  type TestBody,
  type TestCase,
  type TestKit,
  type TestOptions,
} from './kit.ts';
export { inlineTests, type ModTestRuntime } from './ports.ts';
export { runModTests, type RunOptions, type TestRun } from './runner.ts';
export { moduleText, type InlineMod } from './inline-files.ts';
