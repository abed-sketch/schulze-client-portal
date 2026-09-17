/** Shape validation only; authorization always happens in n8n. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export function readToken(url: URL): string | null {
  const values = url.searchParams.getAll("token");
  if (
    [...url.searchParams.keys()].some((k) => k !== "token") ||
    values.length !== 1
  )
    return null;
  return TOKEN_PATTERN.test(values[0]) ? values[0] : null;
}
export function consumeToken(
  url: URL,
  replace: (path: string) => void,
): string | null {
  const token = readToken(url);
  replace(url.pathname);
  return token;
}
