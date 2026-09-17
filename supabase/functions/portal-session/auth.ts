/** The identity provider verifies the bearer. No JWT claims or browser email are trusted. */
export class IdentityError extends Error {
  status: number;
  constructor(status: number) { super('identity_unavailable'); this.status = status; }
}
export async function verifyLearningSuiteIdentity(token: string, request: typeof fetch = fetch) {
  if (!/^[^\s]{1,16384}$/.test(token)) throw new IdentityError(401);
  let response: Response;
  try {
    response = await request('https://api-p.learningsuite.io/cm3zyh40q9imy2oiyj08yaj9m/graphql', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({operationName:'QueryMyUser', variables:{}, extensions:{persistedQuery:{version:1,sha256Hash:'1202e49c1d317457276209dbd2995191d71e4701b34c37c72190c979d3a27759'}}}),
    });
  } catch { throw new IdentityError(503); }
  if (response.status === 401 || response.status === 403) throw new IdentityError(401);
  if (!response.ok) throw new IdentityError(503);
  let body;
  try { body = await response.json(); } catch { throw new IdentityError(503); }
  if (body?.errors?.length) {
    throw new IdentityError(body.errors.some((e: {extensions?:{code?:string}}) => e.extensions?.code === 'UNAUTHENTICATED') ? 401 : 503);
  }
  const user = body?.data?.user;
  if (!user || user.enabled !== true || user.emailVerified !== true || typeof user.id !== 'string' || !user.id.trim() || typeof user.email !== 'string') throw new IdentityError(403);
  const email = user.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new IdentityError(403);
  return {id:user.id, email};
}
