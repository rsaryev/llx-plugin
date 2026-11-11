/**
 * How a port reports an effect that did not happen (a connection refused, a timeout, a model that
 * failed): a value in the result union, never a thrown exception. Callers test `'failure' in result`.
 */
export interface PortFailure<Kind extends string = string> {
  readonly failure: Kind;
  readonly message: string;
}
