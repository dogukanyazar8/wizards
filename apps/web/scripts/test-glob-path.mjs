/**
 * `node --test` treats each positional argument as a glob, so an App Router
 * path like `src/app/api/v1/mobile/servers/[serverId]/route-logic.test.ts`
 * reads `[serverId]` as a character class and matches nothing — those files
 * were collected by the runner and then silently never executed.
 *
 * POSIX globs escape a literal bracket by wrapping it in a class of its own,
 * which is what this produces: `[code]` -> `[[]code[]]`.
 */
export function escapeTestGlobPath(path) {
  return path.replace(/[[\]]/g, (character) => (character === "[" ? "[[]" : "[]]"));
}
