/**
 * The credential rule a marketplace `headersHelper` shares with an MCP one lives in
 * `format/credential-env` (one classifier for every command the kit runs without the user's
 * credentials); this file keeps the marketplace module's public names.
 */
export { isCredentialVariable, withoutCredentials } from '../format/credential-env.ts';
