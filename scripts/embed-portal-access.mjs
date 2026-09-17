import { readFileSync, writeFileSync } from 'node:fs';
import { discoverPortalAccess, normalizePortalAccess } from '../backend/n8n/access.js';
const path='backend/n8n/sync.sdk.js';
let s=readFileSync(path,'utf8');
s=s.replace('trigger, newCredential','trigger, ifElse, newCredential');
const discoverCode=`const discoverPortalAccess = ${discoverPortalAccess.toString()};\nreturn [{json:discoverPortalAccess($input.first().json)}];`;
const definitions=`// BEGIN GENERATED ACCESS NODES
const snapshotStart = node({type:'n8n-nodes-base.code',version:2,config:{name:'Begin ordered portal snapshot',position:[150,220],parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode:'return [{json:{snapshotStartedAt:new Date().toISOString()}}];'}},output:[{snapshotStartedAt:'2026-09-17T00:00:00.000Z'}]});
const accessSchema = node({
 type:'n8n-nodes-base.httpRequest',version:4.5,
 config:{name:'Discover portal access schema',executeOnce:true,position:[1340,220],
  parameters:{method:'GET',url:'https://api.airtable.com/v0/meta/bases/appAutw0Fvsuk2pfJ/tables',authentication:'predefinedCredentialType',nodeCredentialType:'airtableTokenApi',options:{redirect:{redirect:{followRedirects:false}},response:{response:{responseFormat:'json'}},timeout:20000}},
  credentials:{airtableTokenApi:airtable}},output:[{tables:[]}]});
const accessDiscovery = node({type:'n8n-nodes-base.code',version:2,
 config:{name:'Validate portal access schema',position:[1600,220],parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode:${JSON.stringify(discoverCode)}}},
 output:[{status:'ready',tableId:'tblAAAAAAAAAAAAAA'}]});
const accessReady = ifElse({version:2.2,config:{name:'Portal access table ready',position:[1860,220],parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict'},conditions:[{leftValue:expr('{{ $json.status }}'),operator:{type:'string',operation:'equals'},rightValue:'ready'}],combinator:'and'},options:{}}}});
const accessRows = node({type:'n8n-nodes-base.airtable',version:2.2,
 config:{name:'Read portal access',executeOnce:true,alwaysOutputData:true,position:[2120,120],
  notes:'Read all pages, including inactive grants. Empty success deliberately revokes all explicit grants; API failures stop before replacement.',
  parameters:{authentication:'airtableTokenApi',base,resource:'record',operation:'search',table:{__rl:true,mode:'id',value:expr('{{ $json.tableId }}')},returnAll:true,options:{fields:['Email','Role','Client','Active']}},
  credentials:{airtableTokenApi:airtable}},output:[{}]});
// END GENERATED ACCESS NODES
`;
if(s.includes('// BEGIN GENERATED ACCESS NODES')) s=s.replace(/\/\/ BEGIN GENERATED ACCESS NODES[\s\S]*?\/\/ END GENERATED ACCESS NODES\n/,definitions);
else s=s.replace('const buildSnapshot = node({',definitions+'\nconst buildSnapshot = node({');
const logic=`// BEGIN GENERATED ACCESS LOGIC\nconst normalizePortalAccess = ${normalizePortalAccess.toString()};
const snapshotStartedAt=$('Begin ordered portal snapshot').first().json.snapshotStartedAt;
const discovery=$('Validate portal access schema').first().json;
const accessInput=discovery.status==='ready'?$('Read portal access').all().map(i=>i.json):[];
const {access,accessDiagnostics}=normalizePortalAccess(accessInput,clients.map(c=>c.airtableClientId));
// END GENERATED ACCESS LOGIC\n`;
const escaped=logic.replaceAll('\\','\\\\').replaceAll('`','\\`').replaceAll('${','\\${');
if(s.includes('// BEGIN GENERATED ACCESS LOGIC')) s=s.replace(/\/\/ BEGIN GENERATED ACCESS LOGIC[\s\S]*?\/\/ END GENERATED ACCESS LOGIC\n/,escaped);
else s=s.replace('return [{json:{clients,leads:normalizedLeads,',escaped+'return [{json:{clients,leads:normalizedLeads,access,accessDiagnostics,accessStatus:discovery.status,accessTableId:discovery.tableId,');
s=s.replace('.to(people).to(buildSnapshot).to(replaceSnapshot).to(validateAck);',`.to(people).to(accessSchema).to(accessDiscovery).to(accessReady.onTrue(accessRows.to(buildSnapshot)).onFalse(buildSnapshot))
  .add(buildSnapshot).to(replaceSnapshot).to(validateAck);`);
s=s.replace('position: [1340, 220]','position: [2380, 220]').replace('position: [1600, 220]','position: [2640, 220]').replace('position: [1860, 220]','position: [2900, 220]');
s=s.replace('.add(manual).to(clients)', '.add(manual).to(snapshotStart)').replace('.add(schedule).to(clients)', '.add(schedule).to(snapshotStart)');
if(!s.includes('.add(snapshotStart).to(clients)')) s=s.replace('.add(clients).to(targets)', '.add(snapshotStart).to(clients)\n  .add(clients).to(targets)');
s=s.replace('access,accessDiagnostics,accessStatus:', 'access,accessDiagnostics,snapshotStartedAt,accessStatus:');
writeFileSync(path,s);
