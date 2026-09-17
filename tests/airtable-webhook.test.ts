import test from 'node:test';
import assert from 'node:assert/strict';
import {validNotification,BASE} from '../supabase/functions/portal-airtable-events/auth.ts';
const secret=btoa('webhook signing test key only 0000000000');
async function sign(raw:string){const key=await crypto.subtle.importKey('raw',Uint8Array.from(atob(secret),c=>c.charCodeAt(0)),{name:'HMAC',hash:'SHA-256'},false,['sign']);return 'hmac-sha256='+Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw))).toString('hex');}
test('Airtable signatures verify exact raw bytes and reject altered bodies, MACs and wrong base',async()=>{
 const raw=JSON.stringify({base:{id:BASE},webhook:{id:'ach12345678901234'},timestamp:new Date().toISOString()});
 const mac=await sign(raw);
 assert.equal(await validNotification(raw,mac,secret),true);
 assert.equal(await validNotification(raw+' ',mac,secret),false);
 assert.equal(await validNotification(raw,'hmac-sha256='+'0'.repeat(64),secret),false);
 const other=raw.replace(BASE,'appOTHER');assert.equal(await validNotification(other,await sign(other),secret),false);
});
test('malformed, oversized, future and expired notifications fail closed',async()=>{
 for(const raw of ['{','x'.repeat(8200),JSON.stringify({base:{id:BASE},webhook:{id:'ach123'},timestamp:'2099-01-01'}),JSON.stringify({base:{id:BASE},webhook:{id:'ach123'},timestamp:'2000-01-01'})])assert.equal(await validNotification(raw,await sign(raw),secret),false);
});
