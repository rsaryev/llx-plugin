/**
 * Runs `run` for every item, even after one throws, then reports the failure: the one error as it
 * was thrown, several as an `AggregateError`. For a list of listeners or held deliveries, where one
 * that throws must not take the rest with it.
 */
export function runEach<T>(items: Iterable<T>, run: (item: T) => void): void {
  const failures: unknown[] = [];
  for (const item of items) {
    try {
      run(item);
    } catch (error) {
      failures.push(error);
    }
  }
  const [first, ...others] = failures;
  if (others.length > 0) throw new AggregateError(failures, 'several of them threw');
  if (failures.length > 0) throw first;
}
