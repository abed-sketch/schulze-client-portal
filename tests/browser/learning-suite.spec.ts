import { readFile } from 'node:fs/promises';
import { test,expect } from '@playwright/test';
const endpoint='https://zwtmlrzwqnluosrdbjfv.supabase.co/functions/v1/portal-session';
const parent='https://schulze.learningsuite.io';
const appOrigin='https://schulze-client-portal-production.up.railway.app';
async function proxyApp(page:import('@playwright/test').Page) {
 await page.route(appOrigin+'/**', async route => {
  const path=new URL(route.request().url()).pathname;
  if(path!=='/' && !/^\/assets\/[a-zA-Z0-9_.-]+$/.test(path)){ await route.fulfill({status:404});return; }
  await route.fulfill({body:await readFile('dist'+(path==='/'?'/index.html':path)),contentType:path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'text/html'});
 });
}
const response=(key:string,name:string)=>({mode:'customer',sessionKey:key.repeat(64),customer:{name},clients:[{id:'recAAAAAAAAAAAAAA',clientId:'KD001',name}],leads:[{id:'recBBBBBBBBBBBBBB',name,contactName:null,status:'New',website:null,notes:null,email:null,phone:null,position:null,source:null,clientRecordId:'recAAAAAAAAAAAAAA',clientName:name}]});
async function embed(page:import('@playwright/test').Page){
 await proxyApp(page);
 await page.routeWebSocket('wss://*.supabase.co/**',()=>{});
 const bridge=await readFile('integrations/learningsuite-parent-bridge.js','utf8');
 await page.route(parent+'/**',route=>route.fulfill({contentType:'text/html',body:`<script>window.identity='token-A';window.authManager={getAccessToken:()=>{const token=window.identity;if(window.holdToken){window.holdToken=false;return new Promise(r=>window.releaseToken=()=>r(token))}return token}};</script><script>${bridge}</script><iframe style="width:1200px;height:900px" src="https://schulze-client-portal-production.up.railway.app/"></iframe>`}));
 await page.goto(parent+'/portal-test');
 return page.frameLocator('iframe');
}
test('embedded sign-in, fresh identity on reload, filter preservation and account change',async({page})=>{
 let calls=0;
 await page.route(endpoint,route=>{calls++; const token=route.request().headers().authorization;return route.fulfill({json:token==='Bearer token-A'?response('a','Alpha'):response('b','Beta')});});
 const app=await embed(page);
 await expect(app.locator('body')).toContainText('SCHULZE');
 await expect(app.getByRole('cell',{name:'Alpha —',exact:true})).toBeVisible();
 await app.getByRole('searchbox',{name:'Interessenten suchen'}).fill('Alpha');
 // Cross-origin focus through the frame itself.
 await page.frames()[1].evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect.poll(()=>calls).toBeGreaterThan(1);
 await expect(app.getByRole('searchbox',{name:'Interessenten suchen'})).toHaveValue('Alpha');
 await page.evaluate(()=>{(window as unknown as {identity:string}).identity='token-B'});
 await page.frames()[1].evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(app.getByRole('cell',{name:'Beta —',exact:true})).toBeVisible();
 await expect(app.getByRole('searchbox',{name:'Interessenten suchen'})).toHaveValue('');
 await page.frames()[1].evaluate(()=>location.reload());
 await expect(app.getByRole('cell',{name:'Beta —',exact:true})).toBeVisible();
 expect(page.url()).not.toContain('token');
});
test('late old-account responses cannot restore old data after identity invalidation',async({page})=>{
 let release!:()=>void; const gate=new Promise<void>(r=>release=r); let delayed=false;
 await page.route(endpoint,async route=>{
  const old=route.request().headers().authorization==='Bearer token-A';
  if(old){delayed=true;await gate;}
  await route.fulfill({json:old?response('a','Alpha'):response('b','Beta')}).catch(()=>{});
 });
 const app=await embed(page);
 await expect.poll(()=>delayed).toBe(true);
 await page.evaluate(()=>{(window as unknown as {identity:string}).identity='token-B'});
 await page.frames()[1].evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(app.getByRole('cell',{name:'Beta —',exact:true})).toBeVisible();
 release();
 await expect(app.getByRole('cell',{name:'Alpha —',exact:true})).toHaveCount(0);
});
test('untrusted messages cannot supply a parent token',async({page})=>{
 let calls=0; await page.route(endpoint,r=>{calls++;return r.fulfill({json:response('a','Forbidden')})});
 await proxyApp(page);
 await page.routeWebSocket('wss://*.supabase.co/**',()=>{});
 await page.route(parent+'/**',r=>r.fulfill({contentType:'text/html',body:'<iframe style="width:1200px;height:900px" src="https://schulze-client-portal-production.up.railway.app/"></iframe>'}));
 await page.goto(parent+'/portal-test');
 const app=page.frameLocator('iframe');
 await page.frames()[1].evaluate(()=>window.postMessage({type:'LS_TOKEN',version:1,token:'forged',requestId:'forged-request-123456'},'*'));
 await expect(app.getByRole('heading',{name:'Bitte in LearningSuite öffnen'})).toBeVisible({timeout:15000});
 expect(calls).toBe(0);
});

