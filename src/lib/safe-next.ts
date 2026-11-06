/**
 * Post-login redirects stay on this site. Browsers treat "/\\evil.com" and "//evil.com" as
 * other hosts, so both are refused, along with anything carrying control characters.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) return "/";
  return next;
}
