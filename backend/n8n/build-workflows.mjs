import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { validateRequest } from './logic.ts';

const origin=process.env.PORTAL_ORIGIN||'https://portal-not-configured.invalid';
if(new URL(origin).origin!==origin||!origin.startsWith('https://')) throw new Error('Exact HTTPS portal origin required');
const logic=stripTypeScriptTypes(readFileSync(new URL('logic.ts',import.meta.url),'utf8')).replaceAll('export function','function');
const registry='guf9ynWoJBgyN0dF';
const base='appAutw0Fvsuk2pfJ';
const tables={clients:'tblfPwZLXgjYuFMsc',targets:'tbln087XtgwIP7HPG',leads:'tblYeDa6ZbNL5YGTb',people:'tblf2AsiyZTb306JQ'};
const prelude="import {workflow,node,trigger,ifElse,expr,newCredential,sticky} from '@n8n/workflow-sdk';\n";
const quote=JSON.stringify;
const ex=s=>({expression:s});
const serialize=o=>JSON.stringify(o).replace(/\{"expression":("(?:[^"\\]|\\.)*")\}/g,(_,s)=>'expr('+s+')');
const nodes=[];
function add(id,type,version,name,parameters,extra={},factory='node'){
  nodes.push(`const ${id}=${factory}({type:${quote(type)},version:${version},config:${serialize({name,parameters,...extra})},output:${quote(name.startsWith('Build ') ? [{formula:'FALSE()'}] : [{}])}});`);return id;
}
const fallible={onError:'continueErrorOutput'};
function code(id,name,body){return add(id,'n8n-nodes-base.code',2,name,{mode:'runOnceForAllItems',jsCode:logic+'\n'+body},fallible);}
function condition(id,name,source){nodes.push(`const ${id}=ifElse({version:2.3,config:{name:${quote(name)},parameters:{conditions:{options:{caseSensitive:true,typeValidation:'strict'},combinator:'and',conditions:[{leftValue:expr(${quote("{{ $('"+source+"').first().json.valid }}")}),rightValue:true,operator:{type:'boolean',operation:'equals'}}]}}},output:[{}]});`);}
function airtable(id,name,table,fields,formula){
  add(id,'n8n-nodes-base.airtable',2.2,name,{authentication:'airtableTokenApi',resource:'record',operation:'search',base:{__rl:true,mode:'id',value:base},table:{__rl:true,mode:'id',value:table},filterByFormula:ex(formula),returnAll:true,options:{fields}}, {...fallible,alwaysOutputData:true,retryOnFail:true,maxTries:2,waitBetweenTries:1000});
  nodes[nodes.length-1]=nodes[nodes.length-1].replace('config:{','config:{credentials:{airtableTokenApi:newCredential("Schulze x Apex Airtable","oun3u0zdIMOShiCK")},');
}
const headers=[{name:'Cache-Control',value:'no-store'},{name:'Referrer-Policy',value:'no-referrer'},{name:'X-Content-Type-Options',value:'nosniff'},{name:'Access-Control-Allow-Origin',value:origin},{name:'Vary',value:'Origin'}];
function respond(id,name,status,body){add(id,'n8n-nodes-base.respondToWebhook',1.5,name,{respondWith:'json',responseBody:body,options:{responseCode:status,responseHeaders:{entries:headers}}},{executeOnce:true});}
add('start','n8n-nodes-base.webhook',2.1,'Portal bootstrap',{httpMethod:'GET',path:'customer-portal/bootstrap',authentication:'none',responseMode:'responseNode',options:{allowedOrigins:origin}}, {},'trigger');
add('request','n8n-nodes-base.set',3.5,'Validate portal request',{mode:'raw',jsonOutput:ex('{{ ('+validateRequest.toString()+")($('Portal bootstrap').first().json,"+quote(origin)+') }}'),options:{}},fallible);
condition('validRequest','Request accepted','Validate portal request');
add('hash','n8n-nodes-base.crypto',2,'Hash access token',{action:'hash',type:'SHA256',binaryData:false,value:ex("{{ $('Validate portal request').first().json.token }}"),dataPropertyName:'tokenHash',encoding:'hex'},fallible);
add('grants','n8n-nodes-base.dataTable',1.1,'Find access grant',{resource:'row',operation:'get',dataTableId:{__rl:true,mode:'id',value:registry},matchType:'allConditions',filters:{conditions:[{keyName:'tokenHash',condition:'eq',keyValue:ex("{{ $('Hash access token').first().json.tokenHash }}")}]},returnAll:false,limit:2},{...fallible,alwaysOutputData:true});
code('grant','Authorize access grant',"return [{json:resolveGrant($input.all().map(i=>i.json),$('Hash access token').first().json.tokenHash)}];");
condition('validGrant','Grant accepted','Authorize access grant');
airtable('client','Read authorized client',tables.clients,['Client Name','Target Companies'],"{{ \"RECORD_ID()='\" + $('Authorize access grant').first().json.clientRecordId + \"'\" }}");
code('scopeClient','Check client record',"return [{json:clientScope($input.all().map(i=>i.json),$('Authorize access grant').first().json.clientRecordId)}];");
code('targetQueries','Build target queries',"return batches($('Check client record').first().json.targetIds).map(json=>({json}));");
airtable('targets','Read scoped target companies',tables.targets,['Client','Leads','Website'],"{{ $('Build target queries').item.json.formula }}");
code('scopeTargets','Check target ownership',"return [{json:targetScope($input.all().map(i=>i.json),$('Check client record').first().json)}];");
code('leadQueries','Build lead queries',"return batches($('Check target ownership').first().json.leadIds).map(json=>({json}));");
airtable('leads','Read scoped leads',tables.leads,['Lead Name','Target Company','Linked Person','Lead Status','Notes','Source'],"{{ $('Build lead queries').item.json.formula }}");
code('scopeLeads','Check lead ownership',"return [{json:leadScope($input.all().map(i=>i.json),$('Check target ownership').first().json)}];");
code('personQueries','Build contact queries',"return batches($('Check lead ownership').first().json.personIds).map(json=>({json}));");
airtable('people','Read scoped contacts',tables.people,['Full Name','Email','Phone','Role/Title'],"{{ $('Build contact queries').item.json.formula }}");
code('normalize','Normalize portal response',"return [{json:normalize($input.all().map(i=>i.json),$('Check lead ownership').first().json)}];");
respond('ok','Return customer portal',200,ex("{{ $('Normalize portal response').first().json }}"));
respond('unauthorized','Reject access',401,{error:'unauthorized',message:'Dieser Link ist ungültig oder abgelaufen.'});
respond('unavailable','Return service error',503,{error:'service_unavailable',message:'Die Daten konnten nicht geladen werden.'});
const fallibleIds=['request','hash','grants','grant','client','scopeClient','targetQueries','targets','scopeTargets','leadQueries','leads','scopeLeads','personQueries','people','normalize'];
const api=prelude+nodes.join('\n')+`\nexport default workflow('schulze-portal-api','Schulze Portal · Read customer leads')
.add(start).to(request).to(validRequest.onTrue(hash.to(grants).to(grant).to(validGrant.onTrue(client.to(scopeClient).to(targetQueries).to(targets).to(scopeTargets).to(leadQueries).to(leads).to(scopeLeads).to(personQueries).to(people).to(normalize).to(ok)).onFalse(unauthorized))).onFalse(unauthorized))
${fallibleIds.map(id=>`.add(${id}.onError(unavailable))`).join('\n')}
.add(sticky('### Read-only customer portal\\nBearer token → hashed grant → canonical V2 client → owned targets → owned leads. Airtable nodes only search.\\nConfigure the exact portal origin before publishing. No public Airtable share URL is used.',[],{color:2}))
;`;
writeFileSync(new URL('bootstrap.sdk.js',import.meta.url),api);
nodes.length=0;
add('start','n8n-nodes-base.executeWorkflowTrigger',1.2,'Issue customer portal access',{inputSource:'workflowInputs',workflowInputs:{values:[{name:'clientRecordId',type:'string'},{name:'expiresAt',type:'string'}]}},{},'trigger');
add('input','n8n-nodes-base.set',3.5,'Validate issuance input',{mode:'raw',jsonOutput:ex("{{ (() => { const x=$('Issue customer portal access').first().json; const exp=Date.parse(x.expiresAt); if(!/^rec[A-Za-z0-9]{14}$/.test(x.clientRecordId)||!Number.isFinite(exp)||exp<=Date.now()||exp>Date.now()+366*86400000) throw new Error('invalid_portal_grant_input'); return {clientRecordId:x.clientRecordId,expiresAt:new Date(exp).toISOString()}; })() }}"),options:{}});
airtable('client','Read issuance client',tables.clients,['Client Name'],"{{ \"RECORD_ID()='\" + $('Validate issuance input').first().json.clientRecordId + \"'\" }}");
nodes[nodes.length-1]=nodes[nodes.length-1].replace(/,?"onError":"continueErrorOutput",?/g, m => m.startsWith(',') && m.endsWith(',') ? ',' : '');
code('check','Verify issuance client',"if($('Issue customer portal access').all().length!==1) fail(); const c=clientScope($input.all().map(i=>i.json),$('Validate issuance input').first().json.clientRecordId); return [{json:{clientRecordId:c.clientRecordId}}];");
nodes[nodes.length-1]=nodes[nodes.length-1].replace(/,?"onError":"continueErrorOutput",?/g, m => m.startsWith(',') && m.endsWith(',') ? ',' : '');
add('random','n8n-nodes-base.crypto',2,'Generate random access token',{action:'generate',encodingType:'base64',stringLength:43,dataPropertyName:'data'});
add('token','n8n-nodes-base.set',3.5,'Encode URL-safe access token',{mode:'raw',jsonOutput:ex("{{ (() => { const t=$('Generate random access token').first().json.data; if(typeof t!=='string') throw new Error('token_generation_failed'); const token=t.replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,''); if(!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('invalid_token_entropy'); return {token}; })() }}"),options:{}});
add('hash','n8n-nodes-base.crypto',2,'Hash issued token',{action:'hash',type:'SHA256',binaryData:false,value:ex("{{ $('Encode URL-safe access token').first().json.token }}"),dataPropertyName:'tokenHash',encoding:'hex'});
const values={tokenHash:ex("{{ $('Hash issued token').first().json.tokenHash }}"),clientRecordId:ex("{{ $('Validate issuance input').first().json.clientRecordId }}"),expiresAt:ex("{{ $('Validate issuance input').first().json.expiresAt }}"),revokedAt:ex('{{ null }}'),scope:'portal:read'};
add('save','n8n-nodes-base.dataTable',1.1,'Store hashed access grant',{resource:'row',operation:'insert',dataTableId:{__rl:true,mode:'id',value:registry},columns:{mappingMode:'defineBelow',value:values,schema:Object.keys(values).map(id=>({id,displayName:id,required:false,defaultMatch:false,display:true,type:id.endsWith('At')?'date':'string',canBeUsedToMatch:true}))},options:{}});
add('result','n8n-nodes-base.set',3.5,'Return issued access token',{mode:'raw',jsonOutput:ex("{{ (() => { const saved=$('Store hashed access grant').first().json; const expected=$('Validate issuance input').first().json; const hash=$('Hash issued token').first().json.tokenHash; if(!saved.id||saved.tokenHash!==hash||saved.clientRecordId!==expected.clientRecordId||saved.scope!=='portal:read'||Date.parse(saved.expiresAt)!==Date.parse(expected.expiresAt)||saved.revokedAt!==null) throw new Error('grant_persistence_failed'); return {token:$('Encode URL-safe access token').first().json.token,expiresAt:expected.expiresAt,grantId:saved.id}; })() }}"),options:{}});
const issuer=prelude+nodes.join('\n')+"\nexport default workflow('schulze-portal-issuer','Schulze Portal · Issue customer access').add(start).to(input).to(client).to(check).to(random).to(token).to(hash).to(save).to(result).add(sticky('### Private issuance only\\nCaller must resolve the canonical Airtable client internally. Input: clientRecordId and expiresAt (maximum 366 days). Returns a one-time token and grantId; only its SHA-256 digest is stored.\\nDisable execution payload persistence on every caller. Revoke a grant by setting revokedAt in schulzePortalGrants. No public issuance webhook.',[],{color:2}));";
writeFileSync(new URL('issuer.sdk.js',import.meta.url),issuer);
console.log('Generated bootstrap.sdk.js and issuer.sdk.js for '+origin);