test('actual parent bridge never reuses an old pending token for a new request',async({page})=>{
 await page.route(endpoint,route=>route.fulfill({json:route.request().headers().authorization==='Bearer token-A'?response('a','Alpha'):response('b','Beta')}));
 const app=await embed(page);
 await expect(app.getByRole('cell',{name:'Alpha —',exact:true})).toBeVisible();
 await page.evaluate(()=>{(window as any).holdToken=true});
 await page.frames()[1].evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect.poll(()=>page.evaluate(()=>typeof (window as any).releaseToken)).toBe('function');
 await page.evaluate(()=>{(window as any).identity='token-B'});
 await page.frames()[1].evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(app.getByRole('cell',{name:'Beta —',exact:true})).toBeVisible();
 await page.evaluate(()=>{(window as any).releaseToken()});
 await expect(app.getByRole('cell',{name:'Alpha —',exact:true})).toHaveCount(0);
});

test('portal bridge waits for LearningSuite authManager initialization',async({page})=>{
 await proxyApp(page);
 await page.routeWebSocket('wss://*.supabase.co/**',()=>{});
 await page.route(endpoint,route=>route.fulfill({json:response('a','Alpha')}));
 const html=await readFile('integrations/learningsuite-client-portal.html','utf8');
 await page.route(parent+'/**',route=>route.fulfill({contentType:'text/html',body:`<script>setTimeout(()=>{window.authManager={getAccessToken:()=> 'token-A'}},300)</script>${html}`}));
 await page.goto(parent+'/portal-test');
 await expect(page.frameLocator('iframe').getByRole('cell',{name:'Alpha —',exact:true})).toBeVisible();
});


test('customer can add an interaction and change the deal stage for an existing lead only', async ({page}) => {
  let updateBody:any = null;
  await page.route(endpoint, route => route.fulfill({json:response('a','Alpha')}));
  await page.route('https://portal-api.test/webhook/customer-portal/lead-update', async route => {
    updateBody = route.request().postDataJSON();
    expect(route.request().headers().authorization).toBe('Bearer token-A');
    await route.fulfill({json:{
      ok:true,
      leadId:'recBBBBBBBBBBBBBB',
      interaction:{requested:true,created:true,reused:false},
      dealPhase:{requested:'New',updated:false,previous:'New'},
    }});
  });
  const app=await embed(page);
  await expect(app.getByRole('button',{name:'Aktualisieren'})).toBeVisible();
  await app.getByRole('button',{name:'Aktualisieren'}).click();
  await expect(app.getByRole('dialog')).toBeVisible();
  await app.getByLabel('Neue Interaktion').fill('Kunde bestätigt den nächsten Schritt.');
  await app.getByRole('button',{name:'Speichern',exact:true}).click();
  await expect(app.getByText('Änderung gespeichert. Die Übersicht aktualisiert sich automatisch.')).toBeVisible();
  expect(updateBody).toMatchObject({
    leadId:'recBBBBBBBBBBBBBB',
    interactionText:'Kunde bestätigt den nächsten Schritt.',
    dealPhase:'New',
  });
  expect(typeof updateBody.requestId).toBe('string');
  expect(updateBody.requestId.length).toBeGreaterThanOrEqual(8);
});

test('legacy opaque-link portal remains read-only', async ({page}) => {
  const legacy={
    mode:'customer',
    customer:{name:'Alpha'},
    clients:[],
    leads:[{id:'lead-1',name:'Legacy Lead',contactName:null,status:'New',website:null,notes:null,email:null,phone:null,position:null,source:null,clientRecordId:null,clientName:null}],
  };
  await page.route('https://portal-api.test/**', route => route.fulfill({json:legacy}));
  await page.goto('http://127.0.0.1:4173/?token=' + 'a'.repeat(43));
  await expect(page.getByRole('heading',{name:'Alle Interessenten'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Aktualisieren'})).toHaveCount(0);
});
