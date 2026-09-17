export const BASE = 'appAutw0Fvsuk2pfJ';
export async function sha256(value:string):Promise<string> {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function validNotification(raw:string,mac:string,secret:string,now=Date.now()):Promise<boolean> {
 if(raw.length>8192||!/^hmac-sha256=[a-f0-9]{64}$/.test(mac)) return false;
 try {
  const body=JSON.parse(raw);
  if(body.base?.id!==BASE||!/^ach[A-Za-z0-9]+$/.test(body.webhook?.id||'')||typeof body.timestamp!=='string') return false;
  const time=Date.parse(body.timestamp);
  if(!Number.isFinite(time)||time>now+60000||time<now-24*60*60*1000) return false;
  const key=await crypto.subtle.importKey('raw',Uint8Array.from(atob(secret),c=>c.charCodeAt(0)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signature=Uint8Array.from(mac.slice(12).match(/../g)!,h=>parseInt(h,16));
  return await crypto.subtle.verify('HMAC',key,signature,new TextEncoder().encode(raw));
 } catch { return false; }
}
