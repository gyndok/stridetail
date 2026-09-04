/**
 * One error-to-text rule for every screen (round 5b: a Supabase Postgrest
 * error is a plain object with .message, and String(it) renders
 * "[object Object]" — Alexandria's TestFlight report). Errors, message-bearing
 * objects, and primitives all come out readable.
 */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}
