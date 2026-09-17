import { createClient } from 'npm:@supabase/supabase-js@2';
import { sha256,validNotification } from './auth.ts';
const WORKER='https://automation.schulzemarketing.de/webhook/schulze-portal-realtime-wake';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
Deno.serve(async req=>{
 if(req.method!=='POST') return json({error:'method_not_allowed'},405);
 if(Number(req.headers.get('content-length')||0)>16384) return json({error:'too_large'},413);
 try {
  let keys:Record<string,string>={};try{keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');}catch{}
  const db=createClient(Deno.env.get('SUPABASE_URL')!,keys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await db.rpc(name,args);if(error)throw new Error('database_error');return data;};
  const wake=async()=>{
   const proof=crypto.randomUUID()+crypto.randomUUID();
   if(!await rpc('portal_prepare_realtime_wake',{p_hash:await sha256(proof)}))return;
   // Queue state survives a failed wake; the n8n recovery trigger claims it later.
   try{await fetch(WORKER,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({proof}),redirect:'error',signal:AbortSignal.timeout(8000)});}catch{console.error('portal realtime wake deferred');}
  };
  const path=new URL(req.url).pathname.split('/').pop();
  const raw=await req.text();if(raw.length>16384)return json({error:'too_large'},413);
  const body=JSON.parse(raw);
  if(path==='notify'){
   if(raw.length>8192||typeof body.webhook?.id!=='string')return json({error:'invalid_notification'},400);
   const secret=await rpc('portal_airtable_hook_secret',{p_id:body.webhook.id});
   if(!secret||!await validNotification(raw,req.headers.get('x-airtable-content-mac')||'',secret))return json({error:'unauthorized'},401);
   const fresh=await rpc('portal_enqueue_airtable_event',{p_id:body.webhook.id,p_digest:await sha256(raw)});
   if(fresh)EdgeRuntime.waitUntil(wake());
   return new Response(null,{status:204,headers:{'cache-control':'no-store'}});
  }
  const token=/^Bearer ([^\s]{32,256})$/.exec(req.headers.get('authorization')||'')?.[1];
  if(!token)return json({error:'unauthorized'},401);
  const {data:auth,error:authError}=await db.from('portal_sync_secrets').select('name').eq('name','n8n_portal_sync').eq('active',true).eq('secret_hash',await sha256(token)).maybeSingle();
  if(authError)throw new Error('authorization_unavailable');if(!auth)return json({error:'unauthorized'},401);
  if(path==='maintenance-claim')return json(await rpc('portal_claim_hook_maintenance',{}));
  if(path==='maintenance-error'){
   const status=Number.isInteger(body.status)?body.status:null;
   await db.from('portal_realtime_health').upsert({component:'hook_maintenance',stage:'airtable_registration_failed',http_status:status,updated_at:new Date().toISOString()});
   return json({error:'airtable_registration_failed'},502);
  }
  if(path==='prepare'){
   const {error}=await db.from('portal_realtime_health').upsert({component:'hook_maintenance',stage:'preparing',http_status:null,updated_at:new Date().toISOString()});if(error)throw error;
   if(body.retireId) await rpc('portal_retire_missing_hook',{p_id:body.retireId,p_table:body.tableId});
   return json(body);
  }
  if(path==='catchup'){
   await rpc('portal_finish_hook_maintenance',{p_lease:body.leaseId});EdgeRuntime.waitUntil(wake());return json({ok:true});
  }
  if(path==='register'){
   await rpc('portal_register_airtable_hook',{p_id:body.id,p_table:body.tableId,p_secret:body.macSecretBase64,p_expires:body.expirationTime||null});
   return json({ok:true,webhookId:body.id,tableId:body.tableId});
  }
  if(path==='registry'){
   const {data,error}=await db.from('portal_airtable_hooks').select('webhook_id,table_id,expires_at').eq('active',true);if(error)throw error;
   return json({hooks:data});
  }
  if(path==='renewed'){
   if(!/^ach[A-Za-z0-9]+$/.test(body.id)||!Number.isFinite(Date.parse(body.expirationTime)))return json({error:'invalid_renewal'},400);
   const {error}=await db.from('portal_airtable_hooks').update({expires_at:body.expirationTime}).eq('webhook_id',body.id);if(error)throw error;return json({ok:true});
  }
  if(path==='claim'){
   const proof=typeof body.proof==='string'&&body.proof.length<=100?body.proof:'';
   return json(await rpc('portal_claim_realtime',{p_hash:proof?await sha256(proof):null,p_recovery:body.recovery===true}));
  }
  if(path==='complete'){
   await rpc('portal_complete_realtime',{p_lease:body.leaseId});
   EdgeRuntime.waitUntil(wake());return json({ok:true});
  }
  return json({error:'not_found'},404);
 }catch{console.error('portal realtime request failed');return json({error:'request_failed'},400);}
});
