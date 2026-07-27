/**
 * Escape a user-typed search term for safe embedding inside a PostgREST `.or()`
 * filter string. The `.or()` grammar uses `,` as filter separator and `()` for
 * grouping, so those must be stripped from raw user input. `%` and `_` are
 * legitimate ilike wildcards and are left as-is (users typing them just get
 * broader matches, not a filter break-out). Also strip `*` (PostgREST wildcard),
 * null bytes, and CR/LF for defence-in-depth.
 */
export function sanitizeOrTerm(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[,()*\x00\r\n]/g, "").trim();
}
