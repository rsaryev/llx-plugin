/** The message a promise rejects with, or `undefined` when it resolves: asserts a rejection awaited. */
export async function rejection(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (thrown) {
    return thrown instanceof Error ? thrown.message : String(thrown);
  }
}
