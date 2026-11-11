/**
 * Environment variables as plain values (docs/API.md, "Ports"). The kit reads none itself
 * (L3): `${VAR}` and `${VAR:-default}` in configs, `allowedEnvVars` of http hooks and the
 * environment a hook inherits all come through here. Read-only: a mod that sets variables has its
 * own port.
 */
export interface Environment {
  get(name: string): string | undefined;
  /** Every variable, as a copy. */
  snapshot(): Readonly<Record<string, string>>;
}
