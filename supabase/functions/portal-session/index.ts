import { createClient } from "npm:@supabase/supabase-js@2";
import { IdentityError, verifyLearningSuiteIdentity } from './auth.ts';
const APP_ORIGIN = 'https://schulze-client-portal-production.up.railway.app';
const headers = {
  'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff', 'Access-Control-Allow-Origin':APP_ORIGIN,
  'Access-Control-Allow-Methods':'GET, OPTIONS', 'Access-Control-Allow-Headers':'authorization, apikey',
  'Vary':'Origin',
};
const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers});
Deno.serve(async (req:Request) => {
  if (req.headers.has('origin') && req.headers.get('origin') !== APP_ORIGIN) return json({error:'forbidden'},403);
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if (req.method !== 'GET') return json({error:'method_not_allowed'},405);
  if (new URL(req.url).search) return json({error:'invalid_request'},400);
  const match = /^Bearer ([^\s]{1,16384})$/.exec(req.headers.get('authorization') || '');
  if (!match) return json({error:'unauthorized'},401);
  try {
    const identity = await verifyLearningSuiteIdentity(match[1]);
    let keys:Record<string,string> = {};
    try { keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); } catch { /* legacy service key fallback */ }
    const url = Deno.env.get('SUPABASE_URL') || '';
    const key = keys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!url || !key) throw new Error('configuration');
    const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    // Service-only RPC evaluates authorization and data in one database snapshot.
    const {data,error} = await db.rpc('portal_read_for_identity',{p_email:identity.email});
    if (error) throw error;
    if (!data) return json({error:'not_provisioned'},403);
    if (data.error === 'stale_snapshot') return json({error:'temporarily_unavailable'},503);
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity.id));
    const sessionKey = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    return json({...data,sessionKey});
  } catch (error) {
    const status = error instanceof IdentityError ? error.status : 503;
    // Never log request headers, identity, tokens, or customer payloads.
    return json({error:status === 401 ? 'unauthorized' : status === 403 ? 'not_provisioned' : 'temporarily_unavailable'},status);
  }
});
