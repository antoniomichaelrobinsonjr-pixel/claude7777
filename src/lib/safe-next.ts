/**
 * Where to send someone after signing in. Only a path on this same site is allowed.
 * Rejected: "//host" and "/\host" (browsers treat both as another site), full URLs, and anything containing control
 * characters (browsers strip tabs and newlines from URLs, so "/<tab>/host" would become "//host").
 */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  return typeof value === "string" && /^\/(?![\/\\])[^\u0000-\u001f\u007f]*$/.test(value) ? value : fallback;
}
